import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";

interface EventSummary {
  id: number;
  name: string | null;
  shortName: string | null;
  isOpen: number | null;
}

interface RaceSummary {
  id: number;
  name?: string | null;
  raceNumber?: number | null;
  status: string;
  startTime?: string | null;
  transportStatus?: string | null;
}

const STATUS_TONE: Record<string, { bg: string; text: string }> = {
  STARTED: { bg: "bg-emerald-100", text: "text-emerald-700" },
  REGISTERING: { bg: "bg-blue-100", text: "text-blue-700" },
  ENDED: { bg: "bg-slate-200", text: "text-slate-600" },
};

/**
 * Overview.
 *
 * Leads with what is happening right now — a race in the air is the thing an
 * operator opens the app for — and only then the season's events.
 */
export default function AdminDashboard() {
  const { can } = usePermissions();
  const { isWide, isMedium, gutter } = useResponsive();
  const router = useRouter();

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [eventRes, raceRes] = await Promise.allSettled([
        api.get("/breeder/events"),
        api.get("/breeder/races"),
      ]);

      if (eventRes.status === "fulfilled") {
        setEvents((eventRes.value.data?.events ?? []).slice(0, 12));
      }
      if (raceRes.status === "fulfilled") {
        const all: RaceSummary[] = raceRes.value.data?.races ?? [];
        // Live first, then the ones about to go, then recent history.
        const rank = (r: RaceSummary) =>
          r.status === "STARTED" ? 0 : r.status === "REGISTERING" ? 1 : 2;
        setRaces([...all].sort((a, b) => rank(a) - rank(b)).slice(0, 10));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const live = races.filter((r) => r.status === "STARTED");

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const Stat = ({ label, value, tone }: { label: string; value: string | number; tone: string }) => (
    <View
      className="rounded-xl border border-slate-200 bg-white p-4"
      style={{ flex: 1, minWidth: isWide ? 180 : 140 }}
    >
      <Text className={`text-2xl font-bold ${tone}`}>{value}</Text>
      <Text className="mt-0.5 text-xs text-slate-500">{label}</Text>
    </View>
  );

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
      <Text className="text-2xl font-bold text-slate-900">Overview</Text>
      <Text className="mt-1 text-sm text-slate-500">
        {live.length > 0
          ? `${live.length} race${live.length === 1 ? "" : "s"} in the air`
          : "Nothing in the air right now"}
      </Text>

      <View className="mt-4 flex-row flex-wrap" style={{ gap: 12 }}>
        <Stat label="Races live" value={live.length} tone="text-emerald-600" />
        <Stat
          label="Taking entries"
          value={races.filter((r) => r.status === "REGISTERING").length}
          tone="text-blue-600"
        />
        <Stat label="Open events" value={events.filter((e) => e.isOpen === 1).length} tone="text-slate-900" />
      </View>

      {can("checkin.manage") && (
        <Pressable
          onPress={() => router.push("/(admin)/checkin" as never)}
          className="mt-4 flex-row items-center gap-3 rounded-xl bg-blue-600 p-4"
        >
          <Ionicons name="scan-outline" size={22} color="white" />
          <View className="flex-1">
            <Text className="font-semibold text-white">Scan birds</Text>
            <Text className="text-xs text-blue-100">Check in arrivals or basket for a race</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="white" />
        </Pressable>
      )}

      <Text className="mb-2 mt-6 text-base font-semibold text-slate-900">Races</Text>

      {races.length === 0 ? (
        <View className="rounded-xl border border-slate-200 bg-white p-8">
          <Text className="text-center text-sm text-slate-500">No races yet.</Text>
        </View>
      ) : (
        <View className={isWide || isMedium ? "flex-row flex-wrap" : ""} style={{ gap: 10 }}>
          {races.map((race) => {
            const tone = STATUS_TONE[race.status] ?? STATUS_TONE.ENDED;
            return (
              <Pressable
                key={race.id}
                onPress={() => router.push(`/(admin)/race-detail?raceId=${race.id}` as never)}
                className="rounded-xl border border-slate-200 bg-white p-4"
                style={{ flexGrow: 1, flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%" }}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 font-semibold text-slate-900">
                    {race.name || `Race ${race.raceNumber ?? race.id}`}
                  </Text>
                  <View className={`rounded-full px-2 py-0.5 ${tone.bg}`}>
                    <Text className={`text-[10px] font-medium ${tone.text}`}>
                      {race.status.toLowerCase()}
                    </Text>
                  </View>
                </View>
                <Text className="mt-1 text-xs text-slate-500">
                  {race.startTime ? new Date(race.startTime).toLocaleString() : "Not scheduled"}
                </Text>
                {race.transportStatus && race.transportStatus !== "IDLE" && (
                  <Text className="mt-1 text-xs text-amber-600">
                    Transport {race.transportStatus.toLowerCase().replace("_", " ")}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      <Text className="mb-2 mt-6 text-base font-semibold text-slate-900">Events</Text>

      <View className={isWide || isMedium ? "flex-row flex-wrap" : ""} style={{ gap: 10 }}>
        {events.map((event) => (
          <View
            key={event.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
            style={{ flexGrow: 1, flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%" }}
          >
            <Text className="font-semibold text-slate-900">{event.name ?? "Event"}</Text>
            <Text className="mt-0.5 text-xs text-slate-500">
              {event.isOpen === 1 ? "Open for entries" : "Closed"}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
