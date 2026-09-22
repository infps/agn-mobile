import Header from "@/components/header";
import api from "@/service/api.service";
import { format } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const statusLabel = (s: number) => {
  switch (s) {
    case 1: return { text: "Paid", cls: "text-green-600" };
    case 2: return { text: "Partial", cls: "text-yellow-600" };
    case 3: return { text: "Failed", cls: "text-red-700" };
    case 4: return { text: "Refunded", cls: "text-gray-500" };
    default: return { text: "Pending", cls: "text-red-500" };
  }
};

interface Item {
  inventoryItemId: number;
  birdNo: number;
  band: string | null;
  birdName: string | null;
  isBackup: boolean;
  entryFeeValue: number;
  perchFeeValue: number;
  hotspotDue: number;
  raceFeeValue: number;
  total: number;
  raceItems: { raceId: number | null; raceName: string; status: string }[];
}

interface Payment {
  id: number;
  value: number;
  status: number;
  date: string | null;
  desc: string | null;
  type: number;
}

interface Breakdown {
  totalOwed: number;
  totalPaid: number;
  balance: number;
  items: Item[];
  payments: Payment[];
}

export default function MyRegistration() {
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName: string }>();
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    api.get(`/breeder/event/${eventId}/fee-breakdown`)
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load registration details."))
      .finally(() => setLoading(false));
  }, [eventId]);

  const title = eventName ?? "Registration";

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title={title} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title={title} />
        <Text className="text-center text-red-500 mt-8">{error ?? "Not registered for this event."}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={title} />
      <FlatList
        data={data.items}
        keyExtractor={(item) => String(item.inventoryItemId)}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        ListHeaderComponent={
          <View className="gap-3">
            {/* Payment summary */}
            <View className="bg-white border border-gray-200 rounded-xl p-4 flex-row justify-between">
              <View className="items-center">
                <Text className="text-[10px] text-gray-500">Total Owed</Text>
                <Text className="font-bold text-sm">${data.totalOwed.toFixed(2)}</Text>
              </View>
              <View className="items-center">
                <Text className="text-[10px] text-gray-500">Paid</Text>
                <Text className="font-bold text-sm text-green-600">${data.totalPaid.toFixed(2)}</Text>
              </View>
              <View className="items-center">
                <Text className="text-[10px] text-gray-500">Balance</Text>
                <Text className={`font-bold text-sm ${data.balance > 0 ? "text-red-500" : "text-green-600"}`}>
                  ${data.balance.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Payment history */}
            {data.payments.length > 0 && (
              <View className="bg-white border border-gray-200 rounded-xl p-4">
                <Text className="font-semibold text-gray-800 mb-2">Payment History</Text>
                {data.payments.map((p) => {
                  const { text, cls } = statusLabel(p.status);
                  return (
                    <View key={p.id} className="flex-row justify-between items-center py-1.5 border-b border-gray-100">
                      <View>
                        <Text className="text-xs text-gray-700">{p.desc ?? `Payment #${p.id}`}</Text>
                        {p.date && (
                          <Text className="text-[10px] text-gray-400">
                            {format(new Date(p.date), "MMM dd, yyyy")}
                          </Text>
                        )}
                      </View>
                      <View className="items-end">
                        <Text className="text-sm font-semibold">${(p.value ?? 0).toFixed(2)}</Text>
                        <Text className={`text-[10px] font-medium ${cls}`}>{text}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text className="font-semibold text-gray-700 mt-1">Registered Birds ({data.items.length})</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View className="bg-white border border-gray-200 rounded-xl p-4">
            <View className="flex-row justify-between items-start mb-2">
              <View>
                <Text className="font-semibold text-gray-900">
                  {item.birdName ?? `Bird #${item.birdNo}`}
                </Text>
                {item.band && <Text className="text-xs text-gray-500">{item.band}</Text>}
                {item.isBackup && (
                  <View className="bg-gray-100 rounded px-1.5 py-0.5 mt-1 self-start">
                    <Text className="text-[10px] text-gray-500">Backup</Text>
                  </View>
                )}
              </View>
              <Text className="font-bold text-cyan-700">${item.total.toFixed(2)}</Text>
            </View>
            <View className="gap-1">
              <FeeRow label="Entry Fee" value={item.entryFeeValue} />
              <FeeRow label="Perch Fee" value={item.perchFeeValue} />
              <FeeRow label="Race Fee" value={item.raceFeeValue} />
              <FeeRow label="Hotspot" value={item.hotspotDue} />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text className="text-center text-gray-400">No birds registered</Text>
        }
      />
    </SafeAreaView>
  );
}

function FeeRow({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-xs text-gray-700">${value.toFixed(2)}</Text>
    </View>
  );
}
