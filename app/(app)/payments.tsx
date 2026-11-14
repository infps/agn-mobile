import BreederExportButton from "@/components/BreederExportButton";
import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Payments — the portal's /payments page plus paying what is still owed.
 *
 * GET /api/breeder/payments returns each payment with a numeric status and the
 * event nested at eventInventory.season.event (there is no eventInventory.event).
 *
 * Paying goes through /payment/paypal/create-bulk even for a single payment,
 * because that route returns PayPal's own `approveUrl`. The per-payment route
 * (/breeder/payment/[id]/pay) returns only an order id, which is enough for the
 * portal's JS SDK button but gives a phone nowhere to send the payer.
 */

interface Payment {
  id: number;
  paymentValue: number | null;
  paymentMethod: number | null;
  paymentType: number | null;
  paymentDate: string | null;
  paymentDesc?: string | null;
  transactionId?: string | null;
  status: number;
  eventInventory?: {
    season?: { event?: { id: number; name: string; eventDate?: string } | null } | null;
  } | null;
}

// Same tables as the portal's payments/columns.tsx.
const TYPE_LABELS: Record<number, string> = {
  0: "Perch Fee",
  1: "Per Bird Fee",
  2: "Races Fee",
  3: "Payouts",
  4: "Other",
};
const METHOD_LABELS: Record<number, string> = {
  0: "Cash",
  1: "Credit Card",
  2: "PayPal",
  3: "Bank Transfer",
};
const STATUS: Record<number, { label: string; className: string }> = {
  0: { label: "Pending", className: "text-yellow-600" },
  1: { label: "Paid", className: "text-green-600" },
  2: { label: "Partial", className: "text-amber-600" },
  3: { label: "Failed", className: "text-red-600" },
  4: { label: "Refunded", className: "text-gray-500" },
};

const POLL_MS = 3000;
const MAX_POLLS = 100; // five minutes

const eventOf = (p: Payment) => p.eventInventory?.season?.event ?? null;

