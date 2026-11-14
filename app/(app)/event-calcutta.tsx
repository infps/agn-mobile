import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Calcutta auction — live bidding, the portal's /events/[eventId]/calcutta.
 *
 * The portal hears about bids over Pusher. This app carries no realtime
 * client, so it asks GET /api/calcutta/[eventId]/state every two seconds
 * instead: the same route the portal loads from, which already reports the
 * active group, the top bid and when it was placed. Bids go to POST /bid with
 * the amount the server will check is above the current one.
 */

const POLL_MS = 2000;

interface CalcuttaConfig {
  antiSnipeDuration: number;
  biddingDuration: number;
  bidRaiseOptions: number[];
  youtubeStreamUrl: string | null;
  phase: string;
  activeGroupId: number | null;
}

interface ActiveGroup {
  id: number;
  groupNumber: number;
  birdCount: number;
  calculatedPrice: number;
  startingBid: number;
  lastBidAt: string | null;
  birds: { band?: string | null; name?: string | null }[];
  currentBid: number | null;
  bidderName: string | null;
  recentBids: { amount: number; bidderName: string; createdAt: string }[];
}

interface GroupRow {
  id: number;
  groupNumber: number;
  birdCount: number;
  status: string;
  isHouse: boolean;
  startingBid: number;
  finalPrice: number | null;
  owner: { id: string; name: string } | null;
  currentBid: number | null;
}

const GROUP_STATUS: Record<string, string> = {
  PENDING: "Pending",
  EARLY_BOUGHT: "Bought early",
  BIDDING: "Bidding",
  SOLD: "Sold",
  HOUSE: "House",
  COMPLETED: "Completed",
};

