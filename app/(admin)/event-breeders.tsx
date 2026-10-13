import React, { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { BREEDER_CSV_COLUMNS, BreederExportSheet } from "@/components/admin/BreederExportSheet";
import { Chips } from "@/components/admin/Chips";
import { CsvImportSheet } from "@/components/admin/CsvImportSheet";
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

type View3 = "APPROVED" | "WAITING" | "REJECTED";
type PayStatus = "PAID" | "OVERPAID" | "PARTIAL" | "PENDING" | "NA";

interface FeeTotals {
  entry: number;
  perBird: number;
  perchHotspot: number;
  race: number;
  owed: number;
  paid: number;
  status: PayStatus;
}

interface Registration {
  id: number;
  breederId: number | null;
  loft: string | null;
  note: string | null;
  reservedBirds: number | null;
  signInDate: string | null;
  waitingDate: string | null;
  rejectedAt: string | null;
  cashPromised: boolean | null;
  breeder: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    city1: string | null;
    state1: string | null;
  } | null;
  items?: { id: number }[];
  feeTotals?: FeeTotals;
}

/** One line of the participants list: a breeder's loft, however many rows back it. */
interface Entry extends Registration {
  birds: number;
}

const PAY_BADGE: Record<PayStatus, { label: string; bg: string; text: string }> = {
  PAID: { label: "paid", bg: "bg-emerald-100", text: "text-emerald-700" },
  OVERPAID: { label: "overpaid", bg: "bg-amber-100", text: "text-amber-700" },
  PARTIAL: { label: "partial", bg: "bg-amber-100", text: "text-amber-700" },
  PENDING: { label: "unpaid", bg: "bg-rose-100", text: "text-rose-700" },
  NA: { label: "n/a", bg: "bg-slate-100", text: "text-slate-500" },
};

const PAY_FILTERS = [
  { key: "all", label: "All" },
  { key: "PAID", label: "Paid" },
  { key: "OVERPAID", label: "Overpaid" },
  { key: "PARTIAL", label: "Partial" },
  { key: "PENDING", label: "Unpaid" },
  { key: "NA", label: "N/A" },
];

/** The server's rule for a status from summed totals, so merged rows classify the same way. */
function statusFromTotals(owed: number, paid: number): PayStatus {
  if (owed === 0) return "NA";
  if (paid > owed) return "OVERPAID";
  if (paid === owed && paid > 0) return "PAID";
  if (paid > 0 && paid < owed) return "PARTIAL";
  return "PENDING";
}

const isDate = (raw: string) => /^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(Date.parse(raw));

const whoOf = (r: Registration) =>
  `${r.breeder?.firstName ?? ""} ${r.breeder?.lastName ?? ""}`.trim() || `Registration ${r.id}`;

const SHOWN = 150;

/**
 * Who is entered in this event, who is asking to be, and who was turned down.
 *
 * Those are three lists, and only the first is the event: approved
 * registrations are the participants, and everything else — counts, fees,
 * races — is built on them. The other two are kept apart so a breeder who has
 * merely applied never looks like one who is in.
 *
 * Participants are shown one line per breeder and loft, merging the rows behind
 * it, because that is how the portal's table reads and it is the unit a person
 * means by "is Smith entered". The line carries the two facts looked up while
 * standing in a loft — birds and money — and the rest is a tap away.
 *
 * Approving is one tap. Rejecting stops to say what it does, because it does a
 * lot: anything the breeder paid becomes a refund owed to them, and every open
 * bet on their birds is voided.
 */
