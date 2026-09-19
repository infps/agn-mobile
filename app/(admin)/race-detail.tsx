import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
  endTime: string | null;
  distance: number | null;
  location: string | null;
  weather: string | null;
  wind: string | null;
  temperature: string | null;
  transportStatus: string | null;
  isLive: boolean;
  raceType?: { name?: string | null } | null;
  seasonRel?: { event?: { id: number; name: string | null } | null } | null;
}

interface RaceItem {
  id: number;
  status: string;
  birdPosition: number | null;
  birdPositionHotSpot: number | null;
  prizeValue: number | null;
  arrivalTime: string | null;
  bird?: {
    band?: string | null;
    birdName?: string | null;
    breeder?: { firstName?: string | null; lastName?: string | null } | null;
  };
  eventInventoryItem?: { eventInventory?: { loft?: string | null } | null };
}

/**
 * One race, with the controls that move it through its day.
 *
 * The buttons are deliberately few. Everything here changes the state of a race
 * that people are watching, and liberating or ending a race cannot be undone
 * from a phone, so each of those asks first. Anything that needs a desk and a
 * spreadsheet stays in the portal.
 */
export default function AdminRaceDetail() {
  const { raceId } = useLocalSearchParams<{ raceId?: string }>();
  const { can } = usePermissions();
  const { isWide, gutter } = useResponsive();
  const router = useRouter();

  const [race, setRace] = useState<Race | null>(null);
  const [items, setItems] = useState<RaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!raceId) return;
    setError(null);
    try {
      const [raceRes, itemRes] = await Promise.allSettled([
        api.get(`/admin/race?raceId=${raceId}`),
        api.get(`/admin/race-item?raceId=${raceId}`),
      ]);
      if (raceRes.status === "fulfilled") setRace(raceRes.value.data?.race ?? null);
      else setError("Could not load this race.");
      if (itemRes.status === "fulfilled") setItems(itemRes.value.data?.raceItems ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [raceId]);

  useEffect(() => {
    load();
  }, [load]);

  // While a race is in the air the arrivals list is the whole point of the
  // screen, so it refreshes itself rather than waiting to be pulled.
  useEffect(() => {
    if (race?.status !== "STARTED") return;
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [race?.status, load]);

  const act = async (label: string, path: string, confirm: string | null = null) => {
    const run = async () => {
      setBusy(label);
      try {
        await api.post(path);
        await load();
      } catch (err: any) {
        Alert.alert(
          label,
          err?.response?.data?.message ?? "That did not go through. Nothing was changed."
        );
      } finally {
        setBusy(null);
      }
    };

    if (!confirm) return run();
    Alert.alert(label, confirm, [
      { text: "Cancel", style: "cancel" },
      { text: label, style: "destructive", onPress: run },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!race) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-center text-sm text-slate-500">
          {error ?? "That race could not be found."}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-sm font-medium text-blue-600">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const arrived = items.filter((i) => i.arrivalTime != null);
  const canManage = can("races.manage");

  const Action = ({
    label,
    icon,
    onPress,
    tone = "neutral",
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    tone?: "neutral" | "primary" | "danger";
  }) => {
    const running = busy === label;
    const bg =
      tone === "primary" ? "bg-blue-600" : tone === "danger" ? "bg-rose-600" : "bg-white";
    const border = tone === "neutral" ? "border border-slate-200" : "";
    const fg = tone === "neutral" ? "text-slate-700" : "text-white";
    return (
      <Pressable
        onPress={onPress}
        disabled={busy != null}
        className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${bg} ${border} ${
          busy != null && !running ? "opacity-40" : ""
        }`}
        style={{ flexGrow: 1, flexBasis: isWide ? "23%" : "47%" }}
      >
        {running ? (
          <ActivityIndicator size="small" color={tone === "neutral" ? "#334155" : "#fff"} />
        ) : (
          <Ionicons name={icon} size={16} color={tone === "neutral" ? "#334155" : "#ffffff"} />
        )}
        <Text className={`text-sm font-medium ${fg}`}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={{ padding: gutter }}
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
      <Pressable onPress={() => router.back()} className="mb-3 flex-row items-center gap-1">
        <Ionicons name="chevron-back" size={16} color="#2563eb" />
        <Text className="text-sm font-medium text-blue-600">Races</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-slate-900">
        {race.name || `Race ${race.raceNumber ?? race.id}`}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">
        {race.seasonRel?.event?.name ?? "Event"}
        {race.distance ? ` · ${race.distance} mi` : ""}
        {race.location ? ` · ${race.location}` : ""}
      </Text>

      <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
        <View
          className="rounded-xl border border-slate-200 bg-white p-4"
          style={{ flexGrow: 1, flexBasis: "30%" }}
        >
          <Text className="text-2xl font-bold text-slate-900">{items.length}</Text>
          <Text className="mt-0.5 text-xs text-slate-500">Birds entered</Text>
        </View>
        <View
          className="rounded-xl border border-slate-200 bg-white p-4"
          style={{ flexGrow: 1, flexBasis: "30%" }}
        >
          <Text className="text-2xl font-bold text-emerald-600">{arrived.length}</Text>
          <Text className="mt-0.5 text-xs text-slate-500">Clocked in</Text>
        </View>
        <View
          className="rounded-xl border border-slate-200 bg-white p-4"
          style={{ flexGrow: 1, flexBasis: "30%" }}
        >
          <Text className="text-base font-semibold text-slate-900">
            {race.status.toLowerCase()}
          </Text>
          <Text className="mt-0.5 text-xs text-slate-500">
            {race.startTime ? new Date(race.startTime).toLocaleString() : "Not scheduled"}
          </Text>
        </View>
      </View>

      {(race.weather || race.wind || race.temperature) && (
        <Text className="mt-3 text-xs text-slate-500">
          {[race.temperature, race.weather, race.wind].filter(Boolean).join(" · ")}
        </Text>
      )}

      {canManage && (
        <>
          <Text className="mb-2 mt-6 text-base font-semibold text-slate-900">Controls</Text>
          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            {race.status === "REGISTERING" && (
              <Action
                label="Liberate"
                icon="paper-plane-outline"
                tone="primary"
                onPress={() =>
                  act(
                    "Liberate",
                    `/admin/race/${race.id}/start`,
                    "This marks the birds as released and starts the clock. It cannot be undone from here."
                  )
                }
              />
            )}
            {race.status === "STARTED" && (
              <Action
                label="End race"
                icon="flag-outline"
                tone="danger"
                onPress={() =>
                  act(
                    "End race",
                    `/admin/race/${race.id}/end`,
                    "Ending the race closes clocking and settles positions and prizes."
                  )
                }
              />
            )}
            {race.transportStatus == null || race.transportStatus === "IDLE" ? (
              <Action
                label="Start transport"
                icon="bus-outline"
                onPress={() => act("Start transport", `/admin/race/${race.id}/transport/start`)}
              />
            ) : (
              <Action
                label="Stop transport"
                icon="bus-outline"
                onPress={() => act("Stop transport", `/admin/race/${race.id}/transport/stop`)}
              />
            )}
            {can("races.recalculate") && (
              <Action
                label="Recalculate"
                icon="refresh-outline"
                onPress={() =>
                  act(
                    "Recalculate",
                    `/admin/race/${race.id}/recalculate`,
                    "Positions and prizes will be worked out again from the arrivals on record."
                  )
                }
              />
            )}
            {can("checkin.manage") && (
              <Action
                label="Scan arrivals"
                icon="scan-outline"
                onPress={() => router.push(`/(admin)/checkin?raceId=${race.id}` as never)}
              />
            )}
          </View>
        </>
      )}

      <Text className="mb-2 mt-6 text-base font-semibold text-slate-900">
        Arrivals {arrived.length > 0 ? `(${arrived.length})` : ""}
      </Text>

      {items.length === 0 ? (
        <View className="rounded-xl border border-slate-200 bg-white p-8">
          <Text className="text-center text-sm text-slate-500">
            No birds are entered in this race.
          </Text>
        </View>
      ) : (
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {items.slice(0, 200).map((item, index) => {
            const breeder = item.bird?.breeder;
            const name = `${breeder?.firstName ?? ""} ${breeder?.lastName ?? ""}`.trim();
            return (
              <View
                key={item.id}
                className={`flex-row items-center gap-3 px-4 py-3 ${
                  index > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <View className="w-9 items-center">
                  <Text
                    className="text-sm font-semibold text-slate-900"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {item.birdPosition ?? "—"}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-900">
                    {item.bird?.band ?? "No band"}
                    {item.bird?.birdName ? ` · ${item.bird.birdName}` : ""}
                  </Text>
                  <Text className="text-xs text-slate-500">
                    {name || item.eventInventoryItem?.eventInventory?.loft || "Unassigned"}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className="text-xs text-slate-600"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {item.arrivalTime
                      ? new Date(item.arrivalTime).toLocaleTimeString()
                      : item.status.toLowerCase().replace(/_/g, " ")}
                  </Text>
                  {item.prizeValue != null && item.prizeValue > 0 && (
                    <Text className="text-xs font-medium text-emerald-600">
                      ${item.prizeValue.toLocaleString()}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
          {items.length > 200 && (
            <Text className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-400">
              Showing the first 200 of {items.length}. The full list is in the portal.
            </Text>
          )}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
