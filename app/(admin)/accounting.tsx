import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import api from "@/service/api.service";
import { downloadAndShare } from "@/service/download.service";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/context/ToastContext";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useAdminData } from "@/hooks/useAdminData";
import { EventPicker } from "@/components/admin/EventPicker";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Field,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Sheet,
  money,
  tabular,
} from "@/components/admin/ui";
import { Caption, Segments, fullName } from "@/components/admin/MoneyBits";
import {
  RegistrationMoneySheet,
  type RegistrationMoney,
} from "@/components/admin/RegistrationMoneySheet";

interface LedgerLine {
  eventInventoryId: number;
  breederId: number | null;
  breederName: string;
  loft: string | null;
  charged: number;
  paid: number;
  refunded: number;
  /** Recorded as owed back to the breeder, not yet paid. */
  refundOwed?: number;
  prizeEarned: number;
  classEarned: number;
  balance: number;
  owedOut: number;
  cashPromised: boolean;
}

interface Totals {
  charged: number;
  paid: number;
  refunded: number;
  prizeEarned: number;
  classEarned: number;
  balance: number;
  owedOut: number;
}

interface Refund {
  id: number;
  amount: number;
  reason: string | null;
  method: string | null;
  reference: string | null;
  issuedAt: string;
  /** ISSUED once the money has gone back; OWED while it is still in our hands. */
  status: string;
  eventInventory?: {
    id: number;
    loft: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  } | null;
}

type LedgerView = "ledger" | "unpaid" | "earned";
type View_ = LedgerView | "refunds";

const BLURBS: Record<View_, string> = {
  ledger: "Every registration in the season, both directions",
  unpaid: "Registrations still carrying a balance",
  earned: "Prize and class money not yet paid out",
  refunds: "Money given back, and money still due back",
};

/** How many ledger lines are drawn before somebody asks for more. */
const PAGE = 100;

/**
 * The season ledger, and everything done against it.
 *
 * What a phone is good for is the question asked across a table at an event —
 * "does this man owe anything?" — so the two filtered views come first and the
 * full ledger sits behind them. Opening a line gives that registration's
 * payments, and taking, correcting or refunding money happens right there,
 * because it is the same conversation: somebody is told a balance and hands
 * over cash for it, and walking back to a desk to key it in later is how a
 * payment gets forgotten.
 *
 * Both directions are shown because a breeder can owe entry fees and be owed
 * prize money in the same season, and netting them without saying so is how
 * arguments start.
 *
 * Refunds get their own view rather than a footnote under the ledger. A refund
 * that is owed but not yet paid is money the organiser is still holding, and it
 * should be findable without scrolling past every registration to reach it.
 */
