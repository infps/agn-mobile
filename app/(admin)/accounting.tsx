import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/context/ToastContext";
import { useAdminAction } from "@/hooks/useAdminAction";
import { EventPicker } from "@/components/admin/EventPicker";
import { Button, ButtonRow, Field, Sheet } from "@/components/admin/ui";

interface LedgerLine {
  eventInventoryId: number;
  breederId: number | null;
  breederName: string;
  loft: string | null;
  charged: number;
  penalties: number;
  paid: number;
  refunded: number;
  prizeEarned: number;
  classEarned: number;
  balance: number;
  owedOut: number;
  cashPromised: boolean;
}

interface Totals {
  charged: number;
  penalties: number;
  paid: number;
  refunded: number;
  prizeEarned: number;
  classEarned: number;
  balance: number;
  owedOut: number;
}

type LedgerView = "ledger" | "unpaid" | "earned";

const VIEWS: Array<{ key: LedgerView; label: string; blurb: string }> = [
  { key: "ledger", label: "Everyone", blurb: "Every registration in the season" },
  { key: "unpaid", label: "Owes us", blurb: "Registrations still carrying a balance" },
  { key: "earned", label: "We owe", blurb: "Prize and class money not yet paid out" },
];

const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * One total in the ledger header.
 *
 * At module scope: declared inside the screen it was a new component type on
 * every render, so React discarded and rebuilt all four figures each time the
 * ledger reloaded or a character was typed into the search box.
 */
function Figure({
  label,
  value,
  tone,
  isWide,
}: {
  label: string;
  value: number;
  tone: string;
  isWide: boolean;
}) {
  return (
    <View
      className="rounded-xl border border-slate-200 bg-white p-4"
      style={{ flexGrow: 1, flexBasis: isWide ? "23%" : "47%" }}
    >
      <Text className={`text-lg font-bold ${tone}`} style={{ fontVariant: ["tabular-nums"] }}>
        {money(value)}
      </Text>
      <Text className="mt-0.5 text-xs text-slate-500">{label}</Text>
    </View>
  );
}

/**
 * The season ledger, and taking money against it.
 *
 * What a phone is good for is the question asked across a table at an event —
 * "does this man owe anything?" — so the two filtered views come first and the
 * full ledger sits behind them. Recording the payment belongs in the same
 * place, because it is the same conversation: somebody is told a balance and
 * hands over cash for it, and walking back to a desk to key it in later is how
 * a payment gets forgotten.
 *
 * The amount is prefilled with what is owed rather than left blank. A part
 * payment is typed over it; a full one is the common case and should not need
 * somebody retyping a figure that is already on the screen.
 *
 * Both directions are shown because a breeder can owe entry fees and be owed
 * prize money in the same season, and netting them without saying so is how
 * arguments start.
 */
