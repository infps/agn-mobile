import { raceRoute } from "@/components/EventShared";
import Header from "@/components/header";
import api from "@/service/api.service";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Every past race of an event, season by season — the portal's
 * /events/[eventId]/archive page, from GET /api/public/event/[eventId]/archive.
 */

interface ArchiveRace {
  id: number;
  name: string;
  raceNumber: number | null;
  liberation: string | null;
  station: string | null;
  miles: number | null;
  km: number | null;
  raceType: string | null;
  prizeRole: string;
  status: string;
  birdCount: number;
}

interface ArchiveSeason {
  seasonId: number;
  seasonName: string;
  startDate: string | null;
  races: ArchiveRace[];
}

export default function EventArchive() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [seasons, setSeasons] = useState<ArchiveSeason[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    api
      .get(`/public/event/${eventId}/archive`)
      .then((r) => {
        setSeasons(r.data?.seasons ?? []);
        setTotal(r.data?.totalRaces ?? 0);
      })
      .catch((e) => setError(e?.response?.data?.message ?? "Could not load the archive."))
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Race Archive" />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : error ? (
        <Text className="text-center text-red-500 mt-10 px-6">{error}</Text>
      ) : seasons.length === 0 ? (
        <Text className="text-center text-gray-500 mt-10">No races have been flown for this event yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <Text className="text-xs text-gray-500 mb-2">
            {total} race{total === 1 ? "" : "s"} across {seasons.length} season{seasons.length === 1 ? "" : "s"}
          </Text>
          {seasons.map((season) => (
            <View key={season.seasonId} className="bg-white rounded-xl mb-4 overflow-hidden">
              <View className="bg-gray-100 px-3 py-2 flex-row justify-between">
                <Text className="font-bold text-gray-800">{season.seasonName}</Text>
                <Text className="text-xs text-gray-500">{season.races.length} races</Text>
              </View>
              {season.races.map((race, i) => (
                <TouchableOpacity
                  key={race.id}
                  onPress={() => router.push(raceRoute(race) as any)}
                  className="flex-row px-3 py-3 border-t border-gray-100 items-center"
                >
                  <Text className="w-6 text-xs text-gray-500">{i + 1}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">
                      {race.name}
                      {race.prizeRole && race.prizeRole !== "NONE" ? (
                        <Text className="text-[11px] text-amber-700">
                          {"  "}
                          {race.prizeRole.replace("_", " ").toLowerCase()}
                        </Text>
                      ) : null}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {race.liberation ? format(new Date(race.liberation), "yyyy-MM-dd HH:mm") : "-"}
                      {race.raceType ? ` · ${race.raceType}` : ""}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {race.station ?? "-"} · {race.miles != null ? `${race.miles} mi` : "-"}
                      {race.km != null ? ` / ${race.km} km` : ""} · {race.birdCount} birds
                    </Text>
                  </View>
                  <Text className="text-xs text-cyan-700 font-semibold">Results</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
