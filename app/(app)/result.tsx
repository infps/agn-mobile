import Header from "@/components/header";
import api from "@/service/api.service";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
  seasonRel?: { event?: { name?: string | null; shortName?: string | null } | null } | null;
}

/**
 * Finished races, as a way into their results.
 *
 * This screen used to be four hard-coded cards behind a stock photo. It now
 * lists races that have actually run — finished first, since an unfinished
 * race has no result to read — and opens the standings on tap.
 */
export default function Result() {
  const { columns, gutter } = useResponsive();
  const router = useRouter();

  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get("/breeder/races");
      const all: Race[] = data?.races ?? [];
      setRaces(
        [...all].sort(
          (a, b) =>
            (a.status === "ENDED" ? 0 : 1) - (b.status === "ENDED" ? 0 : 1) ||
            new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime()
        )
      );
    } catch {
      setError("Could not load results just now.");
      setRaces([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Results" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          // React Native will not change numColumns on an existing list.
          key={`cols-${columns}`}
          data={races}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
          contentContainerStyle={{ padding: gutter, gap: 12 }}
          keyExtractor={(item) => String(item.id)}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          ListEmptyComponent={
            <View className="rounded-xl border border-gray-200 p-8">
              <Text className="text-center text-sm text-gray-500">
                {error ?? "No races have run yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const ended = item.status === "ENDED";
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/result-detail",
                    params: {
                      raceId: String(item.id),
                      name: item.name ?? `Race ${item.raceNumber ?? item.id}`,
                    },
                  })
                }
                className="rounded-xl border border-gray-200 bg-white p-4"
                style={{ flex: 1 }}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 font-semibold text-gray-900">
                    {item.name || `Race ${item.raceNumber ?? item.id}`}
                  </Text>
                  {!ended && (
                    <View className="rounded-full bg-amber-100 px-2 py-0.5">
                      <Text className="text-[10px] font-medium text-amber-700">
                        not final
                      </Text>
                    </View>
                  )}
                </View>

                <Text className="mt-1 text-xs text-gray-500">
                  {item.seasonRel?.event?.shortName ?? item.seasonRel?.event?.name ?? "Event"}
                  {item.distance ? ` · ${item.distance} mi` : ""}
                </Text>
                <Text className="mt-2 text-xs text-gray-500">
                  {item.startTime ? new Date(item.startTime).toLocaleDateString() : "Not scheduled"}
                </Text>

                <View className="mt-3 flex-row items-center gap-1">
                  <Text className="text-sm font-medium text-primary">View result</Text>
                  <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
