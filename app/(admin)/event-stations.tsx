import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
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
  Sheet,
} from "@/components/admin/ui";

interface Station {
  id: number;
  name: string | null;
  miles: number | null;
  km: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  isActive?: boolean | null;
  stationRaceTypes?: { raceType?: { id: number; name: string | null } | null }[];
}

const BLANK = { name: "", miles: "", latitude: "", longitude: "" };

/**
 * Liberation points, sorted by how far out they are.
 *
 * Distance is the ordering because that is how a season is built — short
 * trainers first, then out. Coordinates open the phone's map app rather than
 * being drawn here: somebody looking at this on the road wants directions, and
 * an embedded map is the slowest possible way to get them.
 *
 * Adding one from the phone is the point of having it here at all. A station
 * gets fixed when somebody is standing at it, and typing the coordinates off a
 * handset beats writing them on paper to key in later.
 */
export default function EventStations() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const base = eventId ? `/admin/event/${eventId}/stations` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    stations?: Station[];
  }>(base, [eventId]);

  const stations = data?.stations ?? [];
  const mayManage = can("stations.manage");

  const [editing, setEditing] = useState<Station | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [removing, setRemoving] = useState<Station | null>(null);

  if (forbidden) return <NoAccess what="Stations" />;

  const openMap = (s: Station) => {
    if (s.latitude == null || s.longitude == null) return;
    Linking.openURL(`https://maps.google.com/?q=${s.latitude},${s.longitude}`);
  };

  const startNew = () => {
    setForm(BLANK);
    setEditing("new");
  };

  const startEdit = (s: Station) => {
    setForm({
      name: s.name ?? "",
      miles: s.miles != null ? String(s.miles) : "",
      latitude: s.latitude != null ? String(s.latitude) : "",
      longitude: s.longitude != null ? String(s.longitude) : "",
    });
    setEditing(s);
  };

  /** Empty stays empty; a value that is not a number is a mistake worth naming. */
  const num = (raw: string): number | null | undefined => {
    const t = raw.trim();
    if (!t) return null;
    const v = parseFloat(t);
    return isNaN(v) ? undefined : v;
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Give the station a name.");
      return;
    }
    const miles = num(form.miles);
    const latitude = num(form.latitude);
    const longitude = num(form.longitude);
    if (miles === undefined || latitude === undefined || longitude === undefined) {
      toast.error("Distance and coordinates have to be numbers.");
      return;
    }
    if ((latitude == null) !== (longitude == null)) {
      toast.error("A coordinate needs both halves.");
      return;
    }

    const body = {
      name: form.name.trim(),
      miles,
      // The portal stores both units; kilometres are derived so the two agree.
      km: miles != null ? Math.round(miles * 1.609344 * 100) / 100 : null,
      latitude,
      longitude,
      isActive: true,
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
      success: "Station removed.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  return (
    <Screen
      title="Stations"
      subtitle={
        name
          ? `${name} · ${stations.length} liberation points`
          : `${stations.length} liberation points`
      }
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        mayManage ? (
          <ButtonRow>
            <Button label="New station" icon="add" onPress={startNew} />
          </ButtonRow>
        ) : null
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4" style={{ gap: 10 }}>
            {stations.length === 0 ? (
              <Empty>No liberation points have been set up for this season.</Empty>
            ) : (
              stations.map((s) => {
                const types = (s.stationRaceTypes ?? [])
                  .map((t) => t.raceType?.name)
                  .filter(Boolean)
                  .join(", ");
                const hasCoords = s.latitude != null && s.longitude != null;
                return (
                  <View key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="min-w-0 flex-1">
                        <Text className="font-medium text-slate-900">
                          {s.name ?? `Station ${s.id}`}
                        </Text>
                        {s.address ? (
                          <Text className="mt-0.5 text-xs text-slate-500">{s.address}</Text>
                        ) : null}
                        {types ? <Text className="mt-1 text-xs text-slate-400">{types}</Text> : null}
                      </View>
                      <Text className="text-lg font-bold text-slate-900">
                        {s.miles != null ? `${Math.round(s.miles)} mi` : "—"}
                      </Text>
                    </View>

                    <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                      {hasCoords && (
                        <Pressable
                          onPress={() => openMap(s)}
                          className="flex-row items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5"
                        >
                          <Ionicons name="navigate-outline" size={14} color="#2563eb" />
                          <Text className="text-xs font-medium text-blue-600">Directions</Text>
                        </Pressable>
                      )}
                      {mayManage ? (
                        <>
                          <Pressable
                            onPress={() => startEdit(s)}
                            className="flex-row items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5"
                          >
                            <Ionicons name="create-outline" size={14} color="#475569" />
                            <Text className="text-xs font-medium text-slate-600">Edit</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setRemoving(s)}
                            className="flex-row items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5"
                          >
                            <Ionicons name="trash-outline" size={14} color="#475569" />
                            <Text className="text-xs font-medium text-slate-600">Delete</Text>
                          </Pressable>
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New station" : "Edit station"}
        subtitle="Distance is what orders the season"
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Marathon"
          autoFocus
        />
        <Field
          label="Distance (miles)"
          value={form.miles}
          onChange={(v) => setForm({ ...form, miles: v })}
          keyboard="decimal-pad"
          hint="Kilometres are worked out from this."
        />
        <Field
          label="Latitude"
          value={form.latitude}
          onChange={(v) => setForm({ ...form, latitude: v })}
          keyboard="decimal-pad"
          placeholder="26.7056"
        />
        <Field
          label="Longitude"
          value={form.longitude}
          onChange={(v) => setForm({ ...form, longitude: v })}
          keyboard="decimal-pad"
          placeholder="-80.0364"
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button label="Save" onPress={save} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Remove ${removing?.name ?? "this station"}?`}
        body="Races already flown from it keep their record. It stops being offered for new ones."
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
