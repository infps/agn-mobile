import Header from "@/components/header";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Release stations with their coordinates — the portal's
 * /events/[eventId]/stations page, from GET /api/public/event/[eventId]/stations.
 */

interface Station {
  id: number;
  name: string;
  miles: number | null;
  km: number | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  raceTypes: string[];
  mapUrl: string | null;
  recentRaces: { id: number; name: string; startTime: string | null; status: string }[];
}

export default function EventStations() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [stations, setStations] = useState<Station[]>([]);
  const [season, setSeason] = useState<{ id: number; name: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    api
      .get(`/public/event/${eventId}/stations`)
      .then((r) => {
        setStations(r.data?.stations ?? []);
        setSeason(r.data?.season ?? null);
        setNote(r.data?.note ?? null);
      })
      .catch((e) => setError(e?.response?.data?.message ?? "Could not load stations."))
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Release Stations" />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : error ? (
        <Text className="text-center text-red-500 mt-10 px-6">{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {season ? <Text className="text-xs text-gray-500 mb-2">Season: {season.name}</Text> : null}
          {note ? (
            <View className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3">
              <Text className="text-xs text-amber-800">{note}</Text>
            </View>
          ) : null}

          {stations.length === 0 ? (
            <Text className="text-center text-gray-500 mt-10">No release stations listed for this season.</Text>
          ) : (
            stations.map((s) => (
              <View key={s.id} className="bg-white rounded-xl p-3 mb-2">
                <View className="flex-row items-center justify-between">
                  <Text className={`text-sm font-bold flex-1 ${s.isActive ? "text-gray-900" : "text-gray-400"}`}>
                    {s.name}
                    {!s.isActive ? "  (inactive)" : ""}
                  </Text>
                  <Text className="text-xs text-gray-600">
                    {s.miles != null ? `${s.miles} mi` : "-"}
                    {s.km != null ? ` · ${s.km} km` : ""}
                  </Text>
                </View>
                {s.raceTypes.length > 0 ? (
                  <Text className="text-xs text-gray-500 mt-1">{s.raceTypes.join(", ")}</Text>
                ) : null}
                <Text selectable className="text-xs text-gray-700 mt-1">
                  {s.latitude != null && s.longitude != null
                    ? `${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}`
                    : "No coordinates"}
                </Text>
                <View className="flex-row mt-2">
                  {s.mapUrl ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(s.mapUrl as string)}
                      className="flex-row items-center mr-4"
                    >
                      <Ionicons name="map-outline" size={14} color="#189AB4" />
                      <Text className="text-xs font-semibold text-primary ml-1">Open in Maps</Text>
                    </TouchableOpacity>
                  ) : null}
                  {s.recentRaces.length > 0 ? (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/live-race",
                          params: { raceId: String(s.recentRaces[0].id) },
                        })
                      }
                      className="flex-row items-center"
                    >
                      <Ionicons name="flag-outline" size={14} color="#189AB4" />
                      <Text className="text-xs font-semibold text-primary ml-1" numberOfLines={1}>
                        Last race: {s.recentRaces[0].name}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
