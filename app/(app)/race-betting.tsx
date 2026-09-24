import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Bet {
  category: string;
  tierIndex: number;
  bettorId: number;
  isYours: boolean;
  stakePaymentId: string | null;
  stakePaid: boolean;
}

interface BirdEntry {
  raceItemId: number;
  band: string;
  ownerUserId: number;
  ownerName: string;
  isOwnBird: boolean;
  bets: Bet[];
}

interface Pool {
  category: string;
  tierIndex: number;
  amount: number;
}

interface BetData {
  birds: BirdEntry[];
  pools: Pool[];
  bettingOpen: boolean;
  raceStatus: string;
}

/** One line of the cart. */
interface Selection {
  raceItemId: number;
  category: string;
  tierIndex: number;
  amount: number;
}

function cartKey(raceItemId: number, category: string, tierIndex: number): string {
  return `${raceItemId}-${category}-${tierIndex}`;
}

/** Poll every 3s, and give up after ~2 minutes rather than spinning forever. */
const POLL_MS = 3000;
const MAX_POLLS = 40;

const RaceBetting = () => {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  const toast = useToast();
  const [data, setData] = useState<BetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [pickerBird, setPickerBird] = useState<BirdEntry | null>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Map<string, Selection>>(new Map());

  // A poll that outlives the screen would set state on a component that is
  // gone, and keep asking the API for two more minutes.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetch = async () => {
    try {
      const res = await api.get(`/breeder/race/${raceId}/bet`);
      setData(res.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load betting data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [raceId]);

  const availablePools = (bird: BirdEntry): Pool[] => {
    if (!data) return [];
    return data.pools.filter(
      (p) =>
        !bird.bets.some(
          (b) => b.category === p.category && b.tierIndex === p.tierIndex
        )
    );
  };

  // Race must be REGISTERING to bet at all. Within that: own birds always
  // bettable; other birds only once admin opens the pool (data.bettingOpen).
  const registering = data?.raceStatus === "REGISTERING";
  const canBet = (bird: BirdEntry) =>
    registering && (bird.isOwnBird || !!data?.bettingOpen);

  /** Band or owner, so the bettor can find a bird either way they remember it. */
  const birds = useMemo(() => {
    const all = data?.birds ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (b) =>
        (b.band ?? "").toLowerCase().includes(q) ||
        (b.ownerName ?? "").toLowerCase().includes(q)
    );
  }, [data?.birds, query]);

  const selections = useMemo(() => Array.from(cart.values()), [cart]);
  const total = useMemo(
    () => selections.reduce((sum, s) => sum + s.amount, 0),
    [selections]
  );

  const togglePool = (bird: BirdEntry, pool: Pool) => {
    const key = cartKey(bird.raceItemId, pool.category, pool.tierIndex);
    setCart((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else
        next.set(key, {
          raceItemId: bird.raceItemId,
          category: pool.category,
          tierIndex: pool.tierIndex,
          amount: pool.amount,
        });
      return next;
    });
  };

  const countFor = (raceItemId: number) =>
    selections.filter((s) => s.raceItemId === raceItemId).length;

  /**
   * Pay for everything in the cart at once.
   *
   * Mirrors the flow in payments.tsx — create the order, hand the approval URL
   * to the browser, poll until PayPal says approved, then capture. A bettor
   * picking across several birds pays once rather than once per bet, which is
   * also the only way the stake total in the order matches what they agreed to.
   */
  const handlePay = async () => {
    if (selections.length === 0) {
      toast.error("Nothing selected");
      return;
    }

    // Identity only. The server prices each selection itself, and sending our
    // figure back would give the two a way to disagree.
    const payload = selections.map((s) => ({
      raceItemId: s.raceItemId,
      category: s.category,
      tierIndex: s.tierIndex,
    }));

    try {
      setPaying(true);

      const orderRes = await api.post("/payment/paypal/create-bet-order", {
        raceId: Number(raceId),
        selections: payload,
        currency: "USD",
      });

      const { orderID, approveUrl } = orderRes.data as {
        orderID: string;
        approveUrl?: string;
        total: number;
      };
      if (!approveUrl) {
        toast.error("PayPal did not return an approval link");
        setPaying(false);
        return;
      }

      WebBrowser.openBrowserAsync(approveUrl);

      let polls = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        polls += 1;

        if (polls > MAX_POLLS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPaying(false);
          toast.error("Timed out waiting for PayPal. Nothing was charged.");
          return;
        }

        try {
          const statusRes = await api.post("/payment/paypal/check-status", { orderID });
          if (!statusRes.data?.isApproved && !statusRes.data?.isCompleted) return;

          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;

          try {
            const captureRes = await api.post("/payment/paypal/capture-bet-order", {
              orderID,
              raceId: Number(raceId),
              selections: payload,
            });
            const placed = captureRes.data?.betsCreated ?? payload.length;
            toast.success(`${placed} bet${placed === 1 ? "" : "s"} placed`);
            setCart(new Map());
            await fetch();
          } catch (captureErr: any) {
            toast.error(
              captureErr?.response?.data?.message || "Failed to capture payment"
            );
          } finally {
            setPaying(false);
          }
        } catch {
          // One failed check is not a failed payment — a sleeping dev server
          // will drop a request. Keep polling until the cap.
        }
      }, POLL_MS);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to start payment");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Race Betting" />

      {!registering && (
        <View className="mx-4 mt-3 bg-red-500 rounded-lg px-4 py-3">
          <Text className="text-white font-bold text-center">Betting Closed</Text>
        </View>
      )}
      {registering && !data?.bettingOpen && (
        <View className="mx-4 mt-3 bg-amber-500 rounded-lg px-4 py-3">
          <Text className="text-white font-bold text-center">
            Open betting not started — you can only bet your own birds
          </Text>
        </View>
      )}

      <View className="px-4 pt-3">
        <View className="flex-row items-center bg-white rounded-lg px-3 h-11 border border-gray-200">
          <Ionicons name="search" size={18} color="#6b7280" />
          <TextInput
            className="flex-1 ml-2 text-sm text-gray-900"
            placeholder="Search band or owner"
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={birds}
        keyExtractor={(item) => String(item.raceItemId)}
        contentContainerStyle={{
          padding: 16,
          // Clear the sticky bar, so the last row is not hidden under it.
          paddingBottom: cart.size > 0 ? 140 : 40,
          gap: 8,
        }}
        renderItem={({ item }) => {
          const pools = availablePools(item);
          const eligible = canBet(item);
          const tappable = eligible && pools.length > 0;
          const chosen = countFor(item.raceItemId);

          return (
            <TouchableOpacity
              disabled={!tappable}
              activeOpacity={0.7}
              onPress={() => setPickerBird(item)}
              className={`bg-white rounded-lg p-4 ${tappable ? "" : "opacity-40"}`}
              style={{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4 }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-sm">{item.band}</Text>
                  {item.isOwnBird && (
                    <View className="bg-green-500 px-2 py-0.5 rounded-full">
                      <Text className="text-white text-[10px] font-bold">Yours</Text>
                    </View>
                  )}
                  {chosen > 0 && (
                    <View className="bg-primary px-2 py-0.5 rounded-full">
                      <Text className="text-white text-[10px] font-bold">{chosen} picked</Text>
                    </View>
                  )}
                </View>
                <Text className="text-gray-500 text-xs">{item.ownerName}</Text>
              </View>

              {item.bets.length > 0 && (
                <View className="flex-row flex-wrap gap-1 mb-2">
                  {item.bets.map((b, i) => {
                    const chipColor = b.stakePaid
                      ? "bg-green-100 border-green-400"
                      : b.isYours
                      ? "bg-blue-100 border-blue-400"
                      : "bg-gray-100 border-gray-300";
                    const textColor = b.stakePaid
                      ? "text-green-700"
                      : b.isYours
                      ? "text-blue-700"
                      : "text-gray-600";
                    return (
                      <View key={i} className={`border rounded px-2 py-0.5 ${chipColor}`}>
                        <Text className={`text-[10px] font-medium ${textColor}`}>
                          {b.category} {b.tierIndex}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text className="text-gray-400 text-[11px]">
                {!eligible
                  ? "Not open to you yet"
                  : pools.length === 0
                  ? "Already in every pool"
                  : `Tap to pick from ${pools.length} pool${pools.length === 1 ? "" : "s"}`}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-gray-500">
              {query ? "No bird matches that" : "No birds in this race"}
            </Text>
          </View>
        }
      />

      <Modal visible={!!pickerBird} transparent animationType="slide" onRequestClose={() => setPickerBird(null)}>
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={() => setPickerBird(null)}
        >
          <View className="bg-white rounded-t-2xl p-4" style={{ maxHeight: "60%" }}>
            <Text className="text-base font-bold mb-1">Select Pools</Text>
            <Text className="text-gray-500 text-xs mb-3">
              {pickerBird?.band} — {pickerBird?.ownerName}
            </Text>

            <FlatList
              data={pickerBird ? availablePools(pickerBird) : []}
              keyExtractor={(p) => `${p.category}-${p.tierIndex}`}
              renderItem={({ item: pool }) => {
                if (!pickerBird) return null;
                const picked = cart.has(
                  cartKey(pickerBird.raceItemId, pool.category, pool.tierIndex)
                );
                return (
                  <TouchableOpacity
                    className={`flex-row items-center justify-between border rounded-lg px-4 py-3 mb-2 ${
                      picked ? "border-primary bg-primary/5" : "border-gray-200"
                    }`}
                    onPress={() => togglePool(pickerBird, pool)}
                  >
                    <View className="flex-row items-center flex-1">
                      <Ionicons
                        name={picked ? "checkbox" : "square-outline"}
                        size={20}
                        color={picked ? "#189AB4" : "#9ca3af"}
                      />
                      <View className="ml-3">
                        <Text className="text-sm font-medium">
                          {pool.category} Tier {pool.tierIndex}
                        </Text>
                        <Text className="text-primary text-xs mt-0.5">${pool.amount}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="py-8 items-center">
                  <Text className="text-gray-500">This bird is already in every pool</Text>
                </View>
              }
            />

            <TouchableOpacity
              className="mt-2 rounded-lg bg-gray-100 py-3 items-center"
              onPress={() => setPickerBird(null)}
            >
              <Text className="text-sm font-bold text-gray-700">Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {cart.size > 0 && (
        <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-200 px-4 pt-3 pb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs text-gray-500">
              {cart.size} bet{cart.size === 1 ? "" : "s"} selected
            </Text>
            <Text className="text-xl font-bold">${total.toFixed(2)}</Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              disabled={paying}
              onPress={() => setCart(new Map())}
              className={`flex-1 rounded-lg bg-gray-100 py-3 items-center ${paying ? "opacity-50" : ""}`}
            >
              <Text className="text-sm font-bold text-gray-700">Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={paying}
              onPress={handlePay}
              className={`flex-[2] rounded-lg bg-primary py-3 items-center ${paying ? "opacity-60" : ""}`}
            >
              {paying ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Pay ${total.toFixed(2)}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default RaceBetting;