export default function EventBreeders() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();
  const mayManage = can("breeders.manage");

  const [view, setView] = useState<View3>("APPROVED");
  const [query, setQuery] = useState("");
  const [payStatus, setPayStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<number[] | null>(null);

  const base = eventId ? `/admin/event/${eventId}/event-inventory` : null;

  // The payment and date filters belong to the participants list only, as they
  // do in the portal; the waiting and rejected lists are always shown whole.
  const path = useMemo(() => {
    if (!base) return null;
    if (view !== "APPROVED") return `${base}?approval=${view}`;
    const params: string[] = [];
    if (payStatus !== "all") params.push(`paymentStatus=${payStatus}`);
    if (isDate(from)) {
      params.push(`arrivalFrom=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}`);
    }
    if (isDate(to)) {
      params.push(`arrivalTo=${encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString())}`);
    }
    return params.length ? `${base}?${params.join("&")}` : base;
  }, [base, view, payStatus, from, to]);

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    eventInventory?: Registration[];
  }>(path, [path]);
  const waitingReq = useAdminData<{ eventInventory?: Registration[] }>(
    base ? `${base}?approval=WAITING` : null,
    [base]
  );
  const waitingCount = waitingReq.data?.eventInventory?.length ?? 0;

  // Coming back from a registration, or from registering somebody, the list is
  // stale by exactly the thing that was just done.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
      waitingReq.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path])
  );

  const raw = useMemo(() => data?.eventInventory ?? [], [data]);

  const entries: Entry[] = useMemo(() => {
    if (view !== "APPROVED") {
      return raw.map((r) => ({ ...r, birds: r.items?.length ?? 0 }));
    }
    const merged = new Map<string, Entry>();
    for (const r of raw) {
      const key = `${r.breederId}__${r.loft ?? ""}`;
      const have = merged.get(key);
      if (!have) {
        merged.set(key, {
          ...r,
          birds: r.items?.length ?? 0,
          feeTotals: r.feeTotals ? { ...r.feeTotals } : undefined,
        });
        continue;
      }
      have.birds += r.items?.length ?? 0;
      have.reservedBirds = (have.reservedBirds ?? 0) + (r.reservedBirds ?? 0);
      have.cashPromised = have.cashPromised || r.cashPromised;
      const a = have.feeTotals;
      const b = r.feeTotals;
      if (a && b) {
        a.entry += b.entry;
        a.perBird += b.perBird;
        a.perchHotspot += b.perchHotspot;
        a.race += b.race;
        a.owed += b.owed;
        a.paid += b.paid;
        a.status = statusFromTotals(a.owed, a.paid);
      }
    }
    return [...merged.values()];
  }, [raw, view]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (r) =>
        whoOf(r).toLowerCase().includes(q) ||
        (r.loft ?? "").toLowerCase().includes(q) ||
        (r.breeder?.email ?? "").toLowerCase().includes(q) ||
        (r.breeder?.phone ?? "").toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q)
    );
  }, [entries, query]);

  if (forbidden) return <NoAccess what="Breeder registrations" />;

  const totalBirds = entries.reduce((s, r) => s + r.birds, 0);
  const totalPaid = entries.reduce((s, r) => s + (r.feeTotals?.paid ?? 0), 0);
  const totalOwed = entries.reduce((s, r) => s + (r.feeTotals?.owed ?? 0), 0);

  const qs = `eventId=${eventId}&name=${encodeURIComponent(String(name ?? ""))}`;

  const openDetail = (r: Registration) =>
    router.push(`/(admin)/registration-detail?${qs}&inventoryId=${r.id}` as never);

  const decide = async (ids: number[], approve: boolean) => {
    if (ids.length === 0 || !eventId) return;
    const { ok, data: said } = await action.run<{
      message?: string;
      refundsOwed?: number;
      betsVoided?: number;
    }>("post", `/admin/event/${eventId}/event-inventory/approval`, {
      ids,
      action: approve ? "APPROVE" : "REJECT",
    });
    if (!ok) return;
    const extra = [
      said?.refundsOwed ? `${said.refundsOwed} refund${said.refundsOwed === 1 ? "" : "s"} now owed` : null,
      said?.betsVoided ? `${said.betsVoided} bet${said.betsVoided === 1 ? "" : "s"} voided` : null,
    ]
      .filter(Boolean)
      .join(", ");
    toast.success(`${said?.message ?? "Registrations updated."}${extra ? ` ${extra}.` : ""}`);
    setRejecting(null);
    setSelected(new Set());
    reload();
    waitingReq.reload();
  };

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const changeView = (next: View3) => {
    setView(next);
    setSelected(new Set());
  };

  const filterCount = (payStatus !== "all" ? 1 : 0) + (isDate(from) ? 1 : 0) + (isDate(to) ? 1 : 0);
  const allSelected = results.length > 0 && selected.size === results.length;

  return (
    <Screen
      title="Breeders"
      subtitle={
        view === "APPROVED"
          ? name
            ? `${name} · ${entries.length} entered`
            : `${entries.length} entered`
          : view === "WAITING"
            ? `${entries.length} waiting for a decision`
            : `${entries.length} rejected`
      }
      onRefresh={() => {
        refresh();
        waitingReq.reload();
      }}
      refreshing={refreshing}
      header={
        <>
          <Chips<View3>
            options={[
              { key: "APPROVED", label: "Approved" },
              { key: "WAITING", label: `Waiting (${waitingCount})` },
              { key: "REJECTED", label: "Rejected" },
            ]}
            value={view}
            onChange={changeView}
          />
          <View className="mt-3">
            <SearchBar value={query} onChange={setQuery} placeholder="Breeder, loft, email, phone or note" />
          </View>
          <ButtonRow>
            {view === "APPROVED" ? (
              <Button
                label={filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
                tone="secondary"
                icon="funnel-outline"
                onPress={() => setFiltersOpen(true)}
                full
              />
            ) : null}
            {mayManage ? (
              <Button
                label="Register breeder"
                icon="person-add-outline"
                onPress={() => router.push(`/(admin)/event-register?${qs}` as never)}
                full
              />
            ) : null}
          </ButtonRow>
          {mayManage ? (
            <ButtonRow>
              <Button
                label="Import"
                tone="secondary"
                icon="cloud-upload-outline"
                onPress={() => setImporting(true)}
                full
              />
              <Button
                label="Export"
                tone="secondary"
                icon="download-outline"
                onPress={() => setExporting(true)}
                full
              />
            </ButtonRow>
          ) : null}
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          {view === "APPROVED" ? (
            <FigureRow>
              <Figure label="Entered" value={entries.length} />
              <Figure label="Birds" value={totalBirds} />
              <Figure label="Collected" value={money(totalPaid)} tone="text-emerald-600" />
              <Figure
                label="Still owed"
                value={money(Math.max(totalOwed - totalPaid, 0))}
                tone={totalOwed - totalPaid > 0 ? "text-rose-600" : "text-slate-900"}
              />
            </FigureRow>
          ) : mayManage && results.length > 0 ? (
            <>
              <ButtonRow>
                <Button
                  label={allSelected ? "Clear" : "Select all"}
                  tone="secondary"
                  onPress={() =>
                    setSelected(allSelected ? new Set() : new Set(results.map((r) => r.id)))
                  }
                  full
                />
                <Button
                  label={`Approve (${selected.size})`}
                  tone="success"
                  disabled={selected.size === 0}
                  pending={action.pending && rejecting == null}
                  onPress={() => decide([...selected], true)}
                  full
                />
                {view === "WAITING" ? (
                  <Button
                    label={`Reject (${selected.size})`}
                    tone="danger"
                    disabled={selected.size === 0 || action.pending}
                    onPress={() => setRejecting([...selected])}
                    full
                  />
                ) : null}
              </ButtonRow>
              <Text className="mt-2 text-xs text-slate-400">
                Tap the box to pick a registration, the name to open it.
              </Text>
            </>
          ) : null}

          <View className="mt-4">
            {results.length === 0 ? (
              <Empty>
                {entries.length > 0
                  ? "No breeder matches that search."
                  : view === "WAITING"
                    ? "No registrations are waiting for approval."
                    : view === "REJECTED"
                      ? "No rejected registrations."
                      : filterCount > 0
                        ? "No participant matches those filters."
                        : "No breeders registered yet."}
              </Empty>
            ) : view === "APPROVED" ? (
              <Rows>
                {results.slice(0, SHOWN).map((r) => {
                  const status = r.feeTotals?.status ?? "NA";
                  const owes = status === "PENDING" || status === "PARTIAL";
                  return (
                    <Row
                      key={r.id}
                      title={whoOf(r)}
                      subtitle={
                        [
                          r.loft ?? "No loft",
                          `${r.birds} bird${r.birds === 1 ? "" : "s"}`,
                          // A promise is not money received, so it sits beside
                          // the status rather than replacing it.
                          r.cashPromised && owes ? "cash promised" : null,
                          r.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                      badge={PAY_BADGE[status] ?? PAY_BADGE.NA}
                      right={money(r.feeTotals?.paid ?? 0)}
                      rightSub={`of ${money(r.feeTotals?.owed ?? 0)}`}
                      rightTone={owes ? "text-rose-600" : "text-slate-700"}
                      onPress={() => openDetail(r)}
                    />
                  );
                })}
              </Rows>
            ) : (
              <View style={{ gap: 10 }}>
                {results.slice(0, SHOWN).map((r) => {
                  const on = selected.has(r.id);
                  const when = view === "WAITING" ? r.waitingDate : r.rejectedAt;
                  return (
                    <View
                      key={r.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      <Row
                        title={whoOf(r)}
                        subtitle={
                          [
                            r.loft ?? "No loft",
                            `${r.birds} bird${r.birds === 1 ? "" : "s"}`,
                            when
                              ? `${view === "WAITING" ? "since" : "rejected"} ${new Date(when).toLocaleString()}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        }
                        right={money(r.feeTotals?.paid ?? 0)}
                        rightSub="paid"
                        leading={
                          mayManage ? (
                            <Ionicons
                              name={on ? "checkbox" : "square-outline"}
                              size={22}
                              color={on ? "#0891b2" : "#cbd5e1"}
                              onPress={() => toggle(r.id)}
                              suppressHighlighting
                            />
                          ) : undefined
                        }
                        onPress={() => openDetail(r)}
                      />
                      {mayManage ? (
                        <View className="px-4 pb-3">
                          <ButtonRow>
                            <Button
                              label="Approve"
                              tone="success"
                              disabled={action.pending}
                              onPress={() => decide([r.id], true)}
                              full
                            />
                            {view === "WAITING" ? (
                              <Button
                                label="Reject"
                                tone="secondary"
                                disabled={action.pending}
                                onPress={() => setRejecting([r.id])}
                                full
                              />
                            ) : null}
                          </ButtonRow>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
            <Truncated
              shown={Math.min(results.length, SHOWN)}
              total={results.length}
              where="a narrower search"
            />
          </View>
        </>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter participants"
        subtitle="Applies to approved registrations"
      >
        <Chips label="Payment status" options={PAY_FILTERS} value={payStatus} onChange={setPayStatus} />
        <Field
          label="Arrivals clocked from"
          value={from}
          onChange={setFrom}
          placeholder="2026-04-01"
          hint={
            from && !isDate(from)
              ? "Write it as year-month-day."
              : "Keeps breeders with a bird clocked in on or after this day."
          }
        />
        <Field
          label="Arrivals clocked to"
          value={to}
          onChange={setTo}
          placeholder="2026-04-30"
          hint={to && !isDate(to) ? "Write it as year-month-day." : null}
        />
        <ButtonRow>
          <Button
            label="Clear"
            tone="secondary"
            onPress={() => {
              setPayStatus("all");
              setFrom("");
              setTo("");
            }}
            full
          />
          <Button label="Done" onPress={() => setFiltersOpen(false)} full />
        </ButtonRow>
      </Sheet>

      <CsvImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        onImported={reload}
        title="Import breeders"
        previewPath="/admin/breeders/import/preview"
        commitPath="/admin/breeders/import/commit"
        columns={BREEDER_CSV_COLUMNS}
        describe={(row) => ({
          title:
            `${(row.firstName as string) ?? ""} ${(row.lastName as string) ?? ""}`.trim() ||
            "Unnamed",
          subtitle:
            [row.email as string, row.phone as string].filter(Boolean).join(" · ") || undefined,
        })}
      />

      <BreederExportSheet open={exporting} onClose={() => setExporting(false)} />

      <Confirm
        open={rejecting != null}
        title={
          rejecting && rejecting.length > 1
            ? `Reject ${rejecting.length} registrations?`
            : "Reject this registration?"
        }
        body="Their birds are out of the event. Anything they have paid becomes a refund owed to them, and every open bet on their birds is voided — other bettors who paid a stake are owed it back. Approving again later withdraws the refund."
        confirmLabel="Reject"
        pending={action.pending}
        onConfirm={() => rejecting && decide(rejecting, false)}
        onCancel={() => setRejecting(null)}
      />
    </Screen>
  );
}
