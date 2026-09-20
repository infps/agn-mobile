import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
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
  Screen,
  Sheet,
  Truncated,
  money,
} from "@/components/admin/ui";

interface Defaulter {
  eventInventoryId: number;
  breederName: string;
  loft: string | null;
  cashPromised: boolean | null;
  balanceOwed: number;
  birds: { id: number }[];
}

interface AssessmentRow {
  eventInventoryId: number;
  breederName: string;
  loft: string | null;
  outstanding: number;
  daysLate: number;
  penalty: number;
  existingPenaltyId: number | null;
  cashPromised: boolean;
}

interface Assessment {
  raceName: string;
  daysLate: number;
  config: { mode?: string };
  rows: AssessmentRow[];
  applied: number;
  skippedCashPromised: number;
  warnings: string[];
}

interface Penalty {
  id: number;
  amount: number;
  daysLate: number;
  assessedAt: string;
  waivedAt: string | null;
  waiverReason: string | null;
  eventInventory?: {
    loft: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  } | null;
}

interface Refund {
  id: number;
  amount: number;
  reason: string | null;
  method: string | null;
  issuedAt: string;
  eventInventory?: {
    id: number;
    loft: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  } | null;
}

type Tab = "owing" | "penalties" | "refunds";

/**
 * Entries that have not paid, and the two things done about them.
 *
 * The server decides who counts as a defaulter — it is tied to a specific race
 * date, not to "owes money today" — so this only lists people while that window
 * is open and says so plainly when it is not. Guessing the rule here and having
 * it disagree with the portal would be worse than showing nothing.
 *
 * Penalties and refunds live on the same screen because they are the two ends
 * of the same conversation: one charges somebody for being late, the other
 * gives money back. Both move money, so both are previewed or confirmed with
 * the amount stated, never with a bare "are you sure".
 *
 * Charging penalties is a season-wide sweep rather than a per-breeder action —
 * that is how the portal does it, and doing it one breeder at a time would
 * produce a different set of charges depending on the order somebody tapped.
 */