export default function AdminAccounting() {
  const { can } = usePermissions();
  const { isWide, gutter } = useResponsive();
  const toast = useToast();
  const action = useAdminAction();
  const [paying, setPaying] = useState<LedgerLine | null>(null);
  const [payment, setPayment] = useState({ amount: "", method: "", reference: "", note: "" });

  const [eventId, setEventId] = useState<number | null>(null);
  const [view, setView] = useState<LedgerView>("unpaid");
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (eventId == null) return;
    setError(null);
    try {
      const { data } = await api.get(
        `/admin/event/${eventId}/accounting?view=${view}`
      );
      setLines(data?.lines ?? []);
      // Only the full ledger carries season totals; the filtered views carry a
      // single number, which is the total that matters for that view.
      setTotals(data?.totals ?? null);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? "This event has no active season, so there is nothing to total up yet."
          : "Could not load the ledger."
      );
      setLines([]);
      setTotals(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, view]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const mayTakeMoney = can("payments.manage");

  const openPayment = (line: LedgerLine) => {
    setPayment({
      amount: line.balance > 0 ? line.balance.toFixed(2) : "",
      method: "",
      reference: "",
      note: "",
    });
    setPaying(line);
  };

  const recordPayment = async () => {
    if (!paying) return;
    const amount = parseFloat(payment.amount.trim());
    if (!payment.amount.trim() || isNaN(amount) || amount <= 0) {
      toast.error("Give an amount above zero.");
      return;
    }
    const { ok } = await action.run(
      "post",
      "/admin/payment",
      {
        eventInventoryId: paying.eventInventoryId,
        breederId: paying.breederId,
        amountPaid: amount,
        method: payment.method.trim() || undefined,
        referenceNumber: payment.reference.trim() || undefined,
        description: payment.note.trim() || undefined,
      },
      { success: `${money(amount)} recorded.` }
    );
    if (ok) {
      setPaying(null);
      load();
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) =>
        l.breederName.toLowerCase().includes(q) ||
        (l.loft ?? "").toLowerCase().includes(q)
    );
  }, [lines, query]);

  const viewTotal = useMemo(() => {
    if (view === "unpaid") return visible.reduce((s, l) => s + l.balance, 0);
    if (view === "earned") return visible.reduce((s, l) => s + l.owedOut, 0);
    return null;
  }, [visible, view]);

  if (!can("accounting.view") && !can("accounting.manage")) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Ionicons name="lock-closed-outline" size={28} color="#94a3b8" />
        <Text className="mt-3 text-center text-sm text-slate-500">
          The ledger is not part of your access.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">Accounting</Text>

      <View className="mt-3">
        <EventPicker value={eventId} onChange={(id) => setEventId(id)} />
      </View>

      <View className="mt-3 flex-row rounded-xl border border-slate-200 bg-white p-1">
        {VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <Pressable
              key={v.key}
              onPress={() => setView(v.key)}
              className={`flex-1 rounded-lg py-2 ${active ? "bg-blue-600" : ""}`}
            >
              <Text
                className={`text-center text-sm font-medium ${
                  active ? "text-white" : "text-slate-600"
                }`}
              >
                {v.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-1.5 text-xs text-slate-500">
        {VIEWS.find((v) => v.key === view)?.blurb}
      </Text>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView
          className="mt-3 flex-1"
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
          {error && (
            <View className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">{error}</Text>
            </View>
          )}

          {view === "ledger" && totals && (
            <View className="mb-3 flex-row flex-wrap" style={{ gap: 10 }}>
              <Figure label="Charged" value={totals.charged} tone="text-slate-900" isWide={isWide} />
              <Figure label="Collected" value={totals.paid} tone="text-emerald-600" isWide={isWide} />
              <Figure label="Still owed to us" value={totals.balance} tone="text-rose-600" isWide={isWide} />
              <Figure label="Owed out" value={totals.owedOut} tone="text-blue-600" isWide={isWide} />
            </View>
          )}

          {viewTotal != null && (
            <View
              className={`mb-3 rounded-xl p-4 ${
                view === "unpaid" ? "bg-rose-50" : "bg-blue-50"
              }`}
            >
              <Text
                className={`text-2xl font-bold ${
                  view === "unpaid" ? "text-rose-700" : "text-blue-700"
                }`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {money(viewTotal)}
              </Text>
              <Text
                className={`mt-0.5 text-xs ${
                  view === "unpaid" ? "text-rose-600" : "text-blue-600"
                }`}
              >
                across {visible.length} registration{visible.length === 1 ? "" : "s"}
              </Text>
            </View>
          )}

          <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Breeder or loft"
              placeholderTextColor="#94a3b8"
              className="flex-1 py-2.5 text-sm text-slate-900"
            />
          </View>

          {visible.length === 0 ? (
            <View className="rounded-xl border border-slate-200 bg-white p-8">
              <Text className="text-center text-sm text-slate-500">
                {view === "unpaid"
                  ? "Nobody owes anything on this season."
                  : view === "earned"
                    ? "Nothing is waiting to be paid out."
                    : "No registrations on this season yet."}
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {visible.slice(0, 200).map((line, index) => (
                <Pressable
                  key={line.eventInventoryId}
                  onPress={mayTakeMoney ? () => openPayment(line) : undefined}
                  disabled={!mayTakeMoney}
                  className={`flex-row items-center gap-3 px-4 py-3 ${
                    index > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-900">
                      {line.breederName || "Unnamed"}
                    </Text>
                    <Text className="text-xs text-slate-500">
                      {line.loft || "No loft"}
                      {line.cashPromised ? " · cash promised" : ""}
                    </Text>
                  </View>
                  <View className="items-end">
                    {line.balance > 0 && (
                      <Text
                        className="text-sm font-semibold text-rose-600"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {money(line.balance)}
                      </Text>
                    )}
                    {line.owedOut > 0 && (
                      <Text
                        className="text-sm font-semibold text-blue-600"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {money(line.owedOut)}
                      </Text>
                    )}
                    {line.balance <= 0 && line.owedOut <= 0 && (
                      <Text className="text-xs text-slate-400">settled</Text>
                    )}
                  </View>
                  {mayTakeMoney ? (
                    <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                  ) : null}
                </Pressable>
              ))}
              {visible.length > 200 && (
                <Text className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-400">
                  Showing the first 200 of {visible.length}. The full ledger is in the portal.
                </Text>
              )}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <Sheet
        open={paying != null}
        onClose={() => setPaying(null)}
        title={`Take payment from ${paying?.breederName || "this breeder"}`}
        subtitle={
          paying && paying.balance > 0
            ? `They owe ${money(paying.balance)}`
            : "Nothing is outstanding — this records a payment anyway"
        }
      >
        <Field
          label="Amount"
          value={payment.amount}
          onChange={(v) => setPayment({ ...payment, amount: v })}
          keyboard="decimal-pad"
          autoFocus
        />
        <Field
          label="Method"
          value={payment.method}
          onChange={(v) => setPayment({ ...payment, method: v })}
          placeholder="Cash, cheque, transfer"
        />
        <Field
          label="Reference"
          value={payment.reference}
          onChange={(v) => setPayment({ ...payment, reference: v })}
          placeholder="Cheque number, transaction id"
        />
        <Field
          label="Note"
          value={payment.note}
          onChange={(v) => setPayment({ ...payment, note: v })}
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setPaying(null)} full />
          <Button label="Record it" onPress={recordPayment} pending={action.pending} full />
        </ButtonRow>
      </Sheet>
    </View>
  );
}