export default function EventCalcutta() {
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName?: string }>();
  const toast = useToast();

  const [config, setConfig] = useState<CalcuttaConfig | null>(null);
  const [activeGroup, setActiveGroup] = useState<ActiveGroup | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRaise, setSelectedRaise] = useState<number | null>(null);
  const [bidding, setBidding] = useState(false);
  const [antiSnipeRemaining, setAntiSnipeRemaining] = useState(0);
  const raiseChosen = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/calcutta/${eventId}/state`);
      setConfig(data.config ?? null);
      setActiveGroup(data.activeGroup ?? null);
      setGroups(data.groups ?? []);
      setError(null);
      if (!raiseChosen.current && data.config?.bidRaiseOptions?.length) {
        raiseChosen.current = true;
        setSelectedRaise(data.config.bidRaiseOptions[0]);
      }
    } catch (e: any) {
      // A dropped poll is not worth replacing a working screen with an error.
      setError((prev) => prev ?? e?.response?.data?.message ?? "Could not load the auction.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [eventId, load]);

  // Anti-snipe countdown, counted from the last bid as the portal does.
  const lastBidAt = activeGroup?.lastBidAt ?? null;
  const antiSnipeDuration = config?.antiSnipeDuration ?? 0;
  useEffect(() => {
    if (!lastBidAt || !antiSnipeDuration) {
      setAntiSnipeRemaining(0);
      return;
    }
    const tick = () => {
      const elapsed = (Date.now() - new Date(lastBidAt).getTime()) / 1000;
      setAntiSnipeRemaining(Math.max(0, antiSnipeDuration - elapsed));
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [lastBidAt, antiSnipeDuration]);

  const base = activeGroup ? activeGroup.currentBid ?? activeGroup.startingBid : 0;
  const bidAmount = base + (selectedRaise ?? 0);

  const placeBid = async () => {
    if (!activeGroup || selectedRaise == null) return;
    setBidding(true);
    try {
      await api.post(`/calcutta/${eventId}/bid`, { groupId: activeGroup.id, amount: bidAmount });
      toast.success(`Bid of $${bidAmount.toFixed(2)} placed`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Bid was not accepted");
    } finally {
      setBidding(false);
    }
  };

  const raiseOptions = config?.bidRaiseOptions ?? [];
  const antiSnipePct = antiSnipeDuration ? Math.min(1, antiSnipeRemaining / antiSnipeDuration) : 0;

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Calcutta Auction" />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : error && !config && groups.length === 0 ? (
        <Text className="text-center text-red-500 mt-10 px-6">{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {eventName ? <Text className="text-xs text-gray-500 mb-2">{eventName}</Text> : null}

          {config?.youtubeStreamUrl ? (
            <TouchableOpacity
              onPress={() => WebBrowser.openBrowserAsync(config.youtubeStreamUrl as string)}
              className="flex-row items-center bg-white rounded-xl p-3 mb-3"
            >
              <Ionicons name="logo-youtube" size={22} color="#ef4444" />
              <Text className="ml-2 text-sm font-semibold text-gray-800 flex-1">Watch the live stream</Text>
              <Ionicons name="open-outline" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}

          {!config ? (
            <View className="bg-white rounded-xl py-12 items-center">
              <Text className="text-gray-500 text-sm">The auction has not been set up yet.</Text>
            </View>
          ) : !activeGroup ? (
            <View className="bg-white rounded-xl py-12 items-center">
              <ActivityIndicator color="#189AB4" />
              <Text className="text-gray-500 text-sm mt-3">Waiting for next group...</Text>
            </View>
          ) : (
            <>
              <View className="bg-white rounded-xl p-4">
                <Text className="text-lg font-bold text-gray-900">
                  Group #{activeGroup.groupNumber} — {activeGroup.birdCount} birds
                </Text>
                <View className="flex-row flex-wrap mt-2">
                  {activeGroup.birds.slice(0, 12).map((b, i) => (
                    <View key={i} className="border border-gray-200 rounded-full px-2 py-0.5 mr-1 mb-1">
                      <Text className="text-[11px] text-gray-700">{b.band || b.name || `Bird ${i + 1}`}</Text>
                    </View>
                  ))}
                  {activeGroup.birds.length > 12 ? (
                    <View className="border border-gray-200 rounded-full px-2 py-0.5">
                      <Text className="text-[11px] text-gray-700">+{activeGroup.birds.length - 12}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View className="bg-white rounded-xl p-4 mt-3">
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-xs text-gray-500">Current Bid</Text>
                    <Text className="text-3xl font-bold text-gray-900">${base.toFixed(2)}</Text>
                    {activeGroup.bidderName ? (
                      <Text className="text-xs text-gray-500">{activeGroup.bidderName}</Text>
                    ) : (
                      <Text className="text-xs text-gray-400">Starting bid — no bids yet</Text>
                    )}
                  </View>
                  {antiSnipeRemaining > 0 ? (
                    <View className="items-end">
                      <Text className="text-xs text-gray-500">Anti-snipe</Text>
                      <Text className="text-lg font-bold text-gray-900">{antiSnipeRemaining.toFixed(1)}s</Text>
                    </View>
                  ) : null}
                </View>
                {antiSnipeRemaining > 0 ? (
                  <View className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
                    <View style={{ width: `${antiSnipePct * 100}%`, height: "100%", backgroundColor: "#eab308" }} />
                  </View>
                ) : null}
              </View>

              <View className="mt-3">
                <View className="flex-row flex-wrap">
                  {raiseOptions.map((opt) => {
                    const active = selectedRaise === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => setSelectedRaise(opt)}
                        className={`px-4 py-2 rounded-lg mr-2 mb-2 border ${
                          active ? "bg-primary border-primary" : "bg-white border-gray-300"
                        }`}
                      >
                        <Text className={`font-semibold ${active ? "text-white" : "text-gray-800"}`}>+${opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  onPress={placeBid}
                  disabled={bidding || selectedRaise == null}
                  className={`py-4 rounded-xl items-center ${
                    bidding || selectedRaise == null ? "bg-gray-300" : "bg-primary"
                  }`}
                >
                  <Text className="text-white font-bold text-base">
                    {bidding ? "Placing bid..." : `Bid $${bidAmount.toFixed(2)}`}
                  </Text>
                </TouchableOpacity>
              </View>

              {activeGroup.recentBids.length > 0 ? (
                <View className="bg-white rounded-xl p-4 mt-3">
                  <Text className="text-sm font-bold text-gray-800 mb-1">Recent bids</Text>
                  {activeGroup.recentBids.map((b, i) => (
                    <View key={i} className="flex-row justify-between py-1.5 border-t border-gray-100">
                      <Text className="text-xs text-gray-700">{b.bidderName}</Text>
                      <Text className="text-xs font-semibold text-gray-900">${b.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}

          {groups.length > 0 ? (
            <View className="bg-white rounded-xl p-4 mt-3">
              <Text className="text-sm font-bold text-gray-800 mb-1">All groups</Text>
              {groups.map((g) => {
                const price = g.finalPrice ?? g.currentBid ?? g.startingBid;
                return (
                  <View key={g.id} className="flex-row items-center py-2 border-t border-gray-100">
                    <Text className="text-xs font-semibold text-gray-800 w-16">#{g.groupNumber}</Text>
                    <Text className="text-xs text-gray-500 w-16">{g.birdCount} birds</Text>
                    <Text className="text-xs text-gray-600 flex-1" numberOfLines={1}>
                      {GROUP_STATUS[g.status] ?? g.status}
                      {g.owner?.name ? ` · ${g.owner.name}` : g.isHouse ? " · House" : ""}
                    </Text>
                    <Text className="text-xs font-semibold text-gray-900">${Number(price).toFixed(2)}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
