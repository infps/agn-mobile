import BreederExportButton from "@/components/BreederExportButton";
import { ApprovalBanner } from "@/components/EventShared";
import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { downloadAndShare } from "@/service/download.service";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
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

const HOTSPOT_GATES = [
  { gate: "HS1", label: "Hot Spot 1" },
  { gate: "HS2", label: "Hot Spot 2" },
  { gate: "HS3", label: "Hot Spot 3" },
  { gate: "FINAL", label: "Final" },
];

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
    api.get(`/breeder/event/${eventId}/payment-status`)
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, [eventId]);

  const toast = useToast();
  // The registration's own id and approval state come from payment-status.
  const [status, setStatus] = useState<{
    eventInventoryId: number;
    approvalStatus?: string | null;
    totalPaid: number;
  } | null>(null);
  const [working, setWorking] = useState<null | "receipt" | "cancel">(null);

  const getReceipt = async () => {
    setWorking("receipt");
    const result = await downloadAndShare(
      `/breeder/event/${eventId}/receipt`,
      `receipt-event-${eventId}.pdf`
    );
    setWorking(null);
    if (!result.ok) toast.error(result.problem || "Could not fetch the receipt");
  };

  // POST pay-hotspot opens a PENDING payment for the gate (the server prices it
  // and refuses a gate that is closed, already settled or unpriced). Only the
  // PayPal method is offered: the route's CASH method records the fee as paid
  // on the spot, which is not something a breeder should do for themselves.
  const [hotspotBusy, setHotspotBusy] = useState<string | null>(null);
  const payHotspot = async (gate: string) => {
    setHotspotBusy(gate);
    try {
      const res = await api.post(`/breeder/event/${eventId}/pay-hotspot`, {
        hotspot: gate,
        paymentMethod: "PAYPAL",
      });
      toast.success(res.data?.message || "Hot spot payment created");
      router.push("/payments" as any);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not start the hot spot payment");
    } finally {
      setHotspotBusy(null);
    }
  };

  // DELETE registration/[inventoryId] only succeeds while nothing has been paid.
  const cancelRegistration = () => {
    if (!status) return;
    Alert.alert(
      "Cancel registration",
      "This removes your registration and its birds from the event. It cannot be undone.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel registration",
          style: "destructive",
          onPress: async () => {
            setWorking("cancel");
            try {
              await api.delete(`/breeder/event/${eventId}/registration/${status.eventInventoryId}`);
              toast.success("Registration cancelled");
              router.back();
            } catch (err: any) {
              toast.error(err?.response?.data?.message || "Could not cancel the registration");
            } finally {
              setWorking(null);
            }
          },
        },
      ]
    );
  };

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
            <View style={{ marginHorizontal: -16, marginTop: -12 }}>
              <ApprovalBanner status={status?.approvalStatus} />
            </View>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={getReceipt}
                disabled={working !== null}
                className="flex-row items-center border border-primary rounded-lg px-3 py-2 bg-white"
              >
                {working === "receipt" ? (
                  <ActivityIndicator size="small" color="#189AB4" />
                ) : (
                  <Ionicons name="receipt-outline" size={16} color="#189AB4" />
                )}
                <Text className="text-primary text-xs font-semibold ml-1">Receipt (PDF)</Text>
              </TouchableOpacity>
              <BreederExportButton kind="registrations" eventId={eventId} label="Export" />
              {data.balance > 0 ? (
                <TouchableOpacity
                  onPress={() => router.push("/payments" as any)}
                  className="flex-row items-center rounded-lg px-3 py-2 bg-[#FFC439]"
                >
                  <Text className="text-black text-xs font-bold">Pay balance</Text>
                </TouchableOpacity>
              ) : null}
              {status && status.totalPaid === 0 ? (
                <TouchableOpacity
                  onPress={cancelRegistration}
                  disabled={working !== null}
                  className="flex-row items-center border border-red-300 rounded-lg px-3 py-2 bg-white"
                >
                  <Text className="text-red-600 text-xs font-semibold">
                    {working === "cancel" ? "Cancelling…" : "Cancel registration"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {/* Hot spot fee: one gate is paid, whichever is still open. */}
            <View className="bg-white border border-gray-200 rounded-xl p-4">
              <Text className="font-semibold text-gray-800">Hot spot fee</Text>
              <Text className="text-[11px] text-gray-500 mt-0.5">
                Choose the gate to pay at. This creates the payment; you then complete it with PayPal on the Payments screen.
              </Text>
              <View className="flex-row flex-wrap mt-2" style={{ gap: 8 }}>
                {HOTSPOT_GATES.map((g) => (
                  <TouchableOpacity
                    key={g.gate}
                    onPress={() => payHotspot(g.gate)}
                    disabled={hotspotBusy !== null}
                    className="border border-primary rounded-lg px-3 py-2"
                  >
                    <Text className="text-primary text-xs font-semibold">
                      {hotspotBusy === g.gate ? "…" : g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
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
                            {p.date ? format(new Date(p.date), "MMM dd, yyyy") : "-"}
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

export { ErrorBoundary } from "@/components/ErrorScreen";
