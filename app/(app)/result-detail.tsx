import Header from "@/components/header";
import api from "@/service/api.service";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface RaceItem {
  id: number;
  birdPosition: number | null;
  arrivalTime: string | null;
  previousPosition: number | null;
  bird?: {
    id: number;
    band: string | null;
    birdName: string | null;
    color: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  };
}

/**
 * The finishing order for one race.
 *
 * This replaced a six-column table of invented names. The real list is long —
 * hundreds of birds — so it reads as a leaderboard rather than a spreadsheet:
 * position, bird, who flew it, when it clocked. Movement against the bird's
 * last race is shown where we know it, because that is the thing people
 * actually discuss afterwards.
 *
 * Birds that did not clock stay at the bottom rather than being dropped. "Did
 * not make it home" is a result somebody is looking for.
 */
export default function ResultDetail() {
  const { raceId, name } = useLocalSearchParams<{ raceId?: string; name?: string }>();
  const { gutter } = useResponsive();

  const [items, setItems] = useState<RaceItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!raceId) return;
    setError(null);
    try {
      const { data } = await api.get(`/breeder/races/${raceId}/items`);
      setItems(data?.raceItems ?? []);
    } catch {
      setError("Could not load this result just now.");
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [raceId]);

  useEffect(() => {
    load();
  }, [load]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const who = `${i.bird?.breeder?.firstName ?? ""} ${
        i.bird?.breeder?.lastName ?? ""
      }`.toLowerCase();
      return (
        (i.bird?.band ?? "").toLowerCase().includes(q) ||
        (i.bird?.birdName ?? "").toLowerCase().includes(q) ||
        who.includes(q)
      );
    });
  }, [items, query]);

  const clocked = items.filter((i) => i.birdPosition != null).length;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={name || "Result"} />

      <View style={{ paddingHorizontal: gutter }}>
        <Text className="py-2 text-sm text-gray-500">
          {clocked} of {items.length} clocked in
        </Text>

        <View className="mb-2 flex-row items-center gap-2 rounded-xl border border-gray-200 px-3">
          <Ionicons name="search" size={16} color="#94a3b8" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Band, bird or breeder"
            placeholderTextColor="#94a3b8"
            className="flex-1 py-2.5 text-sm text-gray-900"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </Pressable>
          )}
        </View>
      </View>

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
            <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">{error}</Text>
            </View>
          ) : null}

          {results.length === 0 ? (
            <View className="rounded-xl border border-gray-200 p-8">
              <Text className="text-center text-sm text-gray-500">
                {items.length === 0
                  ? "No birds were entered in this race."
                  : "No bird matches that search."}
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-xl border border-gray-200">
              {results.slice(0, 300).map((item, index) => {
                const who = `${item.bird?.breeder?.firstName ?? ""} ${
                  item.bird?.breeder?.lastName ?? ""
                }`.trim();
                const moved =
                  item.previousPosition != null && item.birdPosition != null
                    ? item.previousPosition - item.birdPosition
                    : null;
                return (
                  <View
                    key={item.id}
                    className={`flex-row items-center gap-3 px-4 py-3 ${
                      index > 0 ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <View className="w-9 items-center">
                      <Text
                        className="text-base font-bold text-gray-900"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {item.birdPosition ?? "—"}
                      </Text>
                    </View>

                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900">
                        {item.bird?.band ?? "No band"}
                        {item.bird?.birdName ? ` · ${item.bird.birdName}` : ""}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {who || item.bird?.color || "—"}
                      </Text>
                    </View>

                    {moved != null && moved !== 0 && (
                      <View className="flex-row items-center gap-0.5">
                        <Ionicons
                          name={moved > 0 ? "caret-up" : "caret-down"}
                          size={12}
                          color={moved > 0 ? "#059669" : "#e11d48"}
                        />
                        <Text
                          className={`text-xs ${
                            moved > 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {Math.abs(moved)}
                        </Text>
                      </View>
                    )}

                    <Text
                      className="text-xs text-gray-500"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {item.arrivalTime
                        ? new Date(item.arrivalTime).toLocaleTimeString()
                        : "no clock"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {results.length > 300 && (
            <Text className="mt-3 text-center text-xs text-gray-400">
              Showing the first 300 of {results.length}.
            </Text>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