const PaymentsList = () => {
  const toast = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventFilter, setEventFilter] = useState<number | "ALL">("ALL");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [paying, setPaying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/breeder/payments");
      setPayments(res.data?.payments || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to fetch payments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of payments) {
      const ev = eventOf(p);
      if (ev?.id != null) map.set(ev.id, ev.name ?? `Event ${ev.id}`);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [payments]);

  const visible = useMemo(
    () => (eventFilter === "ALL" ? payments : payments.filter((p) => eventOf(p)?.id === eventFilter)),
    [payments, eventFilter]
  );

  const { total, paid } = useMemo(() => {
    let t = 0;
    let pd = 0;
    for (const p of visible) {
      const v = p.paymentValue ?? 0;
      t += v;
      if (p.status === 1) pd += v;
    }
    return { total: t, paid: pd };
  }, [visible]);
  const remaining = total - paid;

  const pendingVisible = useMemo(() => visible.filter((p) => p.status === 0), [visible]);

  const selectedTotal = useMemo(
    () =>
      Array.from(selected).reduce(
        (sum, id) => sum + (payments.find((p) => p.id === id)?.paymentValue || 0),
        0
      ),
    [selected, payments]
  );

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPendingSelected =
    pendingVisible.length > 0 && pendingVisible.every((p) => selected.has(p.id));

  const toggleAll = () =>
    setSelected(allPendingSelected ? new Set() : new Set(pendingVisible.map((p) => p.id)));

  const handlePay = async () => {
    const paymentIds = Array.from(selected);
    if (paymentIds.length === 0) {
      toast.error("No payments selected");
      return;
    }
    const amount = selectedTotal;

    try {
      setPaying(true);
      const orderRes = await api.post("/payment/paypal/create-bulk", {
        paymentIds,
        currency: "USD",
      });
      const { orderID, approveUrl } = orderRes.data as { orderID: string; approveUrl?: string };
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
          toast.error("Timed out waiting for PayPal. Pull to refresh to check your payments.");
          load();
          return;
        }

        try {
          const statusRes = await api.post("/payment/paypal/check-status", { orderID });
          if (!statusRes.data?.isApproved && !statusRes.data?.isCompleted) return;

          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;

          try {
            const captureRes = await api.post("/payment/paypal/capture-bulk", {
              orderID,
              paymentIds,
            });
            if (captureRes.data?.status === "COMPLETED") {
              toast.success(`Payment of $${amount.toFixed(2)} completed`);
              setSelected(new Set());
            } else {
              toast.error("Payment incomplete. Please try again.");
            }
          } catch (captureErr: any) {
            toast.error(captureErr?.response?.data?.message || "Failed to capture payment");
          } finally {
            setPaying(false);
            load();
          }
        } catch {
          // One failed check is not a failed payment. Keep polling until the cap.
        }
      }, POLL_MS);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to start payment");
      setPaying(false);
    }
  };

  const renderItem = ({ item, index }: { item: Payment; index: number }) => {
    const isPending = item.status === 0;
    const isSelected = selected.has(item.id);
    const st = STATUS[item.status];
    return (
      <TouchableOpacity
        className="bg-white mx-2 mb-2 rounded-lg p-3 flex-row items-center"
        onPress={() => isPending && toggle(item.id)}
        disabled={!isPending || paying}
        activeOpacity={isPending ? 0.7 : 1}
      >
        <View className="w-7">
          {isPending ? (
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={20}
              color={isSelected ? "#189AB4" : "#999"}
            />
          ) : (
            <Text className="text-xs text-gray-400">{index + 1}</Text>
          )}
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
            {eventOf(item)?.name || "-"}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {item.paymentType != null ? TYPE_LABELS[item.paymentType] ?? String(item.paymentType) : "-"}
            {" · "}
            {item.paymentMethod != null
              ? METHOD_LABELS[item.paymentMethod] ?? String(item.paymentMethod)
              : "-"}
            {" · "}
            {item.paymentDate ? format(new Date(item.paymentDate), "MMM d, yyyy") : "-"}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-sm font-bold text-gray-800">
            ${(item.paymentValue ?? 0).toFixed(2)}
          </Text>
          <Text className={`text-xs font-semibold ${st?.className ?? "text-gray-600"}`}>
            {st?.label ?? String(item.status)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Payments" />

      {/* Event filter + export */}
      <View className="flex-row items-center px-2 mt-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1 mr-2">
          {[{ id: "ALL" as const, name: "All events" }, ...eventOptions].map((e) => {
            const active = eventFilter === e.id;
            return (
              <TouchableOpacity
                key={String(e.id)}
                onPress={() => setEventFilter(e.id)}
                className={`px-3 py-2 rounded-full mr-2 ${active ? "bg-primary" : "bg-white"}`}
              >
                <Text className={`text-xs font-semibold ${active ? "text-white" : "text-gray-700"}`}>
                  {e.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <BreederExportButton
          kind="payments"
          eventId={eventFilter === "ALL" ? undefined : eventFilter}
        />
      </View>

      {/* Summary */}
      <View className="mx-2 mt-2 p-3 bg-white rounded-lg flex-row justify-between">
        <View className="items-center flex-1">
          <Text className="text-[10px] text-gray-500">Total Amount</Text>
          <Text className="text-sm font-bold">${total.toFixed(2)}</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[10px] text-gray-500">Total Paid</Text>
          <Text className="text-sm font-bold text-green-600">${paid.toFixed(2)}</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[10px] text-gray-500">Remaining</Text>
          <Text className={`text-sm font-bold ${remaining > 0 ? "text-red-500" : "text-green-600"}`}>
            ${remaining.toFixed(2)}
          </Text>
        </View>
      </View>

      {pendingVisible.length > 0 && (
        <TouchableOpacity onPress={toggleAll} disabled={paying} className="flex-row items-center mx-3 mt-3">
          <Ionicons
            name={allPendingSelected ? "checkbox" : "square-outline"}
            size={18}
            color={allPendingSelected ? "#189AB4" : "#999"}
          />
          <Text className="text-xs text-gray-600 ml-2">
            Select all pending ({pendingVisible.length})
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: selected.size > 0 ? 130 : 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={
            <View className="items-center py-12">
              <Ionicons name="card-outline" size={40} color="#9ca3af" />
              <Text className="text-gray-500 mt-2">No payment transactions yet.</Text>
            </View>
          }
        />
      )}

      {selected.size > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm text-gray-600">
              {selected.size} payment{selected.size > 1 ? "s" : ""} selected
            </Text>
            <Text className="text-lg font-bold text-primary">${selectedTotal.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            className="bg-[#FFC439] py-3 rounded-lg items-center"
            onPress={handlePay}
            disabled={paying}
          >
            {paying ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text className="text-black font-bold text-base">Pay with PayPal</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

export default PaymentsList;

export { ErrorBoundary } from "@/components/ErrorScreen";