export default function AdminAccounting() {
  const { can, canAny } = usePermissions();
  const { gutter } = useResponsive();
  const toast = useToast();
  const action = useAdminAction();

  // Reached from an event's own menu this opens on that event; from the tab bar
  // it falls back to the picker's newest.
  const params = useLocalSearchParams<{ eventId?: string }>();
  const startOn = params.eventId && /^\d+$/.test(params.eventId) ? Number(params.eventId) : null;
  const [eventId, setEventId] = useState<number | null>(startOn);
  const [view, setView] = useState<View_>("unpaid");
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refused, setRefused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [opened, setOpened] = useState<LedgerLine | null>(null);
  const [settling, setSettling] = useState<Refund | null>(null);
  const [settlement, setSettlement] = useState({ method: "", reference: "" });
  const [confirmingSettle, setConfirmingSettle] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);

  const maySeeRefunds = canAny("refunds.view", "refunds.manage");
  const mayRefund = can("refunds.manage");
  const mayReport = can("reports.view");
  const ledgerView: LedgerView = view === "refunds" ? "ledger" : view;

  const load = useCallback(async () => {
    if (eventId == null) return;
    setError(null);
    setRefused(false);
    try {
      const { data } = await api.get(`/admin/event/${eventId}/accounting?view=${ledgerView}`);
      setLines(data?.lines ?? []);
      // Only the full ledger carries season totals; the filtered views carry a
      // single number, which is the total that matters for that view.
      setTotals(data?.totals ?? null);
      setSeasonId(data?.seasonId ?? null);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) setRefused(true);
      else
        setError(
          status === 404
            ? "This event has no active season, so there is nothing to total up yet."
            : "Could not load the ledger."
        );
      setLines([]);
      setTotals(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, ledgerView]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Fetched only when somebody actually looks at refunds.
  const refundsReq = useAdminData<{ refunds?: Refund[]; total?: number; owed?: number }>(
    view === "refunds" && eventId != null && maySeeRefunds ? `/admin/event/${eventId}/refunds` : null,
    [view, eventId]
  );
  const refunds = refundsReq.data?.refunds ?? [];
  const owedRefunds = refunds.filter((r) => r.status === "OWED");
  const issuedRefunds = refunds.filter((r) => r.status !== "OWED");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) =>
        l.breederName.toLowerCase().includes(q) || (l.loft ?? "").toLowerCase().includes(q)
    );
  }, [lines, query]);

  // A new search or a new view starts from the top of the list again.
  useEffect(() => setShown(PAGE), [query, view, eventId]);

  const viewTotal = useMemo(() => {
    if (view === "unpaid") return visible.reduce((s, l) => s + l.balance, 0);
    if (view === "earned") return visible.reduce((s, l) => s + l.owedOut, 0);
    return null;
  }, [visible, view]);

  const refundWho = (r: Refund) =>
    fullName(r.eventInventory?.breeder, r.eventInventory?.loft || "Unnamed");

  const settleRefund = async () => {
    if (!settling || eventId == null) return;
    const { ok, data: said } = await action.run<{ message?: string }>(
      "patch",
      `/admin/event/${eventId}/refunds`,
      {
        refundId: settling.id,
        method: settlement.method.trim() || null,
        reference: settlement.reference.trim() || null,
      }
    );
    setConfirmingSettle(false);
    if (ok) {
      toast.success(said?.message ?? `${money(settling.amount)} marked as refunded.`);
      setSettling(null);
      refundsReq.reload();
      load();
    }
  };

  /** The two files the portal offers from this tab, rendered there and shared from here. */
  const fetchReport = async (key: string, format: "pdf" | "xlsx") => {
    if (seasonId == null) {
      toast.error("There is no season to report on yet.");
      return;
    }
    setFetching(key);
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await downloadAndShare(
      `/admin/reports/${key}?format=${format}&seasonId=${seasonId}`,
      `${key}-${stamp}.${format}`
    );
    setFetching(null);
    if (!result.ok && result.problem) toast.error(result.problem);
  };

  if (!canAny("accounting.view", "accounting.manage") || refused) {
    return <NoAccess what="The ledger" />;
  }

  const opening: RegistrationMoney | null = opened;

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">Accounting</Text>

      <View className="mt-3">
        <EventPicker value={eventId} onChange={(id) => setEventId(id)} />
      </View>

      <View className="mt-3">
        <Segments<View_>
          value={view}
          onChange={setView}
          options={[
            { key: "ledger", label: "Everyone" },
            { key: "unpaid", label: "Owes us" },
            { key: "earned", label: "We owe" },
            ...(maySeeRefunds ? [{ key: "refunds" as const, label: "Refunds" }] : []),
          ]}
        />
      </View>
      <Text className="mt-1.5 text-xs text-slate-500">{BLURBS[view]}</Text>

      {loading ? (
        <Loading />
      ) : (
        <ScrollView
          className="mt-3 flex-1"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing || refundsReq.refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
                if (view === "refunds") refundsReq.refresh();
              }}
            />
          }
        >
          {error ? (
            <View className="mb-3">
              <Notice>{error}</Notice>
            </View>
          ) : null}

          {view === "refunds" ? (
            refundsReq.loading ? (
              <Loading />
            ) : refundsReq.forbidden ? (
              <Notice>Refunds are not part of your access.</Notice>
            ) : refundsReq.error ? (
              <Notice>{refundsReq.error}</Notice>
            ) : (
              <>
                <FigureRow>
                  <Figure label="Refunds" value={refunds.length} basis="31%" />
                  <Figure
                    label="Given back"
                    value={money(refundsReq.data?.total ?? 0)}
                    tone="text-blue-600"
                    basis="31%"
                  />
                  <Figure
                    label="Still due back"
                    value={money(refundsReq.data?.owed ?? 0)}
                    tone={(refundsReq.data?.owed ?? 0) > 0 ? "text-rose-600" : "text-slate-900"}
                    basis="31%"
                  />
                </FigureRow>

                <Text className="mt-3 text-xs text-slate-400">
                  A refund is issued against a registration — open one from any of the ledger
                  views to give money back.
                </Text>

                {owedRefunds.length > 0 ? (
                  <>
                    <Caption>Due back, not yet paid</Caption>
                    <Rows>
                      {owedRefunds.map((r) => (
                        <Row
                          key={r.id}
                          title={refundWho(r)}
                          subtitle={[r.eventInventory?.loft, r.reason].filter(Boolean).join(" · ") || undefined}
                          right={money(r.amount)}
                          rightTone="text-rose-600"
                          rightSub={mayRefund ? "mark paid" : undefined}
                          onPress={
                            mayRefund
                              ? () => {
                                  setSettlement({ method: "", reference: "" });
                                  setSettling(r);
                                }
                              : undefined
                          }
                        />
                      ))}
                    </Rows>
                  </>
                ) : null}

                <Caption>Refunds issued</Caption>
                {issuedRefunds.length === 0 ? (
                  <Empty>Nothing has been refunded this season.</Empty>
                ) : (
                  <Rows>
                    {issuedRefunds.map((r) => (
                      <Row
                        key={r.id}
                        title={refundWho(r)}
                        subtitle={
                          [
                            r.reason,
                            r.method,
                            r.reference ? `ref ${r.reference}` : null,
                            new Date(r.issuedAt).toLocaleDateString(),
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                        right={money(r.amount)}
                        rightTone="text-blue-600"
                      />
                    ))}
                  </Rows>
                )}
              </>
            )
          ) : (
            <>
              {view === "ledger" && totals ? (
                <View className="mb-3" style={{ marginTop: -16 }}>
                  <FigureRow>
                    <Figure label="Charged" value={money(totals.charged)} />
                    <Figure label="Collected" value={money(totals.paid)} tone="text-emerald-600" />
                    <Figure label="Refunded" value={money(totals.refunded)} />
                    <Figure
                      label="Still owed to us"
                      value={money(totals.balance)}
                      tone="text-rose-600"
                    />
                    <Figure label="Owed out" value={money(totals.owedOut)} tone="text-blue-600" />
                  </FigureRow>
                </View>
              ) : null}

              {viewTotal != null ? (
                <View
                  className={`mb-3 rounded-xl p-4 ${view === "unpaid" ? "bg-rose-50" : "bg-blue-50"}`}
                >
                  <Text
                    className={`text-2xl font-bold ${
                      view === "unpaid" ? "text-rose-700" : "text-blue-700"
                    }`}
                    style={tabular}
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
              ) : null}

              {mayReport ? (
                <View className="mb-3" style={{ marginTop: -12 }}>
                  <ButtonRow>
                    <Button
                      label="Ledger PDF"
                      tone="secondary"
                      icon="download-outline"
                      onPress={() => fetchReport("season-ledger", "pdf")}
                      pending={fetching === "season-ledger"}
                      disabled={fetching != null || seasonId == null}
                      full
                    />
                    <Button
                      label="Prize statements"
                      tone="secondary"
                      icon="download-outline"
                      onPress={() => fetchReport("prize-statements", "xlsx")}
                      pending={fetching === "prize-statements"}
                      disabled={fetching != null || seasonId == null}
                      full
                    />
                  </ButtonRow>
                </View>
              ) : null}

              <View className="mb-3">
                <SearchBar value={query} onChange={setQuery} placeholder="Breeder or loft" />
              </View>

              {visible.length === 0 ? (
                <Empty>
                  {query.trim()
                    ? "No registration matches that search."
                    : view === "unpaid"
                      ? "Nobody owes anything on this season."
                      : view === "earned"
                        ? "Nothing is waiting to be paid out."
                        : "No registrations on this season yet."}
                </Empty>
              ) : (
                <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {visible.slice(0, shown).map((line, index) => {
                    const won = line.prizeEarned + line.classEarned;
                    return (
                      <Pressable
                        key={line.eventInventoryId}
                        onPress={() => setOpened(line)}
                        className={`flex-row items-center gap-3 px-4 py-3 ${
                          index > 0 ? "border-t border-slate-100" : ""
                        }`}
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>
                            {line.breederName || "Unnamed"}
                          </Text>
                          <Text className="text-xs text-slate-500" numberOfLines={1}>
                            {line.loft || "No loft"}
                            {line.cashPromised ? " · cash promised" : ""}
                          </Text>
                          <Text className="text-xs text-slate-400" numberOfLines={1} style={tabular}>
                            charged {money(line.charged)} · paid {money(line.paid)}
                            {line.refunded ? ` · refunded ${money(line.refunded)}` : ""}
                            {won ? ` · won ${money(won)}` : ""}
                          </Text>
                          {line.refundOwed ? (
                            <Text className="text-xs font-medium text-rose-600" style={tabular}>
                              due to breeder {money(line.refundOwed)}
                            </Text>
                          ) : null}
                        </View>
                        <View className="items-end">
                          {line.balance > 0 ? (
                            <Text className="text-sm font-semibold text-rose-600" style={tabular}>
                              {money(line.balance)}
                            </Text>
                          ) : null}
                          {line.owedOut > 0 ? (
                            <Text className="text-sm font-semibold text-blue-600" style={tabular}>
                              {money(line.owedOut)}
                            </Text>
                          ) : null}
                          {line.balance < 0 ? (
                            <Text className="text-xs text-slate-500" style={tabular}>
                              overpaid {money(-line.balance)}
                            </Text>
                          ) : null}
                          {line.balance === 0 && line.owedOut <= 0 ? (
                            <Text className="text-xs text-slate-400">settled</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {visible.length > shown ? (
                <ButtonRow>
                  <Button
                    label={`Show more — ${shown} of ${visible.length} shown`}
                    tone="secondary"
                    onPress={() => setShown((n) => n + PAGE)}
                    full
                  />
                </ButtonRow>
              ) : null}
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <RegistrationMoneySheet
        open={opened != null}
        onClose={() => setOpened(null)}
        eventId={eventId}
        registration={opening}
        onChanged={() => {
          // The figures on the open line are now stale; close on the summary
          // the reload will redraw rather than leave an old balance on screen.
          setOpened(null);
          load();
        }}
      />

      <Sheet
        open={settling != null}
        onClose={() => setSettling(null)}
        title={`Pay back ${money(settling?.amount)}`}
        subtitle={settling ? `Due to ${refundWho(settling)}` : null}
      >
        <Field
          label="Method (optional)"
          value={settlement.method}
          onChange={(v) => setSettlement({ ...settlement, method: v })}
          placeholder="Cash, cheque, PayPal"
        />
        <Field
          label="Reference (optional)"
          value={settlement.reference}
          onChange={(v) => setSettlement({ ...settlement, reference: v })}
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setSettling(null)} full />
          <Button label="Mark as refunded" onPress={() => setConfirmingSettle(true)} full />
        </ButtonRow>

        <Confirm
          open={confirmingSettle}
          title={`Mark ${money(settling?.amount)} as paid back?`}
          body={`This records that ${money(settling?.amount)} has gone back to ${
            settling ? refundWho(settling) : "the breeder"
          } today. It cannot be undone from here.`}
          confirmLabel="Mark refunded"
          pending={action.pending}
          onConfirm={settleRefund}
          onCancel={() => setConfirmingSettle(false)}
        />
      </Sheet>
    </View>
  );
}
