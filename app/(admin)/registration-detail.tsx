import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { downloadAndShare } from "@/service/download.service";
import { RegistrationMoneySheet } from "@/components/admin/RegistrationMoneySheet";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  SectionTitle,
  Sheet,
  money,
  tabular,
} from "@/components/admin/ui";

type Approval = "WAITING" | "APPROVED" | "REJECTED";

interface BreederLite {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  state1?: string | null;
  city1?: string | null;
}

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  isActive?: number | null;
  isLost?: number | null;
}

interface Item {
  id: number;
  birdId: number | null;
  birdNo: number | null;
  bird: Bird | null;
  entryFeeValue: number | null;
  perchFeeValue: number | null;
  raceFeeValue: number | null;
  hotSpotFeeValue: number | null;
  entryRefund: number | null;
  hotSpotRefund: number | null;
  transferDue: number | null;
  arrivalDate: string | null;
  departureDate: string | null;
  isBackup: number | null;
}

interface Payment {
  id: number;
  paymentValue: number | null;
  paymentType: number | null;
  paymentMethod: number | null;
  paymentDesc: string | null;
  paymentDate: string | null;
  status: string | null;
}

interface Inventory {
  id: number;
  breederId: number | null;
  loft: string | null;
  note: string | null;
  signInDate: string | null;
  cashPromised: boolean | null;
  approvalStatus: Approval | null;
  breeder: BreederLite | null;
  payments?: Payment[];
  refunds?: { id: number; amount: number }[];
  partners?: { breederId: number; breeder: BreederLite | null }[];
  items?: Item[];
}

interface Bet {
  id: number;
  raceName: string | null;
  raceNumber: number | null;
  category: string;
  tierIndex: number;
  band: string | null;
  amount: number;
  stakePaid: boolean;
  status: string;
  payoutValue: number | null;
}

const APPROVAL: Record<Approval, { label: string; box: string; text: string }> = {
  WAITING: { label: "Waiting for approval", box: "bg-amber-100", text: "text-amber-800" },
  APPROVED: { label: "Approved", box: "bg-emerald-100", text: "text-emerald-800" },
  REJECTED: { label: "Rejected", box: "bg-rose-100", text: "text-rose-800" },
};

const METHOD: Record<number, string> = { 0: "Cash", 1: "Credit card", 2: "PayPal", 3: "Bank transfer" };
const TYPE: Record<number, string> = {
  0: "Perch fee",
  1: "Per bird fee",
  2: "Races fee",
  3: "Refund",
  4: "Other",
};
const SEX: Record<number, string> = { 0: "Unknown", 1: "Cock", 2: "Hen" };
const CATEGORY: Record<string, string> = {
  BELGIAN: "Belgian",
  STANDARD: "Standard",
  WTA: "Winner takes all",
};

const fullName = (b: BreederLite | null | undefined) =>
  `${b?.firstName ?? ""} ${b?.lastName ?? ""}`.trim();

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : "—");

function Line({
  label,
  value,
  strong = false,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <View className="flex-row items-baseline justify-between px-4 py-1.5">
      <Text className={strong ? "text-sm font-semibold text-slate-900" : "text-sm text-slate-500"}>
        {label}
      </Text>
      <Text
        selectable
        className={`text-sm ${strong ? "font-semibold" : ""} ${tone}`}
        style={tabular}
      >
        {value}
      </Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-xl border border-slate-200 bg-white py-2">
      {children}
    </View>
  );
}

/**
 * One breeder's registration in one event — the portal's "Breeder Details".
 *
 * Everything about a single entry lives here because every question about one
 * is really a question about all of it: whether they are in, what they owe,
 * which birds that covers, who else has a share. Splitting it across screens
 * would mean answering "why is Smith's balance $40" by visiting three of them.
 *
 * The order is the order of the questions. Are they in — the approval state,
 * with the decision beside it. What do they owe — the fee summary, worked the
 * same way the portal works it. Then the people, the birds and the bets, which
 * are looked up rather than acted on.
 *
 * Money is changed in its own sheet, shared with the accounting screens, so a
 * payment is recorded the same way wherever it is recorded from. A cash promise
 * is kept apart from payments on purpose: it is a note that somebody said they
 * would pay, and it never counts as money received.
 */
