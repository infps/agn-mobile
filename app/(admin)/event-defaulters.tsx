import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import api from "@/service/api.service";
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
  money,
} from "@/components/admin/ui";
import { Caption, Segments, fullName, parseAmount } from "@/components/admin/MoneyBits";
import { RegistrationMoneySheet } from "@/components/admin/RegistrationMoneySheet";

interface DefaulterBird {
  id: number;
  birdNo: number | null;
}

interface Defaulter {
  eventInventoryId: number;
  breederId: number | null;
  breederName: string;
  loft: string | null;
  cashPromised: boolean | null;
  balanceOwed: number;
  birds: DefaulterBird[];
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

interface PenaltyData {
  assessment?: Assessment;
  existing?: Penalty[];
}

interface Refund {
  id: number;
  amount: number;
  reason: string | null;
  method: string | null;
  issuedAt: string;
  status: string;
  eventInventory?: {
    id: number;
    loft: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  } | null;
}

type Tab = "owing" | "penalties" | "refunds";

/**
 * Entries that have not paid, and what gets done about them.
 *
 * The server decides who counts as a defaulter — it is tied to a specific race
 * date, not to "owes money today" — so this only lists people while that window
 * is open and says so plainly when it is not. Guessing the rule here and having
 * it disagree with the portal would be worse than showing nothing.
 *
 * A defaulter can be dealt with three ways, and all three are on the row: take
 * their word that cash is coming, take the money, or put their birds in the
 * store. The first is a promise and is reversible; the other two change who
 * owes what, so they ask first and name the figure.
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
  const { eventId } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [tab, setTab] = useState<Tab>("owing");
  const [query, setQuery] = useState("");
  const [charging, setCharging] = useState(false);
  const [waiving, setWaiving] = useState<Penalty | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [confirmingWaive, setConfirmingWaive] = useState(false);

  /** The defaulter whose sheet is open, and what is staged on it. */
  const [acting, setActing] = useState<Defaulter | null>(null);
  const [price, setPrice] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [listing, setListing] = useState<number[] | null>(null);
  const [paying, setPaying] = useState<Defaulter | null>(null);

  const mayPenalise = can("penalties.manage");
  const mayWaive = can("penalties.waive");
  const maySeeRefunds = canAny("refunds.view", "refunds.manage");
  const mayPromise = can("breeders.manage");
  const mayList = can("store.manage");
  const mayMoney = canAny("payments.manage", "refunds.manage", "breeders.view", "breeders.manage");

