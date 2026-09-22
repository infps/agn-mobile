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
  location: string | null;
  raceType?: { name?: string | null } | null;
  seasonRel?: { event?: { name?: string | null; shortName?: string | null } | null } | null;
}

const STATUS_TONE: Record<string, { bg: string; text: string; label: string }> = {
  STARTED: { bg: "bg-emerald-100", text: "text-emerald-700", label: "in the air" },
  REGISTERING: { bg: "bg-blue-100", text: "text-blue-700", label: "taking entries" },
  ENDED: { bg: "bg-gray-200", text: "text-gray-600", label: "finished" },
};

/**
 * Races, as a breeder sees them.
 *
 * This screen used to render four hard-coded cards with a stock photo — the
 * same "Race 1, upcoming in 2 days" no matter what was actually flying. It now
 * shows the real list, live races first, and opens the live view on tap.
 *
 * The column count follows the screen rather than being pinned at two, so a
 * tablet does not show two enormous cards where four fit comfortably.
 */
const Race = () => {
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
      setRaces(data?.races ?? []);
    } catch {
      setError("Could not load races just now.");
      setRaces([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rank = (r: Race) =>
    r.status === "STARTED" ? 0 : r.status === "REGISTERING" ? 1 : 2;
  const ordered = [...races].sort(
    (a, b) => rank(a) - rank(b) || (b.raceNumber ?? 0) - (a.raceNumber ?? 0)
  );

  const live = races.filter((r) => r.status === "STARTED").length;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Races" />

      <View className="flex-row border-b border-gray-200 px-4 pb-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-emerald-600">{live}</Text>
          <Text className="text-xs text-gray-500">In the air</Text>
        </View>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900">{races.length}</Text>
          <Text className="text-xs text-gray-500">Races in total</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          // React Native refuses to change numColumns on an existing list, so
          // the key forces a fresh one when the device is rotated.
          key={`cols-${columns}`}
          data={ordered}
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
                {error ?? "No races have been scheduled yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const tone = STATUS_TONE[item.status] ?? STATUS_TONE.ENDED;
            return (
              <Pressable
                onPress={() =>
                  item.status === "ENDED"
                    ? router.push({ pathname: "/result-detail", params: { raceId: String(item.id), name: item.name ?? `Race ${item.raceNumber ?? item.id}` } })
                    : router.push({ pathname: "/live-race", params: { raceId: String(item.id) } })
                }
                className="rounded-xl border border-gray-200 bg-white p-4"
                style={{ flex: 1 }}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 font-semibold text-gray-900">
                    {item.name || `Race ${item.raceNumber ?? item.id}`}
                  </Text>
                  <View className={`rounded-full px-2 py-0.5 ${tone.bg}`}>
                    <Text className={`text-[10px] font-medium ${tone.text}`}>
                      {tone.label}
                    </Text>
                  </View>
                </View>

                <Text className="mt-1 text-xs text-gray-500">
                  {item.seasonRel?.event?.shortName ??
                    item.seasonRel?.event?.name ??
                    "Event"}
                  {item.distance ? ` · ${item.distance} mi` : ""}
                </Text>
                <Text className="mt-2 text-xs text-gray-500">
                  {item.startTime
                    ? new Date(item.startTime).toLocaleString()
                    : "Not scheduled"}
                </Text>

                <View className="mt-3 flex-row items-center gap-1">
                  <Text className="text-sm font-medium text-primary">
                    {item.status === "STARTED" ? "Watch live" : "View race"}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default Race;
