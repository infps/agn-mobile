import Header from "@/components/header";
import api from "@/service/api.service";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
  distance: number | null;
  location: string | null;
  eventId: number | null;
  eventName: string | null;
}

/**
 * What is coming up, grouped by the day it happens.
 *
 * A flat list of dated rows makes you do the grouping in your head. Days are
 * the unit people plan in — "am I driving anywhere Saturday" — so the day is
 * the heading and the races sit under it. Today is called out by name rather
 * than by date, because that is how anybody would say it.
 */
export default function RaceCalendar() {
  const { gutter } = useResponsive();
  const router = useRouter();

  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get("/breeder/races/calendar");
      setRaces(data?.races ?? []);
    } catch {
      setError("Could not load the calendar just now.");
      setRaces([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    const byDay = new Map<string, Race[]>();
    for (const race of races) {
      // Races with no date are a real state — scheduled but not timed — and
      // belong in their own bucket rather than silently dropped.
      const key = race.startTime ? new Date(race.startTime).toDateString() : "unscheduled";
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(race);
    }
    return Array.from(byDay.entries()).sort(([a], [b]) => {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });
  }, [races]);

  const today = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86_400_000).toDateString();

  const dayLabel = (key: string) => {
    if (key === "unscheduled") return "Not yet scheduled";
    if (key === today) return "Today";
    if (key === tomorrow) return "Tomorrow";
    return new Date(key).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Race calendar" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ paddingHorizontal: gutter }}
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
          {error ? (
            <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">{error}</Text>
            </View>
          ) : null}

          {days.length === 0 ? (
            <View className="mt-4 rounded-xl border border-gray-200 p-8">
              <Text className="text-center text-sm text-gray-500">
                No races are scheduled.
              </Text>
            </View>
          ) : (
            days.map(([key, dayRaces]) => (
              <View key={key} className="mt-5">
                <Text
                  className={`mb-2 text-sm font-semibold ${
                    key === today ? "text-primary" : "text-gray-900"
                  }`}
                >
                  {dayLabel(key)}
                </Text>

                <View className="overflow-hidden rounded-xl border border-gray-200">
                  {dayRaces.map((race, index) => (
                    <Pressable
                      key={race.id}
                      onPress={() =>
                        router.push({
                          pathname: "/live-race",
                          params: { raceId: String(race.id) },
                        })
                      }
                      className={`flex-row items-center gap-3 px-4 py-3 ${
                        index > 0 ? "border-t border-gray-100" : ""
                      }`}
                    >
                      <View className="w-14">
                        <Text
                          className="text-sm font-semibold text-gray-900"
                          style={{ fontVariant: ["tabular-nums"] }}
                        >
                          {race.startTime
                            ? new Date(race.startTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </Text>
                      </View>

                      <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-900">
                          {race.name || `Race ${race.raceNumber ?? race.id}`}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {[race.eventName, race.location, race.distance ? `${race.distance} mi` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>

                      {race.status === "STARTED" && (
                        <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-emerald-700">live</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
