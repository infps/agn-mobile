import Header from "@/components/header";
import { useResponsive } from "@/hooks/useResponsive";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Race calendar — the portal's /races/calendar page.
 *
 * GET /api/public/calendar?from=&to= returns one month of races the account is
 * allowed to see, each tagged with its race type as a category, plus the list
 * of categories present. The portal offers a month grid and a list, with
 * categories that can be switched off; both views are here.
 */

interface CalendarEvent {
  id: number;
  title: string;
  start: string | null;
  end: string | null;
  status: string;
  category: string;
  categoryId: number | null;
  color: string | null;
  station: string | null;
  miles: number | null;
  eventId: number | null;
  eventName: string | null;
  seasonName: string | null;
}

interface Category {
  id: number | null;
  name: string;
  color: string | null;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const FALLBACK = "#189AB4";

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function RaceCalendar() {
  const { gutter } = useResponsive();
  const router = useRouter();

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hidden, setHidden] = useState<Set<number | null>>(new Set());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
    try {
      const { data } = await api.get("/public/calendar", {
        params: { from: from.toISOString(), to: to.toISOString() },
      });
      setEvents(data?.events ?? []);
      setCategories(data?.categories ?? []);
    } catch {
      setError("Could not load the calendar just now.");
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const visible = useMemo(() => events.filter((e) => !hidden.has(e.categoryId)), [events, hidden]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let d = 1; d <= days; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const eventsOn = useCallback(
    (day: Date) => visible.filter((e) => e.start && sameDay(new Date(e.start), day)),
    [visible]
  );

  const listed = useMemo(
    () => (view === "grid" && selectedDay ? eventsOn(selectedDay) : visible),
    [view, selectedDay, eventsOn, visible]
  );

  const shift = (by: number) => {
    setSelectedDay(null);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
  };

  const goToday = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now);
  };

  const toggleCategory = (id: number | null) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const today = new Date();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Race Calendar" />

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
        {/* Month navigation */}
        <View className="flex-row items-center justify-between py-3">
          <TouchableOpacity onPress={() => shift(-1)} className="p-2">
            <Ionicons name="chevron-back" size={20} color="#374151" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-900">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <TouchableOpacity onPress={() => shift(1)} className="p-2">
            <Ionicons name="chevron-forward" size={20} color="#374151" />
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center mb-3">
          <TouchableOpacity onPress={goToday} className="border border-gray-300 rounded-lg px-3 py-1.5 mr-2">
            <Text className="text-xs font-semibold text-gray-700">Today</Text>
          </TouchableOpacity>
          {(["grid", "list"] as const).map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 mr-2 border ${
                view === v ? "bg-primary border-primary" : "bg-white border-gray-300"
              }`}
            >
              <Text className={`text-xs font-semibold ${view === v ? "text-white" : "text-gray-700"}`}>
                {v === "grid" ? "Month" : "List"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Categories — tap to hide */}
        {categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {categories.map((c) => {
              const off = hidden.has(c.id);
              return (
                <TouchableOpacity
                  key={String(c.id)}
                  onPress={() => toggleCategory(c.id)}
                  className="flex-row items-center border border-gray-200 rounded-full px-3 py-1.5 mr-2"
                  style={{ opacity: off ? 0.4 : 1 }}
                >
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color || FALLBACK, marginRight: 6 }}
                  />
                  <Text className={`text-xs text-gray-700 ${off ? "line-through" : ""}`}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {error ? (
          <View className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-3">
            <Text className="text-sm text-amber-800">{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <>
            {view === "grid" ? (
              <View className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                <View className="flex-row bg-gray-50">
                  {WEEKDAYS.map((d, i) => (
                    <Text key={i} className="flex-1 text-center text-[11px] font-semibold text-gray-500 py-1.5">
                      {d}
                    </Text>
                  ))}
                </View>
                {Array.from({ length: cells.length / 7 }, (_, row) => (
                  <View key={row} className="flex-row border-t border-gray-100">
                    {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
                      if (!day) return <View key={i} className="flex-1" style={{ height: 52 }} />;
                      const dayEvents = eventsOn(day);
                      const isToday = sameDay(day, today);
                      const isSelected = selectedDay ? sameDay(day, selectedDay) : false;
                      return (
                        <Pressable
                          key={i}
                          onPress={() => setSelectedDay(isSelected ? null : day)}
                          className="flex-1 items-center pt-1"
                          style={{
                            height: 52,
                            backgroundColor: isSelected ? "#e8f6f9" : undefined,
                            borderWidth: isToday ? 1 : 0,
                            borderColor: "#189AB4",
                          }}
                        >
                          <Text className={`text-xs ${isToday ? "font-bold text-primary" : "text-gray-800"}`}>
                            {day.getDate()}
                          </Text>
                          <View className="flex-row flex-wrap justify-center mt-1" style={{ gap: 2 }}>
                            {dayEvents.slice(0, 4).map((e) => (
                              <View
                                key={e.id}
                                style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: e.color || FALLBACK }}
                              />
                            ))}
                          </View>
                          {dayEvents.length > 4 ? (
                            <Text className="text-[9px] text-gray-500">+{dayEvents.length - 4}</Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}

            <Text className="text-sm font-bold text-gray-900 mb-2">
              {view === "grid" && selectedDay
                ? selectedDay.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
                : `${listed.length} race${listed.length === 1 ? "" : "s"} this month`}
            </Text>

            {listed.length === 0 ? (
              <View className="rounded-xl border border-gray-200 p-8">
                <Text className="text-center text-sm text-gray-500">
                  {view === "grid" && selectedDay ? "No races on this day." : "No races scheduled this month."}
                </Text>
              </View>
            ) : (
              <View className="overflow-hidden rounded-xl border border-gray-200">
                {listed.map((e, index) => (
                  <Pressable
                    key={e.id}
                    onPress={() => router.push({ pathname: "/live-race", params: { raceId: String(e.id) } })}
                    className={`flex-row items-center p-3 ${index > 0 ? "border-t border-gray-100" : ""}`}
                  >
                    <View
                      style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: e.color || FALLBACK, marginRight: 10 }}
                    />
                    <View style={{ width: 62 }}>
                      <Text className="text-xs font-semibold text-gray-800">
                        {e.start ? new Date(e.start).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}
                      </Text>
                      <Text className="text-[11px] text-gray-500" style={{ fontVariant: ["tabular-nums"] }}>
                        {e.start ? new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text className="text-xs text-gray-500" numberOfLines={1}>
                        {[e.eventName, e.category, e.station, e.miles != null ? `${e.miles} mi` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    {e.status === "STARTED" ? (
                      <View className="bg-red-500 rounded-full px-2 py-0.5 ml-2">
                        <Text className="text-white text-[10px] font-bold">LIVE</Text>
                      </View>
                    ) : e.status === "ENDED" ? (
                      <Text className="text-[10px] text-gray-400 ml-2">Finished</Text>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
