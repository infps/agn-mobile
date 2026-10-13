import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import { useResponsive } from "@/hooks/useResponsive";
import api from "@/service/api.service";
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
  BETTING_OPEN: "cash-outline",
  PAYMENT_DUE: "card-outline",
  EVENT_MESSAGE: "chatbubble-outline",
  BIRD_LOST: "alert-circle-outline",
  STORE_LISTING: "pricetag-outline",
};

// Same wording as the portal's notifications page.
const KIND_LABEL: Record<string, string> = {
  RACE_STARTED: "Race released",
  BIRD_ARRIVED: "Arrival",
  RACE_ENDED: "Results",
  BETTING_OPEN: "Betting",
  PAYMENT_DUE: "Payment",
  EVENT_MESSAGE: "Announcement",
  BIRD_LOST: "Lost bird",
  STORE_LISTING: "Event store",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Where a notification leads.
 *
 * The server writes portal paths into `link` — /races/12, /events/4, /payments.
 * Those are turned into the matching screens here; anything unrecognised simply
 * does not navigate.
 */
function destination(
  n: Notification
): { pathname: string; params?: Record<string, string> } | null {
  const link = n.link ?? "";
  const race = link.match(/^\/races\/(\d+)/);
  if (race) return { pathname: "/live-race", params: { raceId: race[1] } };
  const event = link.match(/^\/events\/(\d+)/);
  // event-detail reads `id`.
  if (event) return { pathname: "/event-detail", params: { id: event[1] } };
  if (link.startsWith("/payments")) return { pathname: "/payments" };
  if (n.raceId) return { pathname: "/live-race", params: { raceId: String(n.raceId) } };
  return null;
}

/**
 * What has happened while you were not looking.
 *
 * A bird clocking in is the notification people actually open the app for, so
 * an unread one is marked plainly down the left rather than with a count
 * somewhere else. Tapping one marks it read and goes where the portal's link
 * would have gone.
 */
export default function Notifications() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get("/notifications", { params: { limit: 100 } });
      setItems(data?.notifications ?? []);
      setUnread(data?.unreadCount ?? 0);
    } catch {
      setError("Could not load your notifications just now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Race day moves quickly, so the feed refreshes itself — as the portal's does.
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      // No ids means "everything".
      await api.post("/notifications", {});
      await load();
    } catch {
      toast.error("Could not mark notifications as read");
    } finally {
      setMarking(false);
    }
  };

  const markOneRead = async (id: number) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnread((c) => Math.max(0, c - 1));
    try {
      await api.post("/notifications", { ids: [id] });
    } catch {
      // The next refresh puts the truth back.
    }
  };

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
            <View className="flex-row items-center justify-between py-3">
              <Text className="text-sm text-gray-500">{unread} unread</Text>
              <Pressable
                onPress={markAllRead}
                disabled={marking}
                className="flex-row items-center rounded-lg border border-primary px-3 py-1.5"
              >
                <Ionicons name="checkmark-done-outline" size={14} color="#189AB4" />
                <Text className="ml-1 text-xs font-semibold text-primary">
                  {marking ? "Marking…" : "Mark all read"}
                </Text>
              </Pressable>
            </View>
          )}

          {error ? (
            <View className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">{error}</Text>
            </View>
          ) : null}

          {items.length === 0 ? (
            <View className="mt-6 rounded-xl border border-gray-200 p-8">
              <Text className="text-center text-sm text-gray-500">
                Nothing yet. Race releases, arrivals, results, betting and payment
                reminders land here.
              </Text>
            </View>
          ) : (
            <View className="mt-2 overflow-hidden rounded-xl border border-gray-200">
              {items.map((n, index) => {
                const isUnread = !n.readAt;
                const dest = destination(n);
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => {
                      if (isUnread) markOneRead(n.id);
                      if (dest) router.push(dest as any);
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
                        {KIND_LABEL[n.kind] ?? n.kind} · {relativeTime(n.createdAt)}
                      </Text>
                    </View>

                    {dest ? (
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
