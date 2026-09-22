import Header from "@/components/header";
import api from "@/service/api.service";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EventDefaulters() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [defaulters, setDefaulters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/breeder/event/${eventId}/defaulters`)
      .then((r) => setDefaulters(r.data.defaulters ?? []))
      .catch(() => setError("Could not load defaulters."))
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Defaulters" />

      {loading ? (
        <ActivityIndicator className="mt-8" />
      ) : error ? (
        <Text className="text-red-500 text-center mt-8">{error}</Text>
      ) : (
        <>
          <View className="flex-row bg-primary p-3 mx-2 mt-2">
            <Text className="text-white text-xs font-bold w-8">#</Text>
            <Text className="text-white text-xs font-bold flex-1">Breeder</Text>
            <Text className="text-white text-xs font-bold w-20">Loft</Text>
            <Text className="text-white text-xs font-bold w-14 text-right">Birds</Text>
          </View>
          <FlatList
            data={defaulters}
            keyExtractor={(item) => String(item.eventInventoryId)}
            renderItem={({ item, index }) => (
              <View className="flex-row p-3 mx-2 border-b border-gray-100 items-center">
                <Text className="text-sm w-8 text-gray-500">{index + 1}</Text>
                <Text className="text-sm flex-1">{item.breederName || "Unknown"}</Text>
                <Text className="text-sm w-20 text-gray-600" numberOfLines={1}>{item.loft || "—"}</Text>
                <Text className="text-sm w-14 text-right text-red-500">{item.birds?.length ?? 0}</Text>
              </View>
            )}
            ListEmptyComponent={<Text className="text-center text-gray-500 mt-8">No defaulters</Text>}
          />
        </>
      )}
    </SafeAreaView>
  );
}
