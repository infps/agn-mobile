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
import { EventPicker } from "@/components/admin/EventPicker";

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
 */
export default function AdminRaces() {
  const { can } = usePermissions();
  const { isWide, isMedium, gutter } = useResponsive();
  const router = useRouter();

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

          {!can("races.manage") && races.length > 0 && (
            <Text className="mt-4 text-center text-xs text-slate-400">
              You can see these races but not change them.
            </Text>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}
