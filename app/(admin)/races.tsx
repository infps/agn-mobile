import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { EventPicker } from "@/components/admin/EventPicker";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Confirm,
  Field,
  Sheet,
} from "@/components/admin/ui";

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
  distance: number | null;
  location: string | null;
  transportStatus: string | null;
  isLive: boolean;
  raceType?: { name?: string | null } | null;
}

const STATUS_TONE: Record<string, { bg: string; text: string; label: string }> = {
  STARTED: { bg: "bg-emerald-100", text: "text-emerald-700", label: "in the air" },
  REGISTERING: { bg: "bg-blue-100", text: "text-blue-700", label: "taking entries" },
  ENDED: { bg: "bg-slate-200", text: "text-slate-600", label: "ended" },
};

/**
 * Races for one event.
 *
 * Ordered live-first rather than by date: a race in the air is the only one
 * anybody needs to reach in a hurry, and scrolling past a season of finished
 * races to find it is exactly the friction this screen exists to remove.
 *
 * A race is created with the handful of things that have to be decided up
 * front — which type, which liberation point, when, how far. Weather and
 * arrival conditions are filled in on the race itself as the day goes, so they
 * are not asked for here; an empty field somebody has to come back to is worse
 * than no field at all.
 */
export default function AdminRaces() {
  const { can } = usePermissions();
  const { isWide, isMedium, gutter } = useResponsive();
  const router = useRouter();
  const toast = useToast();
  const action = useAdminAction();

  const [editing, setEditing] = useState<Race | "new" | null>(null);
  const [removing, setRemoving] = useState<Race | null>(null);
  const [form, setForm] = useState({
    name: "",
    raceNumber: "",
    distance: "",
    location: "",
    startTime: "",
    raceTypeId: null as number | null,
    raceStationId: null as number | null,
  });

  const [eventId, setEventId] = useState<number | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (eventId == null) return;
    setError(null);
    try {
      // The admin list carries private races too, which the breeder list hides.
      const { data } = await api.get(`/admin/race?eventId=${eventId}`);
      setRaces(data?.races ?? []);
    } catch {
      setError("Could not load races for this event.");
      setRaces([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const rank = (r: Race) =>
    r.status === "STARTED" ? 0 : r.status === "REGISTERING" ? 1 : 2;

  const canManage = can("races.manage");

  // Both lists are only needed while a race is being written, so they are
  // fetched then rather than on every visit to the list.
  const typesReq = useAdminData<{ raceTypes?: { id: number; name: string | null }[] }>(
    editing != null ? "/admin/race-type" : null,
    [editing != null]
  );
  const stationsReq = useAdminData<{ stations?: { id: number; name: string | null; miles: number | null }[] }>(
    editing != null && eventId != null ? `/admin/event/${eventId}/stations` : null,
    [editing != null, eventId]
  );

  const typeChoices: Choice[] = (typesReq.data?.raceTypes ?? []).map((t) => ({
    key: t.id,
    label: t.name ?? `Type ${t.id}`,
  }));
  const stationChoices: Choice[] = (stationsReq.data?.stations ?? []).map((s) => ({
    key: s.id,
    label: s.name ?? `Station ${s.id}`,
    hint: s.miles != null ? `${Math.round(s.miles)} mi` : null,
  }));

  const startNew = () => {
    setForm({
      name: "",
      raceNumber: "",
      distance: "",
      location: "",
      startTime: "",
      raceTypeId: null,
      raceStationId: null,
    });
    setEditing("new");
  };

  const startEdit = (race: Race) => {
    setForm({
      name: race.name ?? "",
      raceNumber: race.raceNumber != null ? String(race.raceNumber) : "",
      distance: race.distance != null ? String(race.distance) : "",
      location: race.location ?? "",
      // Kept as the date part only: a liberation time is set on the day from
      // the race screen, and asking for one here invites a guess.
      startTime: race.startTime ? race.startTime.slice(0, 10) : "",
      raceTypeId: null,
      raceStationId: null,
    });
    setEditing(race);
  };

  const saveRace = async () => {
    if (!form.name.trim() && !form.raceNumber.trim()) {
      toast.error("Give the race a name or a number.");
      return;
    }
    const isNew = editing === "new";
    if (isNew && form.raceTypeId == null) {
      toast.error("Pick the race type.");
      return;
    }

    const num = (raw: string) => {
      const t = raw.trim();
      if (!t) return null;
      const v = parseFloat(t);
      return isNaN(v) ? null : v;
    };

    const shared = {
      name: form.name.trim() || null,
      raceNumber: num(form.raceNumber),
      distance: num(form.distance),
      location: form.location.trim() || null,
      startTime: form.startTime.trim() ? new Date(form.startTime.trim()).toISOString() : null,
      ...(form.raceStationId != null ? { raceStationId: form.raceStationId } : {}),
    };

    const { ok } = await action.run(
      isNew ? "post" : "put",
      "/admin/race",
      isNew
        ? { ...shared, eventId, raceTypeId: form.raceTypeId }
        : { raceId: (editing as Race).id, ...shared },
      { success: isNew ? "Race created." : "Race updated." }
    );
    if (ok) {
      setEditing(null);
      load();
    }
  };

  const removeRace = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", "/admin/race", { raceId: removing.id }, {
      success: "Race deleted.",
    });
    if (ok) {
      setRemoving(null);
      load();
    }
  };

  const visible = races
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (r.name ?? "").toLowerCase().includes(q) ||
        String(r.raceNumber ?? "").includes(q) ||
        (r.location ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => rank(a) - rank(b) || (b.raceNumber ?? 0) - (a.raceNumber ?? 0));

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">Races</Text>

      <View className="mt-3">
        <EventPicker value={eventId} onChange={(id) => setEventId(id)} />
      </View>

      {canManage && eventId != null ? (
        <ButtonRow>
          <Button label="New race" icon="add" onPress={startNew} />
        </ButtonRow>
      ) : null}

      <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
        <Ionicons name="search" size={16} color="#94a3b8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Race name, number or launch point"
          placeholderTextColor="#94a3b8"
          className="flex-1 py-2.5 text-sm text-slate-900"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView
          className="mt-3 flex-1"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        >
          {error && (
            <View className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">{error}</Text>
            </View>
          )}

          {visible.length === 0 ? (
            <View className="rounded-xl border border-slate-200 bg-white p-8">
              <Text className="text-center text-sm text-slate-500">
                {races.length === 0
                  ? "This event has no races yet."
                  : "No race matches that search."}
              </Text>
            </View>
          ) : (
            <View className={isWide || isMedium ? "flex-row flex-wrap" : ""} style={{ gap: 10 }}>
              {visible.map((race) => {
                const tone = STATUS_TONE[race.status] ?? STATUS_TONE.ENDED;
                return (
                  <Pressable
                    key={race.id}
                    onPress={() =>
                      router.push(`/(admin)/race-detail?raceId=${race.id}` as never)
                    }
                    // Editing is the rarer intent, so it sits behind a hold
                    // rather than taking a tap target away from opening the
                    // race — which is what somebody is doing on a race day.
                    onLongPress={canManage ? () => startEdit(race) : undefined}
                    delayLongPress={400}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    style={{
                      flexGrow: 1,
                      flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%",
                    }}
                  >
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="flex-1">
                        <Text className="font-semibold text-slate-900">
                          {race.name || `Race ${race.raceNumber ?? race.id}`}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {race.raceType?.name ?? "Race"}
                          {race.distance ? ` · ${race.distance} mi` : ""}
                        </Text>
                      </View>
                      <View className={`rounded-full px-2 py-0.5 ${tone.bg}`}>
                        <Text className={`text-[10px] font-medium ${tone.text}`}>
                          {tone.label}
                        </Text>
                      </View>
                    </View>

                    <Text className="mt-2 text-xs text-slate-500">
                      {race.startTime
                        ? new Date(race.startTime).toLocaleString()
                        : "Not scheduled"}
                    </Text>
                    {race.location && (
                      <Text className="mt-0.5 text-xs text-slate-400">{race.location}</Text>
                    )}
                    {race.transportStatus && race.transportStatus !== "IDLE" && (
                      <Text className="mt-1 text-xs text-amber-600">
                        Transport {race.transportStatus.toLowerCase().replace(/_/g, " ")}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {!canManage && races.length > 0 && (
            <Text className="mt-4 text-center text-xs text-slate-400">
              You can see these races but not change them.
            </Text>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New race" : "Edit race"}
        subtitle="Weather and arrival conditions are filled in on the day"
      >
        {editing === "new" ? (
          <>
            <Text className="mb-1 mt-3 text-xs font-medium text-slate-600">Race type</Text>
            <ChoiceList
              choices={typeChoices}
              selected={form.raceTypeId}
              onPick={(k) => setForm({ ...form, raceTypeId: Number(k) })}
              empty="No race types are set up."
            />
          </>
        ) : null}

        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Week 3"
        />
        <Field
          label="Race number"
          value={form.raceNumber}
          onChange={(v) => setForm({ ...form, raceNumber: v })}
          keyboard="numeric"
        />
        <Field
          label="Date"
          value={form.startTime}
          onChange={(v) => setForm({ ...form, startTime: v })}
          placeholder="YYYY-MM-DD"
          hint="The liberation time is set from the race screen on the day."
        />
        <Field
          label="Distance (miles)"
          value={form.distance}
          onChange={(v) => setForm({ ...form, distance: v })}
          keyboard="decimal-pad"
        />
        <Field
          label="Launch point"
          value={form.location}
          onChange={(v) => setForm({ ...form, location: v })}
        />

        {stationChoices.length > 0 ? (
          <>
            <Text className="mb-1 mt-3 text-xs font-medium text-slate-600">
              Or pick a station
            </Text>
            <ChoiceList
              choices={stationChoices}
              selected={form.raceStationId}
              onPick={(k) => {
                const picked = (stationsReq.data?.stations ?? []).find((s) => s.id === Number(k));
                setForm({
                  ...form,
                  raceStationId: Number(k),
                  location: picked?.name ?? form.location,
                  distance: picked?.miles != null ? String(picked.miles) : form.distance,
                });
              }}
            />
          </>
        ) : null}

        <ButtonRow>
          {editing !== "new" && editing != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const race = editing as Race;
                setEditing(null);
                setRemoving(race);
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          )}
          <Button label="Save" onPress={saveRace} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Delete ${removing?.name || `race ${removing?.raceNumber ?? ""}`}?`}
        body="Entries, arrivals and results recorded against it go with it. A race that has been flown should be kept, not deleted."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={removeRace}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}
