import Header from "@/components/header";
import api from "@/service/api.service";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AveragesDetail() {
  const { avgId, eventId, name } = useLocalSearchParams<{ avgId: string; eventId: string; name: string }>();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/breeder/event/${eventId}/averages/${avgId}/results`)
      .then((r) => setResults(r.data.results ?? []))
      .catch(() => setError("Could not load results."))
      .finally(() => setLoading(false));
  }, [avgId, eventId]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={name ?? "Averages"} />

      {loading ? (
        <ActivityIndicator className="mt-8" />
      ) : error ? (
        <Text className="text-red-500 text-center mt-8">{error}</Text>
      ) : (
        <>
          <View className="flex-row bg-primary p-3 mx-2 mt-2">
            <Text className="text-white text-xs font-bold w-10">#</Text>
            <Text className="text-white text-xs font-bold flex-1">Band</Text>
            <Text className="text-white text-xs font-bold flex-1">Breeder</Text>
            <Text className="text-white text-xs font-bold w-16 text-right">Avg YPM</Text>
            <Text className="text-white text-xs font-bold w-12 text-right">Races</Text>
          </View>
          <FlatList
            data={results}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item, index }) => (
              <View className="flex-row p-3 mx-2 border-b border-gray-100 items-center">
                <Text className="text-sm w-10 text-gray-500">{item.rank ?? index + 1}</Text>
                <Text className="text-sm flex-1">{item.band || "—"}</Text>
                <Text className="text-sm flex-1 text-gray-600" numberOfLines={1}>{item.breederName}</Text>
                <Text className="text-sm w-16 text-right font-medium">
                  {item.avgSpeedYPM != null ? item.avgSpeedYPM.toFixed(1) : "—"}
                </Text>
                <Text className="text-sm w-12 text-right text-gray-500">{item.racesFlown}</Text>
              </View>
            )}
            ListEmptyComponent={<Text className="text-center text-gray-500 mt-8">No results yet</Text>}
          />
        </>
      )}
    </SafeAreaView>
  );
}