export default function RegistrationDetail() {
  const { eventId, inventoryId, name } = useLocalSearchParams<{
    eventId?: string;
    inventoryId?: string;
    name?: string;
  }>();
  const { can, canAny, role } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const mayManage = can("breeders.manage");
  // The partner routes ask for an admin role on top of the permission.
  const mayPartner = mayManage && (role === "ADMIN" || role === "SUPERADMIN");
  const mayReceipt = can("accounting.view") && (role === "ADMIN" || role === "SUPERADMIN");
  const mayMoney = canAny("payments.manage", "refunds.manage");

  const path = inventoryId ? `/admin/event-inventory/${inventoryId}` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    eventInventory?: Inventory;
  }>(path, [inventoryId]);
  const inv = data?.eventInventory ?? null;

  const betsReq = useAdminData<{ bets?: Bet[] }>(path ? `${path}/bets` : null, [inventoryId]);
  const bets = betsReq.data?.bets ?? [];

  const birdsReq = useAdminData<{ birds?: Bird[] }>(
    inv?.breederId != null ? `/admin/breeders/${inv.breederId}/birds` : null,
    [inv?.breederId]
  );

  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);

  // The saved note is what the field starts from, and resyncs to after a save.
  useEffect(() => {
    setNote(inv?.note ?? "");
  }, [inv?.id, inv?.note]);

  // A thousand breeders is too many to load for a list nobody has asked for yet.
  const directory = useAdminData<{ breeders?: BreederLite[] }>(
    partnerOpen ? "/admin/breeders" : null,
    [partnerOpen]
  );

  const items = useMemo(() => inv?.items ?? [], [inv]);
  const payments = inv?.payments ?? [];
  const partners = inv?.partners ?? [];
  const owedRefunds = inv?.refunds ?? [];

  const candidates = useMemo(() => {
    const q = partnerQuery.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set<number>([...(inv?.partners ?? []).map((p) => p.breederId)]);
    if (inv?.breederId != null) taken.add(inv.breederId);
    return (directory.data?.breeders ?? [])
      .filter((b) => !taken.has(b.id))
      .filter(
        (b) => fullName(b).toLowerCase().includes(q) || (b.email ?? "").toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [directory.data, partnerQuery, inv]);

  // Registered birds first, then the rest of what this breeder owns, as the
  // portal lists them: it answers "which of his birds are not in this event".
  const birds = useMemo(() => {
    const byBird = new Map<number, Item>();
    for (const item of items) {
      const id = item.birdId ?? item.bird?.id;
      if (id != null) byBird.set(id, item);
    }
    const owned = birdsReq.data?.birds ?? [];
    const rows: { bird: Bird | null; item: Item | null; key: string }[] = owned.map((b) => ({
      bird: b,
      item: byBird.get(b.id) ?? null,
      key: `b-${b.id}`,
    }));
    const ownedIds = new Set(owned.map((b) => b.id));
    for (const item of items) {
      const id = item.birdId ?? item.bird?.id;
      if (id == null || !ownedIds.has(id)) rows.push({ bird: item.bird, item, key: `i-${item.id}` });
    }
    return rows.sort((a, b) => {
      if (!!a.item !== !!b.item) return a.item ? -1 : 1;
      return (a.bird?.band ?? "").localeCompare(b.bird?.band ?? "");
    });
  }, [items, birdsReq.data]);

  if (forbidden) return <NoAccess what="This registration" />;

  // The portal's arithmetic, line for line, so the two never disagree.
  const sum = (pick: (i: Item) => number | null) => items.reduce((s, i) => s + (pick(i) ?? 0), 0);
  const perch = sum((i) => i.entryFeeValue);
  const perBird = sum((i) => i.perchFeeValue);
  const hotspot = sum((i) => i.hotSpotFeeValue);
  const race = sum((i) => i.raceFeeValue);
  const classes = payments
    .filter((p) => p.paymentDesc?.toLowerCase().includes("bet stake"))
    .reduce((s, p) => s + (p.paymentValue ?? 0), 0);
  const fees = perch + perBird + hotspot + race + classes;
  const entryRefund = sum((i) => i.entryRefund);
  const hotspotRefund = sum((i) => i.hotSpotRefund);
  const refunds = entryRefund + hotspotRefund;
  // Only PAID rows are money that has moved; a PENDING row is an unpaid order.
  const paidOut = payments
    .filter((p) => p.paymentType === 3 && p.status === "PAID")
    .reduce((s, p) => s + Math.abs(p.paymentValue ?? 0), 0);
  const paid = payments
    .filter((p) => p.paymentType !== 3 && p.status === "PAID")
    .reduce((s, p) => s + (p.paymentValue ?? 0), 0);
  const transferDue = sum((i) => i.transferDue);
  const balance = fees - refunds - paid + paidOut;

  const status: Approval = inv?.approvalStatus ?? "APPROVED";
  const who = fullName(inv?.breeder) || "Registration";

  const decide = async (approve: boolean) => {
    if (!inv || !eventId) return;
    const { ok, data: said } = await action.run<{
      message?: string;
      refundsOwed?: number;
      betsVoided?: number;
    }>("post", `/admin/event/${eventId}/event-inventory/approval`, {
      ids: [inv.id],
      action: approve ? "APPROVE" : "REJECT",
    });
    if (!ok) return;
    const extra = [
      said?.refundsOwed ? "a refund is now owed" : null,
      said?.betsVoided ? `${said.betsVoided} bet${said.betsVoided === 1 ? "" : "s"} voided` : null,
    ]
      .filter(Boolean)
      .join(", ");
    toast.success(`${said?.message ?? "Registration updated."}${extra ? ` ${extra}.` : ""}`);
    setRejecting(false);
    reload();
  };

  const saveNote = async () => {
    const { ok } = await action.run("patch", path!, { note }, { success: "Note saved." });
    if (ok) reload();
  };

  const togglePromise = async () => {
    if (!inv || !eventId) return;
    const { ok, data: said } = await action.run<{ cashPromised?: boolean }>(
      "post",
      `/admin/event/${eventId}/event-inventory/${inv.id}/cash-promise`
    );
    if (ok) {
      toast.success(said?.cashPromised ? "Marked as cash promised." : "Cash promise cleared.");
      reload();
    }
  };

  const receipt = async () => {
    if (!inv || !eventId) return;
    setFetching(true);
    const res = await downloadAndShare(
      `/admin/event/${eventId}/event-inventory/${inv.id}/receipt`,
      `receipt-${inv.breeder?.lastName ?? inv.id}.pdf`
    );
    setFetching(false);
    if (!res.ok && res.problem) toast.error(res.problem);
  };

  const addPartner = async (breederId: number) => {
    const { ok } = await action.run(
      "post",
      `${path}/partners`,
      { breederId },
      { success: "Partner added." }
    );
    if (ok) {
      setPartnerOpen(false);
      setPartnerQuery("");
      reload();
    }
  };

  const removePartner = async () => {
    if (removing == null) return;
    const { ok } = await action.run(
      "delete",
      `${path}/partners`,
      { breederId: removing },
      { success: "Partner removed." }
    );
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  const phone = inv?.breeder?.phone;
  const email = inv?.breeder?.email;
  const badge = APPROVAL[status] ?? APPROVAL.APPROVED;

  return (
    <Screen
      title={who}
      subtitle={[inv?.loft, name].filter(Boolean).join(" · ") || null}
      onRefresh={() => {
        refresh();
        betsReq.reload();
      }}
      refreshing={refreshing}
    >
      {loading ? (
        <Loading />
      ) : !inv ? (
        <Notice tone="rose">{error ?? "This registration could not be found."}</Notice>
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          {/* Are they in. */}
          <View className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <View className="flex-row flex-wrap items-center gap-2">
              <View className={`rounded-full px-2.5 py-1 ${badge.box}`}>
                <Text className={`text-xs font-medium ${badge.text}`}>{badge.label}</Text>
              </View>
              {inv.cashPromised ? (
                <View className="rounded-full border border-slate-300 px-2.5 py-1">
                  <Text className="text-xs font-medium text-slate-600">Cash promised</Text>
                </View>
              ) : null}
            </View>

            {mayManage ? (
              <>
                <ButtonRow>
                  {status !== "APPROVED" ? (
                    <Button
                      label="Approve"
                      tone="success"
                      icon="checkmark"
                      pending={action.pending && !rejecting}
                      onPress={() => decide(true)}
                      full
                    />
                  ) : null}
                  {status !== "REJECTED" ? (
                    <Button
                      label="Reject"
                      tone="secondary"
                      disabled={action.pending}
                      onPress={() => setRejecting(true)}
                      full
                    />
                  ) : null}
                </ButtonRow>

                <Field
                  label="Note"
                  value={note}
                  onChange={setNote}
                  placeholder="Registration note…"
                  multiline
                />
                <ButtonRow>
                  <Button
                    label="Save note"
                    tone="secondary"
                    onPress={saveNote}
                    disabled={note === (inv.note ?? "") || action.pending}
                    full
                  />
                  <Button
                    label={inv.cashPromised ? "Clear cash promise" : "Cash promised"}
                    tone="secondary"
                    icon="cash-outline"
                    onPress={togglePromise}
                    disabled={action.pending}
                    full
                  />
                </ButtonRow>
              </>
            ) : inv.note ? (
              <Text className="mt-3 text-sm text-slate-700">{inv.note}</Text>
            ) : null}
          </View>

          {/* Who. */}
          <SectionTitle>Breeder</SectionTitle>
          <Card>
            <Line label="Name" value={who} />
            <Line label="Loft" value={inv.loft ?? "—"} />
            <Line label="Sign-in date" value={day(inv.signInDate)} />
            <Line label="Registered birds" value={String(items.length)} />
            <Line label="Email" value={email ?? "—"} />
            <Line label="Phone" value={phone ?? "—"} />
            <Line label="Country" value={inv.breeder?.country ?? "—"} />
            <Line label="State" value={inv.breeder?.state1 ?? "—"} />
          </Card>
          {phone || email ? (
            <ButtonRow>
              {phone ? (
                <Button
                  label="Call"
                  tone="secondary"
                  icon="call-outline"
                  onPress={() => Linking.openURL(`tel:${phone}`)}
                  full
                />
              ) : null}
              {email ? (
                <Button
                  label="Email"
                  tone="secondary"
                  icon="mail-outline"
                  onPress={() => Linking.openURL(`mailto:${email}`)}
                  full
                />
              ) : null}
            </ButtonRow>
          ) : null}

          <SectionTitle
            action={
              mayPartner ? (
                <Pressable onPress={() => setPartnerOpen(true)} hitSlop={8}>
                  <Text className="text-sm font-medium text-cyan-700">Add partner</Text>
                </Pressable>
              ) : null
            }
          >
            Partners
          </SectionTitle>
          {partners.length === 0 ? (
            <Empty>No partners.</Empty>
          ) : (
            <Card>
              {partners.map((p) => (
                <View key={p.breederId} className="flex-row items-center gap-3 px-4 py-2">
                  <Text className="flex-1 text-sm text-slate-900">
                    {fullName(p.breeder) || `Breeder ${p.breederId}`}
                  </Text>
                  {mayPartner ? (
                    <Pressable onPress={() => setRemoving(p.breederId)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color="#e11d48" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </Card>
          )}

          {/* What do they owe. */}
          <SectionTitle>Fee summary</SectionTitle>
          <Card>
            <Line label="Perch fee" value={money(perch)} />
            <Line label="Per bird fee" value={money(perBird)} />
            <Line label="Race fee" value={money(race)} />
            <Line label="Perch fee (hot spot)" value={money(hotspot)} />
            <Line label="Classes" value={money(classes)} />
            <Line label="Total fees" value={money(fees)} strong />
            <View className="my-1.5 border-t border-slate-100" />
            <Line label="Entry refund" value={money(entryRefund)} />
            <Line label="Hot spot refund" value={money(hotspotRefund)} />
            <Line label="Total refunds" value={money(refunds)} strong />
            <View className="my-1.5 border-t border-slate-100" />
            <Line label="Payments" value={money(paid)} />
            <Line label="Refunds paid out" value={money(paidOut)} />
            <Line label="Transfer due" value={money(transferDue)} />
            {owedRefunds.map((r) => (
              <Line
                key={r.id}
                label="Due to breeder"
                value={money(r.amount)}
                tone="text-rose-600"
              />
            ))}
            <View className="my-1.5 border-t border-slate-100" />
            <Line
              label="Balance"
              value={money(balance)}
              strong
              tone={
                balance === 0
                  ? "text-emerald-600"
                  : balance > 0
                    ? "text-rose-600"
                    : "text-amber-600"
              }
            />
          </Card>

          <ButtonRow>
            {mayMoney ? (
              <Button
                label="Payments & refunds"
                icon="card-outline"
                onPress={() => setMoneyOpen(true)}
                full
              />
            ) : null}
            {mayReceipt ? (
              <Button
                label="Receipt"
                tone="secondary"
                icon="download-outline"
                pending={fetching}
                onPress={receipt}
                full
              />
            ) : null}
          </ButtonRow>

          <SectionTitle>Payments ({payments.length})</SectionTitle>
          {payments.length === 0 ? (
            <Empty>No payments found.</Empty>
          ) : (
            <Rows>
              {payments.map((p) => (
                <Row
                  key={p.id}
                  title={
                    [
                      p.paymentType != null ? (TYPE[p.paymentType] ?? String(p.paymentType)) : null,
                      p.paymentMethod != null
                        ? (METHOD[p.paymentMethod] ?? String(p.paymentMethod))
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Payment"
                  }
                  subtitle={[day(p.paymentDate), p.paymentDesc].filter(Boolean).join(" · ")}
                  right={money(p.paymentValue ?? 0)}
                  rightSub={p.status && p.status !== "PAID" ? p.status.toLowerCase() : undefined}
                  rightTone={p.status === "PAID" ? "text-slate-900" : "text-slate-400"}
                />
              ))}
            </Rows>
          )}

          {/* Which birds. */}
          <SectionTitle>
            Birds ({birds.length}) · {items.length} registered
          </SectionTitle>
          {birds.length === 0 ? (
            <Empty>No birds found.</Empty>
          ) : (
            <View style={{ gap: 8 }}>
              {birds.slice(0, 120).map(({ bird, item, key }) => (
                <View
                  key={key}
                  className={`rounded-xl border border-slate-200 bg-white p-3 ${
                    item ? "" : "opacity-60"
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 text-sm font-medium text-slate-900" numberOfLines={1}>
                      {item?.birdNo != null ? `#${item.birdNo} · ` : ""}
                      {bird?.band ?? "No band"}
                      {bird?.birdName ? ` · ${bird.birdName}` : ""}
                    </Text>
                    <View
                      className={`rounded-full px-2 py-0.5 ${
                        item ? "bg-emerald-100" : "bg-slate-100"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-medium ${
                          item ? "text-emerald-700" : "text-slate-500"
                        }`}
                      >
                        {item ? "registered" : "not registered"}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {[
                      bird?.color,
                      SEX[bird?.sex ?? 0] ?? "Unknown",
                      bird?.isActive ? "active" : "inactive",
                      bird?.isLost ? "lost" : null,
                      item?.isBackup ? "backup" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {item ? (
                    <>
                      <Text className="mt-1 text-xs text-slate-500" style={tabular}>
                        Perch {money(item.entryFeeValue ?? 0)} · Bird {money(item.perchFeeValue ?? 0)}{" "}
                        · Race {money(item.raceFeeValue ?? 0)} · Hot spot{" "}
                        {money(item.hotSpotFeeValue ?? 0)}
                      </Text>
                      {item.arrivalDate || item.departureDate ? (
                        <Text className="mt-0.5 text-xs text-slate-400">
                          Arrived {day(item.arrivalDate)} · Departed {day(item.departureDate)}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ))}
              {birds.length > 120 ? (
                <Text className="text-center text-xs text-slate-400">
                  Showing the first 120 of {birds.length}.
                </Text>
              ) : null}
            </View>
          )}

          <SectionTitle>Bets ({bets.length})</SectionTitle>
          {betsReq.loading ? (
            <Loading />
          ) : bets.length === 0 ? (
            <Empty>No bets placed this season.</Empty>
          ) : (
            <Rows>
              {bets.map((b) => (
                <Row
                  key={b.id}
                  title={`${b.raceNumber != null ? `#${b.raceNumber} ` : ""}${b.raceName ?? "Race"}`}
                  subtitle={[
                    `${CATEGORY[b.category] ?? b.category} · tier ${b.tierIndex}`,
                    b.band,
                    b.status.toLowerCase(),
                    b.payoutValue != null ? `payout ${money(b.payoutValue)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  right={money(b.amount)}
                  rightSub={b.stakePaid ? "stake paid" : "stake unpaid"}
                  rightTone={b.stakePaid ? "text-emerald-600" : "text-rose-600"}
                />
              ))}
            </Rows>
          )}
        </>
      )}

      <RegistrationMoneySheet
        open={moneyOpen}
        onClose={() => setMoneyOpen(false)}
        eventId={eventId}
        registration={
          inv
            ? {
                eventInventoryId: inv.id,
                breederId: inv.breederId,
                breederName: who,
                loft: inv.loft,
                balance,
                cashPromised: inv.cashPromised,
              }
            : null
        }
        onChanged={reload}
      />

      <Sheet
        open={partnerOpen}
        onClose={() => setPartnerOpen(false)}
        title="Add a partner"
        subtitle="Another breeder with a share in this entry"
      >
        <View className="mt-3">
          <SearchBar value={partnerQuery} onChange={setPartnerQuery} placeholder="Name or email" />
        </View>
        {directory.loading ? (
          <Loading />
        ) : directory.error ? (
          <Notice>{directory.error}</Notice>
        ) : !partnerQuery.trim() ? (
          <Text className="py-6 text-center text-sm text-slate-500">
            Search the breeder directory.
          </Text>
        ) : candidates.length === 0 ? (
          <Text className="py-6 text-center text-sm text-slate-500">
            Nobody matches who is not already on this entry.
          </Text>
        ) : (
          <View className="mt-2">
            <Rows>
              {candidates.map((b) => (
                <Row
                  key={b.id}
                  title={fullName(b) || `Breeder ${b.id}`}
                  subtitle={[b.email, [b.city1, b.state1].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => addPartner(b.id)}
                />
              ))}
            </Rows>
          </View>
        )}
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setPartnerOpen(false)} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title="Remove this partner?"
        body="They come off this registration. Their own breeder record is untouched."
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={removePartner}
        onCancel={() => setRemoving(null)}
      />

      <Confirm
        open={rejecting}
        title={`Reject ${who}'s registration?`}
        body="Their birds are out of the event. Anything they have paid becomes a refund owed to them, and every open bet on their birds is voided — other bettors who paid a stake are owed it back. Approving again later withdraws the refund."
        confirmLabel="Reject"
        pending={action.pending}
        onConfirm={() => decide(false)}
        onCancel={() => setRejecting(false)}
      />
    </Screen>
  );
}
