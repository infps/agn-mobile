import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
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

const RaceBetting = () => {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  const toast = useToast();
  const [data, setData] = useState<BetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [pickerBird, setPickerBird] = useState<BirdEntry | null>(null);

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

  const placeBet = async (pool: Pool) => {
    if (!pickerBird) return;
    setPlacing(true);
    try {
      await api.post(`/breeder/race/${raceId}/bet`, {
        raceItemId: pickerBird.raceItemId,
        category: pool.category,
        tierIndex: pool.tierIndex,
      });
      toast.success("Bet placed");
      setPickerBird(null);
      await fetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to place bet");
    } finally {
      setPlacing(false);
    }
  };

  // Race must be REGISTERING to bet at all. Within that: own birds always
  // bettable; other birds only once admin opens the pool (data.bettingOpen).
  const registering = data?.raceStatus === "REGISTERING";
  const canBet = (bird: BirdEntry) =>
    registering && (bird.isOwnBird || !!data?.bettingOpen);

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

      <FlatList
        data={data?.birds ?? []}
        keyExtractor={(item) => String(item.raceItemId)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}
        renderItem={({ item }) => {
          const pools = availablePools(item);
          return (
            <View className="bg-white rounded-lg p-4" style={{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4 }}>
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-sm">{item.band}</Text>
                  {item.isOwnBird && (
                    <View className="bg-green-500 px-2 py-0.5 rounded-full">
                      <Text className="text-white text-[10px] font-bold">Yours</Text>
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

              {canBet(item) && pools.length > 0 && (
                <TouchableOpacity
                  className="bg-primary rounded px-3 py-1.5 self-start"
                  onPress={() => setPickerBird(item)}
                >
                  <Text className="text-white text-xs font-bold">Bet</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-gray-500">No birds in this race</Text>
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
            <Text className="text-base font-bold mb-1">Select Pool</Text>
            <Text className="text-gray-500 text-xs mb-3">{pickerBird?.band} — {pickerBird?.ownerName}</Text>

            {placing ? (
              <View className="py-8 items-center">
                <ActivityIndicator size="small" />
              </View>
            ) : (
              <FlatList
                data={pickerBird ? availablePools(pickerBird) : []}
                keyExtractor={(p) => `${p.category}-${p.tierIndex}`}
                renderItem={({ item: pool }) => (
                  <TouchableOpacity
                    className="border border-gray-200 rounded-lg px-4 py-3 mb-2"
                    onPress={() => placeBet(pool)}
                  >
                    <Text className="text-sm font-medium">
                      {pool.category} Tier {pool.tierIndex}
                    </Text>
                    <Text className="text-primary text-xs mt-0.5">${pool.amount}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text className="text-gray-400 text-center py-4">No available pools</Text>
                }
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default RaceBetting;
