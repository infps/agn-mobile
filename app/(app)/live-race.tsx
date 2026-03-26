import Header from "@/components/header";
import api from "@/service/api.service";
import { format } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Race {
  id: number;
  description: string;
  startTime: string | null;
  isClosed: number; // 0 or 1
  distance: number;
  releaseStation: string;
  event?: { name: string };
  raceType?: { name: string };
}

interface RaceItem {
  id: number;
  result?: {
    birdPosition: number | null;
    arrivalTime: string | null;
  };
  inventoryItem?: {
    bird?: {
      band: string;
      birdName: string;
      breeder?: { firstName: string; lastName: string };
    };
  };
}

const REFRESH_INTERVAL = 15_000;

const LiveRace = () => {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  const [race, setRace] = useState<Race | null>(null);
  const [raceItems, setRaceItems] = useState<RaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRaceItems = useCallback(async () => {
    try {
      const res = await api.get(`/breeder/races/${raceId}/items`);
      setRaceItems(res.data.raceItems || []);
    } catch {
      // silent refresh failure
    }
  }, [raceId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [raceRes, itemsRes] = await Promise.all([
          api.get("/breeder/races", { params: { raceId } }),
          api.get(`/breeder/races/${raceId}/items`),
        ]);
        setRace(raceRes.data.race);
        setRaceItems(itemsRes.data.raceItems || []);
      } catch (err: any) {
        setError(err.message || "Failed to load race");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [raceId]);

  // Auto-refresh every 15s
  useEffect(() => {
    intervalRef.current = setInterval(fetchRaceItems, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRaceItems]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (error || !race) {
    return (
      <SafeAreaView className="flex-1">
        <Header title="Live Race" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-red-500">{error || "Race not found"}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sorted = [...raceItems].sort((a, b) => {
    const aPos = a.result?.birdPosition;
    const bPos = b.result?.birdPosition;
    if (aPos == null && bPos == null) return 0;
    if (aPos == null) return 1;
    if (bPos == null) return -1;
    return aPos - bPos;
  });

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Live Race" />

      {/* Race Header */}
      <View className="bg-white mx-4 mt-3 rounded-lg p-4" style={{ shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}>
        <View className="flex-row items-center gap-2 mb-1">
          <Text className="text-xl font-bold">{race.description}</Text>
          <View className="bg-red-500 px-2 py-1 rounded-full flex-row items-center gap-1">
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
            <Text className="text-white text-xs font-bold">LIVE</Text>
          </View>
        </View>
        <Text className="text-gray-600 text-sm">
          {race.event?.name} {race.raceType?.name ? `\u2022 ${race.raceType.name}` : ""}
        </Text>
        <Text className="text-blue-600 text-sm mt-1">
          Release Station: <Text className="font-medium">{race.releaseStation}</Text>
        </Text>

        {/* Stats Row */}
        <View className="flex-row mt-3 gap-2">
          <View className="flex-1 border border-gray-200 rounded-lg p-2 items-center">
            <Text className="font-bold text-base">{race.startTime ? format(new Date(race.startTime), "MMM dd") : "-"}</Text>
            <Text className="text-gray-500 text-xs">{race.startTime ? format(new Date(race.startTime), "hh:mm a") : "-"}</Text>
            <Text className="text-gray-400 text-[10px] mt-1">Release</Text>
          </View>
          <View className="flex-1 border border-gray-200 rounded-lg p-2 items-center">
            <Text className="font-bold text-base">{race.distance}</Text>
            <Text className="text-gray-500 text-xs">Miles</Text>
            <Text className="text-gray-400 text-[10px] mt-1">Distance</Text>
          </View>
          <View className="flex-1 border border-gray-200 rounded-lg p-2 items-center">
            <Text className="font-bold text-base">{raceItems.length}</Text>
            <Text className="text-gray-500 text-xs">Birds</Text>
            <Text className="text-gray-400 text-[10px] mt-1">Entered</Text>
          </View>
        </View>
      </View>

      {/* Results Header */}
      <View className="mx-4 mt-4 mb-1">
        <Text className="text-lg font-bold">Results ({raceItems.length})</Text>
      </View>

      {/* Table Header */}
      <View className="flex-row bg-primary mx-4 rounded-t-lg px-3 py-2">
        <View className="w-12"><Text className="text-white font-bold text-xs">#</Text></View>
        <View className="flex-1"><Text className="text-white font-bold text-xs">Band</Text></View>
        <View className="flex-1"><Text className="text-white font-bold text-xs">Bird</Text></View>
        <View className="flex-1"><Text className="text-white font-bold text-xs">Breeder</Text></View>
        <View className="w-20"><Text className="text-white font-bold text-xs text-right">Arrival</Text></View>
      </View>

      {/* Results List */}
      <FlatList
        data={sorted}
        className="mx-4"
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const pos = item.result?.birdPosition;
          const arrival = item.result?.arrivalTime;
          const bird = item.inventoryItem?.bird;
          const breederName = bird?.breeder
            ? `${bird.breeder.firstName || ""} ${bird.breeder.lastName || ""}`.trim() || "-"
            : "-";
          return (
            <View className="flex-row px-3 py-3 border-b border-gray-200 bg-white items-center">
              <View className="w-12">
                {pos ? (
                  <View
                    style={{
                      backgroundColor:
                        pos === 1 ? "#F59E0B" :
                        pos === 2 ? "#9CA3AF" :
                        pos === 3 ? "#CD7F32" : "#189AB4",
                      width: 24, height: 24, borderRadius: 12,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Text className="text-white text-xs font-bold">{pos}</Text>
                  </View>
                ) : (
                  <Text className="text-gray-400">-</Text>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-xs" numberOfLines={1}>{bird?.band || "-"}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xs" numberOfLines={1}>{bird?.birdName || "-"}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-xs" numberOfLines={1}>{breederName}</Text>
              </View>
              <View className="w-20">
                <Text className="text-xs text-right" numberOfLines={1}>
                  {arrival ? format(new Date(arrival), "hh:mm:ss a") : "-"}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="py-8 items-center bg-white">
            <Text className="text-gray-500">No results yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </SafeAreaView>
  );
};

export default LiveRace;