export default function EventDefaulters() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [tab, setTab] = useState<Tab>("owing");
  const [query, setQuery] = useState("");
  const [charging, setCharging] = useState(false);
  const [waiving, setWaiving] = useState<Penalty | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [refunding, setRefunding] = useState<Defaulter | null>(null);
  const [refund, setRefund] = useState({ amount: "", reason: "", method: "" });

  const mayPenalise = can("penalties.manage");
  const mayWaive = can("penalties.waive");
  const mayRefund = can("refunds.manage");

  const base = eventId ? `/admin/event/${eventId}` : null;

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    defaulters?: Defaulter[];
    isInDefaulterWindow?: boolean;
    paymentRaceDate?: string | null;
  }>(base ? `${base}/defaulters` : null, [eventId]);

  // Each tab pays for its own fetch, so somebody who only ever looks at who
  // owes money never loads the penalty ledger.
  const penaltiesReq = useAdminData<{ assessment?: Assessment; existing?: Penalty[] }>(
    tab === "penalties" && base ? `${base}/penalties` : null,
    [tab, eventId]
  );
  const refundsReq = useAdminData<{ refunds?: Refund[]; total?: number }>(
    tab === "refunds" && base ? `${base}/refunds` : null,
    [tab, eventId]
  );

  const rows = data?.defaulters ?? [];
  const open = data?.isInDefaulterWindow ?? false;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (d) => d.breederName.toLowerCase().includes(q) || (d.loft ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const assessment = penaltiesReq.data?.assessment ?? null;
  const existing = penaltiesReq.data?.existing ?? [];
  const refunds = refundsReq.data?.refunds ?? [];

  const who = (p: Penalty | Refund) =>
    `${p.eventInventory?.breeder?.firstName ?? ""} ${
      p.eventInventory?.breeder?.lastName ?? ""
    }`.trim() ||
    p.eventInventory?.loft ||
    "Unnamed";

  const charge = async () => {
    const { ok, data: said } = await action.run<{ message?: string }>(
      "post",
      `${base}/penalties`
    );
    if (ok) {
      toast.success(said?.message ?? "Penalties charged.");
      setCharging(false);
      penaltiesReq.reload();
      reload();
    }
  };

  const waive = async () => {
    if (!waiving) return;
    if (!waiverReason.trim()) {
      toast.error("A waiver needs a reason on record.");
      return;
    }
    const { ok } = await action.run(
      "post",
      `/admin/penalty/${waiving.id}/waive`,
      { reason: waiverReason.trim() },
      { success: "Penalty waived." }
    );
    if (ok) {
      setWaiving(null);
      setWaiverReason("");
      penaltiesReq.reload();
    }
  };

  const issueRefund = async () => {
    if (!refunding) return;
    const amount = parseFloat(refund.amount.trim());
    if (!refund.amount.trim() || isNaN(amount) || amount <= 0) {
      toast.error("Give an amount above zero.");
      return;
    }
    const { ok } = await action.run(
      "post",
      `${base}/refunds`,
      {
        eventInventoryId: refunding.eventInventoryId,
        amount,
        reason: refund.reason.trim() || null,
        method: refund.method.trim() || null,
      },
      { success: `${money(amount)} refunded.` }
    );
    if (ok) {
      setRefunding(null);
      setRefund({ amount: "", reason: "", method: "" });
      refundsReq.reload();
      reload();
    }
  };

  if (forbidden) return <NoAccess what="Defaulters" />;

  const owed = rows.reduce((s, d) => s + d.balanceOwed, 0);
  const birds = rows.reduce((s, d) => s + (d.birds?.length ?? 0), 0);
  const deadline = data?.paymentRaceDate
    ? new Date(data.paymentRaceDate).toLocaleDateString()
    : null;

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: "owing", label: "Owing", show: true },
    { key: "penalties", label: "Penalties", show: mayPenalise || mayWaive },
    { key: "refunds", label: "Refunds", show: mayRefund },
  ];
  const visibleTabs = TABS.filter((t) => t.show);

  return (
    <Screen
      title="Defaulters"
      subtitle={
        open
          ? `${rows.length} entr${rows.length === 1 ? "y" : "ies"} past the deadline`
          : "The deadline has not passed yet"
      }
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <>
          {visibleTabs.length > 1 ? (
            <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
              {visibleTabs.map((t) => (
                <Button
                  key={t.key}
                  label={t.label}
                  tone={tab === t.key ? "primary" : "secondary"}
                  onPress={() => setTab(t.key)}
                  full
                />
              ))}
            </View>
          ) : null}
          {tab === "owing" && rows.length > 0 ? (
            <View className="mt-3">
              <SearchBar value={query} onChange={setQuery} placeholder="Breeder or loft" />
            </View>
          ) : null}
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          {tab === "owing" ? (
            !open ? (
              <View className="mt-4">
                <Empty>
                  Nobody counts as a defaulter until the payment race has run
                  {deadline ? `, which is set for ${deadline}.` : "."}
                </Empty>
              </View>
            ) : (
              <>
                <FigureRow>
                  <Figure label="Entries" value={rows.length} basis="31%" />
                  <Figure label="Birds affected" value={birds} basis="31%" />
                  <Figure label="Owed" value={money(owed)} tone="text-rose-600" basis="31%" />
                </FigureRow>

                <View className="mt-4">
                  {results.length === 0 ? (
                    <Empty>
                      {rows.length === 0 ? "Everybody has paid." : "No breeder matches that search."}
                    </Empty>
                  ) : (
                    <Rows>
                      {results.map((d) => (
                        <Row
                          key={d.eventInventoryId}
                          title={d.breederName || "Unnamed"}
                          subtitle={`${d.loft ?? "No loft"} · ${d.birds?.length ?? 0} birds${
                            d.cashPromised ? " · cash promised" : ""
                          }`}
                          right={money(d.balanceOwed)}
                          rightTone="text-rose-600"
                          rightSub={mayRefund ? "refund" : undefined}
                          onPress={
                            mayRefund
                              ? () => {
                                  setRefund({ amount: "", reason: "", method: "" });
                                  setRefunding(d);
                                }
                              : undefined
                          }
                        />
                      ))}
                    </Rows>
                  )}
                  <Truncated shown={results.length} total={results.length} />
                </View>
              </>
            )
          ) : null}

          {tab === "penalties" ? (
            penaltiesReq.loading ? (
              <Loading />
            ) : penaltiesReq.error ? (
              <Notice>{penaltiesReq.error}</Notice>
            ) : (
              <>
                <FigureRow>
                  <Figure
                    label="Would be charged"
                    value={(assessment?.rows ?? []).length}
                    basis="31%"
                  />
                  <Figure
                    label="Days late"
                    value={assessment?.daysLate ?? 0}
                    basis="31%"
                  />
                  <Figure
                    label="On the books"
                    value={existing.filter((p) => !p.waivedAt).length}
                    tone="text-rose-600"
                    basis="31%"
                  />
                </FigureRow>

                {assessment?.config?.mode === "NONE" ? (
                  <Notice>
                    This season&apos;s fee scheme has late-payment penalties turned off, so nothing
                    will be charged.
                  </Notice>
                ) : null}
                {(assessment?.warnings ?? []).length > 0 ? (
                  <Notice>{(assessment?.warnings ?? []).slice(0, 2).join(" · ")}</Notice>
                ) : null}

                {mayPenalise && (assessment?.rows ?? []).length > 0 ? (
                  <ButtonRow>
                    <Button
                      label={`Charge ${(assessment?.rows ?? []).length} late entries`}
                      tone="danger"
                      icon="alert-circle-outline"
                      onPress={() => setCharging(true)}
                      disabled={assessment?.config?.mode === "NONE"}
                      full
                    />
                  </ButtonRow>
                ) : null}

                {(assessment?.rows ?? []).length > 0 ? (
                  <>
                    <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Would be charged
                    </Text>
                    <Rows>
                      {(assessment?.rows ?? []).slice(0, 40).map((r) => (
                        <Row
                          key={r.eventInventoryId}
                          title={r.breederName || "Unnamed"}
                          subtitle={`${r.loft ?? "No loft"} · ${money(r.outstanding)} outstanding${
                            r.cashPromised ? " · cash promised, skipped" : ""
                          }`}
                          right={money(r.penalty)}
                          rightTone={r.cashPromised ? "text-slate-400" : "text-rose-600"}
                        />
                      ))}
                    </Rows>
                  </>
                ) : null}

                <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Already charged
                </Text>
                {existing.length === 0 ? (
                  <Empty>No penalty has been charged this season.</Empty>
                ) : (
                  <Rows>
                    {existing.slice(0, 60).map((p) => (
                      <Row
                        key={p.id}
                        title={who(p)}
                        subtitle={
                          p.waivedAt
                            ? `Waived · ${p.waiverReason ?? "no reason given"}`
                            : `${p.daysLate} days late · ${new Date(
                                p.assessedAt
                              ).toLocaleDateString()}`
                        }
                        right={money(p.amount)}
                        rightTone={p.waivedAt ? "text-slate-400" : "text-rose-600"}
                        rightSub={mayWaive && !p.waivedAt ? "waive" : undefined}
                        badge={
                          p.waivedAt
                            ? { label: "waived", bg: "bg-slate-200", text: "text-slate-600" }
                            : null
                        }
                        onPress={
                          mayWaive && !p.waivedAt
                            ? () => {
                                setWaiverReason("");
                                setWaiving(p);
                              }
                            : undefined
                        }
                      />
                    ))}
                  </Rows>
                )}
              </>
            )
          ) : null}

          {tab === "refunds" ? (
            refundsReq.loading ? (
              <Loading />
            ) : refundsReq.error ? (
              <Notice>{refundsReq.error}</Notice>
            ) : (
              <>
                <FigureRow>
                  <Figure label="Refunds" value={refunds.length} basis="47%" />
                  <Figure
                    label="Given back"
                    value={money(refundsReq.data?.total ?? 0)}
                    tone="text-blue-600"
                    basis="47%"
                  />
                </FigureRow>

                <Text className="mt-4 text-xs text-slate-400">
                  A refund is issued against a registration. Open a breeder on the Owing tab to
                  give money back.
                </Text>

                <View className="mt-3">
                  {refunds.length === 0 ? (
                    <Empty>Nothing has been refunded this season.</Empty>
                  ) : (
                    <Rows>
                      {refunds.slice(0, 60).map((r) => (
                        <Row
                          key={r.id}
                          title={who(r)}
                          subtitle={
                            [r.reason, r.method, new Date(r.issuedAt).toLocaleDateString()]
                              .filter(Boolean)
                              .join(" · ") || undefined
                          }
                          right={money(r.amount)}
                          rightTone="text-blue-600"
                        />
                      ))}
                    </Rows>
                  )}
                </View>
              </>
            )
          ) : null}
        </>
      )}

      <Sheet
        open={refunding != null}
        onClose={() => setRefunding(null)}
        title={`Refund ${refunding?.breederName ?? ""}`}
        subtitle={`They owe ${money(refunding?.balanceOwed)} — a refund cannot exceed what was paid`}
      >
        <Field
          label="Amount"
          value={refund.amount}
          onChange={(v) => setRefund({ ...refund, amount: v })}
          keyboard="decimal-pad"
          autoFocus
        />
        <Field
          label="Reason"
          value={refund.reason}
          onChange={(v) => setRefund({ ...refund, reason: v })}
          placeholder="Withdrawn before basketing"
        />
        <Field
          label="Method"
          value={refund.method}
          onChange={(v) => setRefund({ ...refund, method: v })}
          placeholder="Cash, cheque, PayPal"
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setRefunding(null)} full />
          <Button label="Refund" onPress={issueRefund} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={waiving != null}
        onClose={() => setWaiving(null)}
        title={`Waive ${money(waiving?.amount)}`}
        subtitle={`Charged to ${waiving ? who(waiving) : ""}`}
      >
        <Field
          label="Reason"
          value={waiverReason}
          onChange={setWaiverReason}
          placeholder="Payment cleared late through the bank"
          autoFocus
          multiline
          hint="Kept on record against the waiver."
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setWaiving(null)} full />
          <Button label="Waive it" onPress={waive} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={charging}
        title="Charge the late entries?"
        body={`${(assessment?.rows ?? []).length} registrations are past the deadline and grace period${
          (assessment?.skippedCashPromised ?? 0) > 0
            ? `, and ${assessment?.skippedCashPromised} are skipped for having promised cash`
            : ""
        }. Each is charged at the season's fee scheme rate.`}
        confirmLabel="Charge them"
        pending={action.pending}
        onConfirm={charge}
        onCancel={() => setCharging(false)}
      />
    </Screen>
  );
}
