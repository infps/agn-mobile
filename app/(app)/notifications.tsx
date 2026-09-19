import Header from "@/components/header";
import api from "@/service/api.service";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Notification {
  id: number;
  kind: string;
  title: string | null;
  body: string | null;
  link: string | null;
  raceId: number | null;
  seasonId: number | null;
  readAt: string | null;
  createdAt: string;
}

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  BIRD_ARRIVED: "airplane-outline",
  RACE_STARTED: "flag-outline",
  RACE_ENDED: "trophy-outline",
  PAYMENT_DUE: "card-outline",
  MESSAGE: "chatbubble-outline",
};

/**
 * What has happened while you were not looking.
 *
 * A bird clocking in is the notification people actually open the app for, so
 * an unread one is marked plainly down the left rather than with a count
 * somewhere else. Tapping a race notification goes to that race, because the
 * next thing anybody wants after "your bird is home" is the standings.
 */
export default function Notifications() {
  const { gutter } = useResponsive();
  const router = useRouter();

  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get("/notifications");
      setItems(data?.notifications ?? []);
      setUnread(data?.unreadCount ?? 0);
    } catch {
      setError("Could not load your notifications just now.");
      setItems([]);
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
      <Header title="Notifications" />

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
          {unread > 0 && (
            <Text className="py-3 text-sm text-gray-500">
              {unread} unread
            </Text>
          )}

          {error ? (
            <View className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">{error}</Text>
            </View>
          ) : null}

          {items.length === 0 ? (
            <View className="mt-6 rounded-xl border border-gray-200 p-8">
              <Text className="text-center text-sm text-gray-500">
                Nothing yet. You will hear from us when a bird clocks in.
              </Text>
            </View>
          ) : (
            <View className="mt-2 overflow-hidden rounded-xl border border-gray-200">
              {items.map((n, index) => {
                const isUnread = !n.readAt;
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => {
                      if (n.raceId) {
                        router.push({
                          pathname: "/live-race",
                          params: { raceId: String(n.raceId) },
                        });
                      }
                    }}
                    className={`flex-row gap-3 p-4 ${
                      index > 0 ? "border-t border-gray-100" : ""
                    } ${isUnread ? "bg-blue-50/50" : ""}`}
                  >
                    {/* The unread mark sits in the reading path rather than as a
                        badge somewhere else on the screen. */}
                    <View className="pt-1">
                      {isUnread ? (
                        <View className="h-2 w-2 rounded-full bg-blue-600" />
                      ) : (
                        <View className="h-2 w-2" />
                      )}
                    </View>

                    <Ionicons
                      name={ICON[n.kind] ?? "notifications-outline"}
                      size={18}
                      color="#64748b"
                    />

                    <View className="flex-1">
                      <Text
                        className={`text-sm ${
                          isUnread ? "font-semibold text-gray-900" : "text-gray-800"
                        }`}
                      >
                        {n.title ?? n.kind.toLowerCase().replace(/_/g, " ")}
                      </Text>
                      {n.body ? (
                        <Text className="mt-0.5 text-xs text-gray-600">{n.body}</Text>
                      ) : null}
                      <Text className="mt-1 text-xs text-gray-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </Text>
                    </View>

                    {n.raceId ? (
                      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