  const base = eventId ? `/admin/event/${eventId}` : null;

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    defaulters?: Defaulter[];
    isInDefaulterWindow?: boolean;
    paymentRaceDate?: string | null;
  }>(base ? `${base}/defaulters` : null, [eventId]);

  // Each tab pays for its own fetch, so somebody who only ever looks at who
  // owes money never loads the penalty ledger.
  //
  // Penalties are fetched by hand rather than through useAdminData because one
  // answer has to be told apart from the rest: a bare 404 with no message means
  // the portal this app is talking to does not have the penalties route at all,
  // which is a statement about the server, not a fault and not an empty season.
  const [penalties, setPenalties] = useState<{
    loading: boolean;
    data: PenaltyData | null;
    missing: boolean;
    refused: boolean;
    error: string | null;
  }>({ loading: false, data: null, missing: false, refused: false, error: null });

  const loadPenalties = useCallback(async () => {
    if (!base) return;
    setPenalties((p) => ({ ...p, loading: true, error: null }));
    try {
      const res = await api.get(`${base}/penalties`);
      setPenalties({ loading: false, data: res.data ?? null, missing: false, refused: false, error: null });
    } catch (err: any) {
      const status = err?.response?.status;
      const said = err?.response?.data?.message;
      // The routes that do exist answer a 404 in words ("No active season for
      // this event"). A 404 with nothing to say is the route itself missing.
      const missing = status === 404 && typeof said !== "string";
      const refused = status === 401 || status === 403;
      setPenalties({
        loading: false,
        data: null,
        missing,
        refused,
        error:
          missing || refused
            ? null
            : typeof said === "string"
              ? said
              : "Could not load penalties just now.",
      });
    }
  }, [base]);

  useEffect(() => {
    if (tab === "penalties") loadPenalties();
  }, [tab, loadPenalties]);

  const refundsReq = useAdminData<{ refunds?: Refund[]; total?: number; owed?: number }>(
    tab === "refunds" && base && maySeeRefunds ? `${base}/refunds` : null,
    [tab, eventId]
  );

  const rows = useMemo(() => data?.defaulters ?? [], [data]);
  const open = data?.isInDefaulterWindow ?? false;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (d) => d.breederName.toLowerCase().includes(q) || (d.loft ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  // The portal's two groups: somebody who has promised cash is still a
  // defaulter, but is not somebody to chase.
  const actionable = results.filter((d) => !d.cashPromised);
  const promised = results.filter((d) => d.cashPromised);

  const assessment = penalties.data?.assessment ?? null;
  const existing = penalties.data?.existing ?? [];
  const refunds = refundsReq.data?.refunds ?? [];

  const who = (p: Penalty | Refund) =>
    fullName(p.eventInventory?.breeder, p.eventInventory?.loft || "Unnamed");

  const openDefaulter = (d: Defaulter) => {
    setPrice("");
    setPicked(new Set());
    setActing(d);
  };

  const togglePromise = async () => {
    if (!acting || !base) return;
    const { ok } = await action.run(
      "post",
      `${base}/event-inventory/${acting.eventInventoryId}/cash-promise`,
      {},
      { success: acting.cashPromised ? "Cash promise removed." : "Marked as promising cash." }
    );
    if (ok) {
      setActing(null);
      reload();
    }
  };

  const listingPrice = parseAmount(price);

  /** Stage a move to the store; nothing is sent until it is confirmed. */
  const askToList = (itemIds: number[]) => {
    if (listingPrice == null || listingPrice <= 0) {
      toast.error("Set a listing price first.");
      return;
    }
    if (itemIds.length === 0) {
      toast.error("Select at least one bird.");
      return;
    }
    setListing(itemIds);
  };

  const moveToStore = async () => {
    if (!acting || !base || !listing || listingPrice == null) return;
    if (acting.breederId == null) {
      setListing(null);
      toast.error("This registration has no breeder attached, so it cannot be listed.");
      return;
    }
    const count = listing.length;
    const { ok } = await action.run(
      "post",
      `${base}/store`,
      { breederId: acting.breederId, itemIds: listing, listingPrice },
      { success: `${count} bird${count === 1 ? "" : "s"} moved to the store.` }
    );
    setListing(null);
    if (ok) {
      setActing(null);
      reload();
    }
  };

  const charge = async () => {
    const { ok, data: said } = await action.run<{ message?: string }>(
      "post",
      `${base}/penalties`
    );
    if (ok) {
      toast.success(said?.message ?? "Penalties charged.");
      setCharging(false);
      loadPenalties();
      reload();
    }
  };

  const askWaive = () => {
    if (!waiverReason.trim()) {
      toast.error("A waiver needs a reason on record.");
      return;
    }
    setConfirmingWaive(true);
  };

  const waive = async () => {
    if (!waiving) return;
    const { ok, data: said } = await action.run<{ message?: string }>(
      "post",
      `/admin/penalty/${waiving.id}/waive`,
      { reason: waiverReason.trim() }
    );
    setConfirmingWaive(false);
    if (ok) {
      toast.success(said?.message ?? "Penalty waived.");
      setWaiving(null);
      setWaiverReason("");
      loadPenalties();
    }
  };

  if (forbidden) return <NoAccess what="Defaulters" />;

  const owed = rows.reduce((s, d) => s + d.balanceOwed, 0);
  const birds = rows.reduce((s, d) => s + (d.birds?.length ?? 0), 0);
  const deadline = data?.paymentRaceDate
    ? new Date(data.paymentRaceDate).toLocaleDateString()
    : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "owing", label: "Owing" },
    ...(mayPenalise || mayWaive ? [{ key: "penalties" as const, label: "Penalties" }] : []),
    ...(maySeeRefunds ? [{ key: "refunds" as const, label: "Refunds" }] : []),
  ];

  const chargeable = (assessment?.rows ?? []).filter((r) => !r.cashPromised);
  const chargeTotal = chargeable.reduce((s, r) => s + r.penalty, 0);

  const defaulterRow = (d: Defaulter) => (
    <Row
      key={d.eventInventoryId}
      title={d.breederName || "Unnamed"}
      subtitle={`${d.loft ?? "No loft"} · ${d.birds?.length ?? 0} bird${
        (d.birds?.length ?? 0) === 1 ? "" : "s"
      }`}
      right={money(d.balanceOwed)}
      rightTone="text-rose-600"
      rightSub="owed"
      onPress={() => openDefaulter(d)}
    />
  );

  return (
    <Screen
      title="Defaulters"
      subtitle={
        open
          ? `${rows.length} entr${rows.length === 1 ? "y" : "ies"} past the deadline`
          : "The defaulter window is not open"
      }
      onRefresh={() => {
        refresh();
        if (tab === "penalties") loadPenalties();
        if (tab === "refunds") refundsReq.refresh();
      }}
      refreshing={refreshing}
      header={
        <>
          {tabs.length > 1 ? <Segments<Tab> options={tabs} value={tab} onChange={setTab} /> : null}
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
                  {deadline
                    ? `Nobody counts as a defaulter yet. The window opens seven days before the first race that requires payment, which is set for ${deadline}.`
                    : "No race on this season requires payment, so nobody can be a defaulter."}
                </Empty>
              </View>
            ) : (
              <>
                <FigureRow>
                  <Figure label="Entries" value={rows.length} basis="31%" />
                  <Figure label="Birds affected" value={birds} basis="31%" />
                  <Figure label="Owed" value={money(owed)} tone="text-rose-600" basis="31%" />
                </FigureRow>

                {results.length === 0 ? (
                  <View className="mt-4">
                    <Empty>
                      {rows.length === 0 ? "Everybody has paid." : "No breeder matches that search."}
                    </Empty>
                  </View>
                ) : (
                  <>
                    {actionable.length > 0 ? (
                      <>
                        <Caption>Actionable ({actionable.length})</Caption>
                        <Rows>{actionable.map(defaulterRow)}</Rows>
                      </>
                    ) : null}
                    {promised.length > 0 ? (
                      <>
                        <Caption>Cash promised ({promised.length})</Caption>
                        <Rows>{promised.map(defaulterRow)}</Rows>
                      </>
                    ) : null}
                  </>
                )}
              </>
            )
          ) : null}

          {tab === "penalties" ? (
            penalties.loading && !penalties.data ? (
              <Loading />
            ) : penalties.missing ? (
              <Notice>
                Late-payment penalties cannot be listed or charged from here yet. The portal this
                app is connected to does not have the penalties service installed, so there is
                nothing to show — this is not a fault with your account or with this season.
                Nothing has been charged or changed.
              </Notice>
            ) : penalties.refused ? (
              <Notice>Penalties are not part of your access.</Notice>
            ) : penalties.error ? (
              <Notice>{penalties.error}</Notice>
            ) : (
              <>
                <FigureRow>
                  <Figure
                    label="Would be charged"
                    value={(assessment?.rows ?? []).length}
                    basis="31%"
                  />
                  <Figure label="Days late" value={assessment?.daysLate ?? 0} basis="31%" />
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
                  <Notice>{(assessment?.warnings ?? []).join(" · ")}</Notice>
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
                    <Caption>Would be charged</Caption>
                    <Rows>
                      {(assessment?.rows ?? []).map((r) => (
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

                <Caption>Already charged</Caption>
                {existing.length === 0 ? (
                  <Empty>No penalty has been charged this season.</Empty>
                ) : (
                  <Rows>
                    {existing.map((p) => (
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
                    basis="31%"
                  />
                </FigureRow>

                <Text className="mt-4 text-xs text-slate-400">
                  A refund is issued against a registration. Open a breeder on the Owing tab, or a
                  line in Accounting, to give money back or to mark an owed refund as paid.
                </Text>

                <View className="mt-3">
                  {refunds.length === 0 ? (
                    <Empty>Nothing has been refunded this season.</Empty>
                  ) : (
                    <Rows>
                      {refunds.map((r) => (
                        <Row
                          key={r.id}
                          title={who(r)}
                          subtitle={
                            [r.reason, r.method, new Date(r.issuedAt).toLocaleDateString()]
                              .filter(Boolean)
                              .join(" · ") || undefined
                          }
                          right={money(r.amount)}
                          rightTone={r.status === "OWED" ? "text-rose-600" : "text-blue-600"}
                          badge={
                            r.status === "OWED"
                              ? { label: "still due", bg: "bg-rose-100", text: "text-rose-700" }
                              : null
                          }
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

      {/* One defaulter: the promise, the money, or the store. */}
      <Sheet
        open={acting != null}
        onClose={() => setActing(null)}
        title={acting?.breederName || "Defaulter"}
        subtitle={`${acting?.loft ?? "No loft"} · owes ${money(acting?.balanceOwed)}${
          acting?.cashPromised ? " · cash promised" : ""
        }`}
      >
        {mayMoney || mayPromise ? (
          <View className="mt-3" style={{ gap: 8 }}>
            {mayMoney ? (
              <Button
                label="Payments and refunds"
                icon="cash-outline"
                onPress={() => {
                  setPaying(acting);
                  setActing(null);
                }}
              />
            ) : null}
            {mayPromise ? (
              <Button
                label={acting?.cashPromised ? "Unmark cash promise" : "Mark cash promise"}
                tone="secondary"
                icon="hand-left-outline"
                onPress={togglePromise}
                pending={action.pending && listing == null}
              />
            ) : null}
          </View>
        ) : null}

        <Caption>Birds ({acting?.birds?.length ?? 0})</Caption>
        {(acting?.birds ?? []).length === 0 ? (
          <Empty>No birds are entered on this registration.</Empty>
        ) : (
          <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {(acting?.birds ?? []).map((b, index) => {
              const on = picked.has(b.id);
              return (
                <Pressable
                  key={b.id}
                  disabled={!mayList}
                  onPress={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(b.id)) next.delete(b.id);
                      else next.add(b.id);
                      return next;
                    })
                  }
                  className={`flex-row items-center gap-3 px-4 py-3 ${
                    index > 0 ? "border-t border-slate-100" : ""
                  } ${on ? "bg-cyan-50" : ""}`}
                >
                  {mayList ? (
                    <Ionicons
                      name={on ? "checkbox" : "square-outline"}
                      size={18}
                      color={on ? "#0891b2" : "#94a3b8"}
                    />
                  ) : null}
                  <Text className="text-sm text-slate-900">Bird #{b.birdNo ?? "?"}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {mayList && (acting?.birds ?? []).length > 0 ? (
          <>
            <Field
              label="Listing price"
              value={price}
              onChange={setPrice}
              keyboard="decimal-pad"
              placeholder="0.00"
              hint="One price for the whole listing, whichever birds go into it."
            />
            <ButtonRow>
              <Button
                label="Move all to store"
                tone="secondary"
                onPress={() => askToList((acting?.birds ?? []).map((b) => b.id))}
                full
              />
              <Button
                label={`Move ${picked.size} selected`}
                onPress={() => askToList([...picked])}
                disabled={picked.size === 0}
                full
              />
            </ButtonRow>
          </>
        ) : null}

        <Confirm
          open={listing != null}
          title={`List ${listing?.length ?? 0} bird${(listing?.length ?? 0) === 1 ? "" : "s"} for ${money(
            listingPrice ?? 0
          )}?`}
          body={`${listing?.length ?? 0} of ${acting?.breederName || "this breeder"}'s birds go into the event store as one listing at ${money(
            listingPrice ?? 0
          )}. Whoever buys the listing takes the birds. It can be removed from the store again until it sells.`}
          confirmLabel="Move to store"
          tone="primary"
          pending={action.pending}
          onConfirm={moveToStore}
          onCancel={() => setListing(null)}
        />
      </Sheet>

      <RegistrationMoneySheet
        open={paying != null}
        onClose={() => setPaying(null)}
        eventId={eventId}
        registration={
          paying
            ? {
                eventInventoryId: paying.eventInventoryId,
                breederId: paying.breederId,
                breederName: paying.breederName,
                loft: paying.loft,
                balance: paying.balanceOwed,
                cashPromised: paying.cashPromised,
              }
            : null
        }
        onChanged={() => {
          setPaying(null);
          reload();
        }}
      />

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
          <Button label="Waive it" tone="danger" onPress={askWaive} full />
        </ButtonRow>

        <Confirm
          open={confirmingWaive}
          title={`Waive the ${money(waiving?.amount)} penalty?`}
          body={`${waiving ? who(waiving) : "This breeder"} stops owing ${money(
            waiving?.amount
          )}. The charge stays on record as waived, with your reason, and cannot be reinstated from here.`}
          confirmLabel="Waive it"
          pending={action.pending}
          onConfirm={waive}
          onCancel={() => setConfirmingWaive(false)}
        />
      </Sheet>

      <Confirm
        open={charging}
        title={`Charge ${money(chargeTotal)} in penalties?`}
        body={`${chargeable.length} registration${
          chargeable.length === 1 ? " is" : "s are"
        } past the deadline and grace period, for ${money(chargeTotal)} in total${
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
