import Header from "@/components/header";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PAGE = 20;

interface Message {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  eventId: number;
  event: { id: number; name: string; shortName?: string | null };
  season: { id: number; name: string };
  author: { id: string; name: string; lastName?: string | null };
}

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (off: number, replace: boolean) => {
    setError(null);
    try {
      const { data } = await api.get("/breeder/messages", { params: { limit: PAGE, offset: off } });
      const fetched: Message[] = data.messages ?? [];
      setMessages((prev) => replace ? fetched : [...prev, ...fetched]);
      setTotal(data.total ?? 0);
      setOffset(off);
    } catch {
      setError("Could not load messages.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(0, true); }, [load]);

  const refresh = () => { setRefreshing(true); load(0, true); };
  const loadMore = () => { setLoadingMore(true); load(offset + PAGE, false); };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Messages" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Messages" />
      <FlatList
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        refreshing={refreshing}
        onRefresh={refresh}
        ListEmptyComponent={
          error ? (
            <Text className="text-center text-red-500 mt-8">{error}</Text>
          ) : (
            <Text className="text-center text-gray-400 mt-8">No announcements yet</Text>
          )
        }
        ListFooterComponent={
          offset + PAGE < total ? (
            <TouchableOpacity
              onPress={loadMore}
              disabled={loadingMore}
              className="items-center py-4"
            >
              {loadingMore ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text className="text-cyan-600 font-semibold">Load more</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="bg-white border border-gray-200 rounded-xl p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <View className="bg-cyan-50 border border-cyan-200 rounded-full px-2 py-0.5">
                <Text className="text-cyan-700 text-[10px] font-medium">
                  {item.event?.shortName ?? item.event?.name ?? "Event"}
                </Text>
              </View>
            </View>
            <Text className="font-bold text-gray-900 text-base">{item.title}</Text>
            <Text className="text-gray-600 text-sm mt-1" numberOfLines={2}>{item.body}</Text>
            <View className="flex-row items-center justify-between mt-3">
              <Text className="text-gray-400 text-xs">
                {item.author?.name}{item.author?.lastName ? ` ${item.author.lastName}` : ""}
              </Text>
              <View className="flex-row items-center gap-1">
                <Ionicons name="time-outline" size={12} color="#9CA3AF" />
                <Text className="text-gray-400 text-xs">
                  {item.createdAt ? format(new Date(item.createdAt), "MMM dd, yyyy") : ""}
                </Text>
              </View>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
