import React, { useMemo, useState } from "react";
import { Linking, Pressable, Switch, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Screen,
  SearchBar,
} from "@/components/admin/ui";
import { StationsMap } from "@/components/admin/StationsMap";
import { Caption, Pill } from "@/components/admin/scan";

interface StationType {
  raceTypeId: number;
  raceType?: { id: number; name: string | null; color?: string | null } | null;
}

interface Station {
  id: number;
  name: string;
  miles: number | null;
  km: number | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  stationRaceTypes?: StationType[];
}

const BLANK = { name: "", coords: "", miles: "", km: "", isActive: true };

/** The portal's fallback palette, so an uncoloured type is the same colour here. */
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
];

function typeColor(t: StationType): string {
  if (t.raceType?.color) return t.raceType.color;
  return PALETTE[((t.raceTypeId % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/** Black or white, whichever stays readable on the colour. */
function inkOn(bg: string): string {
  const h = bg.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const lum =
    (0.299 * parseInt(h.slice(0, 2), 16) +
      0.587 * parseInt(h.slice(2, 4), 16) +
      0.114 * parseInt(h.slice(4, 6), 16)) /
    255;
  return lum > 0.6 ? "#000000" : "#ffffff";
}

/**
 * Great-circle distance, rounded as the portal rounds it. The server works the
 * same figure out when no distance is sent; this is the preview of it.
 */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { km: Math.round(km * 100) / 100, miles: Math.round((km / 1.609344) * 100) / 100 };
}

/** "22.5718, 88.4617" or "22.5718 88.4617" → a point, or nothing. */
function parseCoords(raw: string): { lat: number; lng: number } | null {
  const parts = raw.trim().split(/[\s,]+/);
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Liberation points, on the map and in a list sorted by how far out they are.
 *
 * Distance is the ordering because that is how a season is built — short
 * trainers first, then out. The map and the list are two views of one
 * selection: tap a pin and its row is the one with the buttons, tap a row and
 * the map goes to its pin.
 *
 * Adding one from the phone is the point of having it here at all. A station
 * gets fixed when somebody is standing at it, so the form is a map you tap —
 * or a coordinate pasted from whatever said where you are — and the distance
 * from the loft fills itself in, still open to correction.
 *
 * The form takes over the screen rather than sliding up as a sheet, because a
 * map inside a sheet that closes on a downward swipe cannot be panned south.
 */
export default function EventStations() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const base = eventId ? `/admin/event/${eventId}/stations` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    stations?: Station[];
  }>(base, [eventId]);

  // The loft's own position: what distances are measured from.
  const mayEvent = canAny("events.view", "events.manage");
  const eventReq = useAdminData<{
    event?: { name: string | null; latitude: number | null; longitude: number | null };
  }>(eventId && mayEvent ? `/admin/event?eventId=${eventId}` : null, [eventId]);

  const stations = useMemo(() => data?.stations ?? [], [data]);
  const ev = eventReq.data?.event;
  const loft =
    ev?.latitude != null && ev?.longitude != null
      ? { lat: ev.latitude, lng: ev.longitude, name: ev.name ?? "Event" }
      : null;
  // Known to be missing — as opposed to simply not readable by this person.
  const loftMissing =
    mayEvent && !eventReq.loading && !eventReq.forbidden && !eventReq.error && !loft;

  const [query, setQuery] = useState("");
  const [typeTab, setTypeTab] = useState<"all" | "untyped" | number>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Station | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [removing, setRemoving] = useState<Station | null>(null);

  const present = useMemo(() => {
    const types = new Map<number, { id: number; name: string; color: string }>();
    let untyped = false;
    for (const s of stations) {
      const list = s.stationRaceTypes ?? [];
      if (list.length === 0) untyped = true;
      for (const t of list) {
        if (!types.has(t.raceTypeId)) {
          types.set(t.raceTypeId, {
            id: t.raceTypeId,
            name: t.raceType?.name ?? `Type ${t.raceTypeId}`,
            color: typeColor(t),
          });
        }
      }
    }
    return { types: [...types.values()], untyped };
  }, [stations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations.filter((s) => {
      const list = s.stationRaceTypes ?? [];
      if (typeTab === "untyped" && list.length > 0) return false;
      if (typeof typeTab === "number" && !list.some((t) => t.raceTypeId === typeTab)) return false;
      return !q || s.name.toLowerCase().includes(q);
    });
  }, [stations, query, typeTab]);

  // The route guards even the list with stations.manage, so anybody who can see
  // this screen can also change it; there is no read-only audience to hide from.
  if (forbidden) return <NoAccess what="Stations" />;

  const startNew = () => {
    setForm(BLANK);
    setPoint(null);
    setEditing("new");
  };

  const startEdit = (s: Station) => {
    const has = s.latitude != null && s.longitude != null;
    setForm({
      name: s.name ?? "",
      coords: has ? `${s.latitude}, ${s.longitude}` : "",
      miles: s.miles != null ? String(s.miles) : "",
      km: s.km != null ? String(s.km) : "",
      isActive: s.isActive ?? true,
    });
    setPoint(has ? { lat: s.latitude as number, lng: s.longitude as number } : null);
    setEditing(s);
  };

  /** A point chosen: remember it, and fill the distance from the loft. */
  const pick = (lat: number, lng: number) => {
    const fixed = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    setPoint(fixed);
    setForm((f) => {
      const next = { ...f, coords: `${fixed.lat}, ${fixed.lng}` };
      if (loft) {
        const d = haversine(loft.lat, loft.lng, fixed.lat, fixed.lng);
        next.miles = String(d.miles);
        next.km = String(d.km);
      }
      return next;
    });
  };

  const applyCoords = () => {
    if (!form.coords.trim()) return;
    const parsed = parseCoords(form.coords);
    if (!parsed) {
      toast.error("Invalid coordinates — write them as 'lat, lng'.");
      return;
    }
    pick(parsed.lat, parsed.lng);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Station name required.");
      return;
    }
    // Typed but not yet applied counts: nobody should lose a pasted coordinate
    // to not having pressed the button.
    const typed = form.coords.trim() ? parseCoords(form.coords) : null;
    if (form.coords.trim() && !typed) {
      toast.error("Invalid coordinates — write them as 'lat, lng'.");
      return;
    }
    const where = typed ?? point;
    if (!where) {
      toast.error("Pick a point on the map, or paste its coordinates.");
      return;
    }
    const miles = form.miles.trim() === "" ? null : Number(form.miles);
    const km = form.km.trim() === "" ? null : Number(form.km);
    if ((miles != null && isNaN(miles)) || (km != null && isNaN(km))) {
      toast.error("Distances have to be numbers.");
      return;
    }

    const body = {
      name: form.name.trim(),
      // Both left empty tells the server to measure it from the loft itself.
      miles,
      km,
      latitude: where.lat,
      longitude: where.lng,
      isActive: form.isActive,
    };

    const { ok } =
      editing === "new"
        ? await action.run("post", base!, body, { success: "Station added." })
        : await action.run("put", `${base}/${(editing as Station).id}`, body, {
            success: "Station updated.",
          });

    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}/${removing.id}`, undefined, {
      success: "Station deleted.",
    });
    if (ok) {
      setRemoving(null);
      setSelectedId(null);
      reload();
    }
  };

  /* ---------- the form ---------- */

  if (editing != null) {
    return (
      <Screen
        title={editing === "new" ? "Add station" : "Edit station"}
        subtitle={name ?? undefined}
        header={
          <Pressable onPress={() => setEditing(null)} className="flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={16} color="#2563eb" />
            <Text className="text-sm font-medium text-blue-600">Stations</Text>
          </Pressable>
        }
      >
        <Field
          label="Station name *"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="e.g. HWY95 ROME SW"
        />

        <Caption>Release point *</Caption>
        <Text className="mb-2 text-xs text-slate-500">
          Tap the map to set the release point.
          {loft ? " Distance fills in from the event location." : ""}
        </Text>
        <StationsMap base={loft} picked={point} onPick={pick} height={300} />

        <Field
          label="Or paste coordinates"
          value={form.coords}
          onChange={(v) => setForm({ ...form, coords: v })}
          placeholder="e.g. 22.5718, 88.4617"
        />
        <View className="mt-2 flex-row">
          <Button
            label="Use these coordinates"
            tone="secondary"
            icon="locate-outline"
            onPress={applyCoords}
          />
        </View>

        <View className="flex-row" style={{ gap: 10 }}>
          <View className="flex-1">
            <Field
              label="Miles (override)"
              value={form.miles}
              onChange={(v) => setForm({ ...form, miles: v })}
              keyboard="decimal-pad"
            />
          </View>
          <View className="flex-1">
            <Field
              label="Kilometres (override)"
              value={form.km}
              onChange={(v) => setForm({ ...form, km: v })}
              keyboard="decimal-pad"
            />
          </View>
        </View>
        <Text className="mt-1 text-xs text-slate-400">
          Leave both empty and the server measures the distance from the loft.
        </Text>

        <View className="mt-4 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-medium text-slate-800">Active</Text>
            <Text className="text-xs text-slate-500">Show this station as available.</Text>
          </View>
          <Switch value={form.isActive} onValueChange={(v) => setForm({ ...form, isActive: v })} />
        </View>

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button
            label={editing === "new" ? "Add" : "Save"}
            onPress={save}
            pending={action.pending}
            full
          />
        </ButtonRow>
      </Screen>
    );
  }

  /* ---------- the list ---------- */

  const chip = (key: "all" | "untyped" | number, label: string, color?: string) => {
    const on = typeTab === key;
    return (
      <Pressable
        key={String(key)}
        onPress={() => setTypeTab(key)}
        className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
          on && !color ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
        }`}
        style={on && color ? { backgroundColor: color, borderColor: color } : undefined}
      >
        {color ? (
          <View
            className="h-2.5 w-2.5 rounded-full border border-white"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <Text
          className={`text-xs font-medium ${on && !color ? "text-white" : "text-slate-600"}`}
          style={on && color ? { color: inkOn(color) } : undefined}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Screen
      title="Release station map"
      subtitle={`${name ? `${name} · ` : ""}${stations.length} station${
        stations.length === 1 ? "" : "s"
      } available`}
      onRefresh={() => {
        refresh();
        eventReq.reload();
      }}
      refreshing={refreshing}
      header={
        <ButtonRow>
          <Button label="Add station" icon="add" onPress={startNew} disabled={loftMissing} />
        </ButtonRow>
      }
    >
      {loftMissing ? (
        <Notice>
          Set the event location when editing the event first — station distances are measured
          from it.
        </Notice>
      ) : null}

      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4">
            <StationsMap
              base={loft}
              stations={filtered
                .filter((s) => s.latitude != null && s.longitude != null)
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  lat: s.latitude as number,
                  lng: s.longitude as number,
                  miles: s.miles,
                  color: s.stationRaceTypes?.[0] ? typeColor(s.stationRaceTypes[0]) : undefined,
                }))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              height={300}
            />
          </View>

          <View className="mt-3">
            <SearchBar value={query} onChange={setQuery} placeholder="Search stations…" />
          </View>
          <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
            {chip("all", "All")}
            {present.types.map((t) => chip(t.id, t.name, t.color))}
            {present.untyped ? chip("untyped", "Untyped") : null}
          </View>

          <View className="mt-3" style={{ gap: 10 }}>
            {filtered.length === 0 ? (
              <Empty>
                {stations.length === 0
                  ? "No liberation points have been set up for this season."
                  : "No stations match that."}
              </Empty>
            ) : (
              filtered.map((s) => {
                const on = selectedId === s.id;
                const hasCoords = s.latitude != null && s.longitude != null;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelectedId(on ? null : s.id)}
                    className={`rounded-xl border bg-white p-4 ${
                      on ? "border-blue-500" : "border-slate-200"
                    }`}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="min-w-0 flex-1">
                        <Text className="font-medium text-slate-900">{s.name}</Text>
                        <View className="mt-1 flex-row flex-wrap items-center" style={{ gap: 6 }}>
                          {(s.stationRaceTypes ?? []).map((t) => {
                            const c = typeColor(t);
                            return (
                              <View
                                key={t.raceTypeId}
                                className="rounded px-1.5 py-0.5"
                                style={{ backgroundColor: c }}
                              >
                                <Text className="text-[10px] font-medium" style={{ color: inkOn(c) }}>
                                  {t.raceType?.name ?? `Type ${t.raceTypeId}`}
                                </Text>
                              </View>
                            );
                          })}
                          <Pill
                            label={s.isActive ? "active" : "inactive"}
                            tone={s.isActive ? "green" : "slate"}
                          />
                          {!hasCoords ? <Pill label="no coordinates" tone="amber" /> : null}
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="text-lg font-bold text-slate-900">
                          {s.miles != null ? `${s.miles.toFixed(2)} mi` : "— mi"}
                        </Text>
                        {s.km != null ? (
                          <Text className="text-xs text-slate-400">{s.km.toFixed(2)} km</Text>
                        ) : null}
                      </View>
                    </View>

                    {on ? (
                      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                        <Button
                          label="Edit"
                          tone="secondary"
                          icon="create-outline"
                          onPress={() => startEdit(s)}
                        />
                        <Button
                          label="Delete"
                          tone="secondary"
                          icon="trash-outline"
                          onPress={() => setRemoving(s)}
                        />
                        {hasCoords ? (
                          <Button
                            label="Directions"
                            tone="secondary"
                            icon="navigate-outline"
                            onPress={() =>
                              Linking.openURL(
                                `https://maps.google.com/?q=${s.latitude},${s.longitude}`
                              )
                            }
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
          <Text className="mt-3 text-center text-xs text-slate-400">
            Showing {filtered.length} of {stations.length} stations
          </Text>
        </>
      )}

      <Confirm
        open={removing != null}
        title="Delete station?"
        body={`"${removing?.name ?? ""}" will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
