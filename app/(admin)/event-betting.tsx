import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { CashBetSheet, poolName } from "@/components/admin/CashBetSheet";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  money,
} from "@/components/admin/ui";
import { Segments } from "@/components/admin/MoneyBits";

interface Race {
  id: number;
  name: string | null;
  description?: string | null;
  raceNumber: number | null;
  status: string;
  bettingOpen: boolean;
}

interface Entry {
  betId: number;
  bettorId: string;
  bettorName: string | null;
  bettorEmail: string | null;
  band: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  position: number | null;
  amountIn: number;
  /** PLACED, WON, LOST, REFUNDED or PAID. */
  status: string;
  payoutValue: number | null;
  stakePaid: boolean;
}

interface Pool {
  category: string;
  tierIndex: number;
  totalIn: number;
  totalPayout: number;
  entries: Entry[];
}

interface PoolData {
  bettingOpen: boolean;
  raceStatus: string;
  pools: Pool[];
  totals: { totalBets: number; totalIn: number; totalPayout: number };
}

type View_ = "pools" | "bets" | "owed";

const BET_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  WON: { label: "won", bg: "bg-emerald-100", text: "text-emerald-700" },
  PAID: { label: "paid", bg: "bg-emerald-200", text: "text-emerald-800" },
  REFUNDED: { label: "refunded", bg: "bg-slate-200", text: "text-slate-600" },
  LOST: { label: "lost", bg: "bg-slate-100", text: "text-slate-500" },
  PLACED: { label: "placed", bg: "bg-blue-100", text: "text-blue-700" },
};

/**
 * Betting pools, per race.
 *
 * Money in against money out, per pool, because that difference is the only
 * question worth asking of a pool before it settles. Unpaid stakes are called
 * out on the row: a bet whose stake never cleared is the one that causes an
 * argument at payout time, and it looks identical to a good bet otherwise.
 *
 * The same bets are shown three ways, as the portal shows them: pool by pool,
 * as one list of who backed which bird, and — once a race is settled — as what
 * each person is owed in total, which is the list somebody pays out from.
 *
 * Opening a pool is reversible and lives here. Settling it is not: calculating
 * payouts writes what everyone is owed, so it asks first and says what it is
 * about to do. That confirmation is the only thing standing between a mistap
 * and a payout run, which is why it names the race and the money in it rather
 * than asking "are you sure".
 *
 * Cash bets are taken here too, for as long as the race is still registering —
 * that is the server's rule, and it is independent of whether the open pool has
 * been opened to everybody. They need a bird, a pool and a payer chosen
 * together, so they get their own stepped sheet rather than a button.
 */
export default function EventBetting() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();

  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();
  const [raceId, setRaceId] = useState<number | null>(null);
  const [view, setView] = useState<View_>("pools");
  const [settling, setSettling] = useState(false);
  const [betting, setBetting] = useState(false);
  const [pool, setPool] = useState<PoolData | null>(null);
  const [loadingPool, setLoadingPool] = useState(false);
  const [poolRefused, setPoolRefused] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);

  const mayView = canAny("betting.view", "betting.manage");
  const mayManage = can("betting.manage");
  const maySettle = can("betting.payouts");

  const racesReq = useAdminData<{ races?: Race[] }>(
    eventId ? `/admin/race?eventId=${eventId}` : null,
    [eventId]
  );

  const races = useMemo(() => {
    const all = racesReq.data?.races ?? [];
    // Pools that are open come first; they are the ones still changing.
    return [...all].sort(
      (a, b) =>
        Number(b.bettingOpen) - Number(a.bettingOpen) || (b.raceNumber ?? 0) - (a.raceNumber ?? 0)
    );
  }, [racesReq.data]);

  useEffect(() => {
    if (raceId == null && races.length > 0) setRaceId(races[0].id);
  }, [races, raceId]);

  const loadPool = useCallback(
    async (quiet = false) => {
      if (raceId == null) return;
      if (!quiet) setLoadingPool(true);
      setPoolError(null);
      setPoolRefused(false);
      try {
        const { data } = await api.get(`/admin/race/${raceId}/betting/pool`);
        setPool(data ?? null);
      } catch (err: any) {
        const status = err?.response?.status;
        setPool(null);
        if (status === 401 || status === 403) setPoolRefused(true);
        else setPoolError(err?.response?.data?.message ?? "Could not load this pool.");
      } finally {
        setLoadingPool(false);
      }
    },
    [raceId]
  );

  useEffect(() => {
    setPool(null);
    loadPool();
  }, [loadPool]);

  const race = races.find((r) => r.id === raceId) ?? null;
  const raceLabel = race?.name || race?.description || `race ${race?.raceNumber ?? race?.id ?? ""}`;
  // The pool is fetched fresher than the race list, so its word on status wins.
  const raceStatus = pool?.raceStatus ?? race?.status ?? "";
  const registering = raceStatus === "REGISTERING";
  const ended = raceStatus === "ENDED";
  const isOpen = pool?.bettingOpen ?? race?.bettingOpen ?? false;

  const toggle = async () => {
    if (race == null) return;
    const { ok, data } = await action.run<{ bettingOpen?: boolean }>(
      "post",
      `/admin/race/${race.id}/betting/toggle`
    );
    if (ok) {
      toast.success(data?.bettingOpen ? "Pool opened — the season has been told." : "Pool closed.");
      racesReq.reload();
      loadPool(true);
    }
  };

  const settle = async () => {
    if (race == null) return;
    const { ok, data } = await action.run<{
      summary?: { winners: number; refunded: number; totalPayout: number };
    }>("post", `/admin/race/${race.id}/betting/calculate-payouts`);
    setSettling(false);
    if (ok) {
      const s = data?.summary;
      toast.success(
        s
          ? `Payouts: ${s.winners} winner${s.winners === 1 ? "" : "s"}, ${s.refunded} refunded, ${money(
              s.totalPayout
            )} total.`
          : "Payouts calculated."
      );
      setView("owed");
      loadPool(true);
    }
  };

  /** Every bet on the race in one list, by bettor — who backed which bird. */
  const allBets = useMemo(() => {
    const rows = (pool?.pools ?? []).flatMap((p) =>
      p.entries.map((e) => ({ ...e, poolLabel: poolName(p) }))
    );
    return rows.sort(
      (a, b) =>
        (a.bettorName || a.bettorEmail || "").localeCompare(b.bettorName || b.bettorEmail || "") ||
        (a.band ?? "").localeCompare(b.band ?? "")
    );
  }, [pool]);

  /** What each person is owed across every pool — paid out by hand. */
  const owedOut = useMemo(() => {
    const map = new Map<string, { name: string; email: string; total: number; bets: number }>();
    for (const p of pool?.pools ?? []) {
      for (const e of p.entries) {
        if (e.payoutValue && e.payoutValue > 0) {
          const cur = map.get(e.bettorId) ?? {
            name: e.bettorName ?? "",
            email: e.bettorEmail ?? "",
            total: 0,
            bets: 0,
          };
          cur.total += e.payoutValue;
          cur.bets += 1;
          map.set(e.bettorId, cur);
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [pool]);

  if (!mayView || racesReq.forbidden || poolRefused) return <NoAccess what="Betting" />;

  const unpaid = (pool?.pools ?? []).reduce(
    (s, p) => s + p.entries.filter((e) => !e.stakePaid).length,
    0
  );

  /** The portal tints a row by who placed the bet; here it is a word on the line. */
  const backer = (e: Entry) =>
    e.ownerUserId != null && e.bettorId === e.ownerUserId ? "own bird" : null;

  const entryBadge = (e: Entry) =>
    !e.stakePaid && e.status === "PLACED"
      ? { label: "unpaid", bg: "bg-rose-100", text: "text-rose-700" }
      : (BET_BADGE[e.status] ?? BET_BADGE.PLACED);

  return (
    <Screen
      title="Betting"
      subtitle={name ?? undefined}
      onRefresh={() => {
        racesReq.refresh();
        loadPool(true);
      }}
      refreshing={racesReq.refreshing}
      header={
        races.length > 0 ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
              {races.map((r) => {
                const active = r.id === raceId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setRaceId(r.id)}
                    className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 ${
                      active ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
                    }`}
                  >
                    {r.bettingOpen && (
                      <View
                        className={`h-1.5 w-1.5 rounded-full ${
                          active ? "bg-white" : "bg-emerald-500"
                        }`}
                      />
                    )}
                    <Text
                      className={`text-xs font-medium ${active ? "text-white" : "text-slate-600"}`}
                    >
                      {r.name || r.description || `Race ${r.raceNumber ?? r.id}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="mt-3">
              <Segments<View_>
                value={view}
                onChange={setView}
                options={[
                  { key: "pools", label: "Pools" },
                  { key: "bets", label: `All bets (${allBets.length})` },
                  { key: "owed", label: `Payouts owed (${owedOut.length})` },
                ]}
              />
            </View>
          </>
        ) : undefined
      }
    >
      {racesReq.loading ? (
        <Loading />
      ) : races.length === 0 ? (
        <View className="mt-4">
          <Empty>This event has no races, so there is nothing to bet on.</Empty>
        </View>
      ) : loadingPool ? (
        <Loading />
      ) : poolError ? (
        <Notice>{poolError}</Notice>
      ) : (
        <>
          <FigureRow>
            <Figure label="Bets" value={pool?.totals.totalBets ?? 0} basis="31%" />
            <Figure label="Money in" value={money(pool?.totals.totalIn)} basis="31%" />
            <Figure
              label="Paid out"
              value={money(pool?.totals.totalPayout)}
              tone="text-blue-600"
              basis="31%"
            />
          </FigureRow>

          <Text className="mt-2 text-xs text-slate-500">
            Race is {raceStatus ? raceStatus.toLowerCase() : "unknown"} · open pool{" "}
            {isOpen ? "open to everybody" : "closed"}
          </Text>

          {mayManage && registering ? (
            <ButtonRow>
              <Button
                label={isOpen ? "Close the pool" : "Open the pool"}
                tone={isOpen ? "secondary" : "primary"}
                icon={isOpen ? "lock-closed-outline" : "lock-open-outline"}
                onPress={toggle}
                pending={action.pending && !settling}
                full
              />
              <Button label="Take a bet" icon="cash-outline" onPress={() => setBetting(true)} full />
            </ButtonRow>
          ) : null}

          {mayManage && !registering ? (
            <Text className="mt-2 text-xs text-slate-400">
              The pool can only be opened or closed, and cash bets taken, while the race is still
              registering.
            </Text>
          ) : null}

          {maySettle ? (
            <>
              <ButtonRow>
                <Button
                  label="Calculate payouts"
                  tone="danger"
                  icon="calculator-outline"
                  onPress={() => setSettling(true)}
                  disabled={!ended}
                  full
                />
              </ButtonRow>
              {!ended ? (
                <Text className="mt-2 text-xs text-amber-700">
                  The race must be ended before payouts can be calculated (it is{" "}
                  {raceStatus ? raceStatus.toLowerCase() : "not"}).
                </Text>
              ) : null}
            </>
          ) : null}

          {isOpen ? (
            <Notice>Betting is open on this race, so these figures are still moving.</Notice>
          ) : null}

          {unpaid > 0 && (
            <Notice tone="rose">
              {unpaid} stake{unpaid === 1 ? "" : "s"} on this race have not been paid.
            </Notice>
          )}

          {view === "pools" ? (
            <View className="mt-4" style={{ gap: 14 }}>
              {(pool?.pools ?? []).length === 0 ? (
                <Empty>Nobody has bet on this race.</Empty>
              ) : (
                (pool?.pools ?? []).map((p) => (
                  <View key={`${p.category}:${p.tierIndex}`}>
                    <View className="mb-2 flex-row items-baseline justify-between">
                      <Text className="text-sm font-semibold text-slate-900">{poolName(p)}</Text>
                      <Text className="text-xs text-slate-500">
                        {money(p.totalIn)} in · {money(p.totalPayout)} out · {p.entries.length} bet
                        {p.entries.length === 1 ? "" : "s"}
                      </Text>
                    </View>

                    <Rows>
                      {p.entries.map((e) => (
                        <Row
                          key={e.betId}
                          title={e.band ?? "No band"}
                          subtitle={
                            [
                              e.bettorName || e.bettorEmail,
                              backer(e) ?? (e.ownerName ? `owner ${e.ownerName}` : null),
                              e.position != null ? `finished ${e.position}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || undefined
                          }
                          right={money(e.amountIn)}
                          rightSub={
                            e.payoutValue != null && e.payoutValue > 0
                              ? `payout ${money(e.payoutValue)}`
                              : undefined
                          }
                          badge={entryBadge(e)}
                        />
                      ))}
                    </Rows>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {view === "bets" ? (
            <View className="mt-4">
              {allBets.length === 0 ? (
                <Empty>Nobody has bet on this race.</Empty>
              ) : (
                <Rows>
                  {allBets.map((e) => (
                    <Row
                      key={e.betId}
                      title={e.bettorName || e.bettorEmail || "Unnamed"}
                      subtitle={
                        [
                          e.band ?? "no band",
                          backer(e) ?? (e.ownerName ? `owner ${e.ownerName}` : null),
                          e.poolLabel,
                          e.stakePaid ? null : "stake not paid",
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      right={money(e.amountIn)}
                      rightSub={e.bettorName ? (e.bettorEmail ?? undefined) : undefined}
                      badge={entryBadge(e)}
                    />
                  ))}
                </Rows>
              )}
            </View>
          ) : null}

          {view === "owed" ? (
            <View className="mt-4">
              {owedOut.length === 0 ? (
                <Empty>
                  {ended
                    ? "Nobody is owed a payout. If the race has just ended, calculate payouts first."
                    : "Payouts are worked out once the race has ended."}
                </Empty>
              ) : (
                <>
                  <Text className="mb-2 text-xs text-slate-400">
                    These are paid out by hand. Nothing here sends money.
                  </Text>
                  <Rows>
                    {owedOut.map((o) => (
                      <Row
                        key={o.id}
                        title={o.name || o.email || "Unnamed"}
                        subtitle={
                          [o.name ? o.email : null, `${o.bets} bet${o.bets === 1 ? "" : "s"}`]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                        right={money(o.total)}
                        rightTone="text-emerald-600"
                      />
                    ))}
                  </Rows>
                </>
              )}
            </View>
          ) : null}
        </>
      )}

      <CashBetSheet
        open={betting}
        onClose={() => setBetting(false)}
        raceId={race?.id ?? 0}
        raceName={raceLabel}
        onPlaced={() => loadPool(true)}
      />

      <Confirm
        open={settling}
        title={`Calculate payouts on ${money(pool?.totals.totalIn ?? 0)}?`}
        body={`${pool?.totals.totalBets ?? 0} bet${
          (pool?.totals.totalBets ?? 0) === 1 ? "" : "s"
        } on ${raceLabel}, ${money(
          pool?.totals.totalIn ?? 0
        )} staked. Winners are worked out from the finishing positions and a payout is written against every winning or refunded bet. Run it again only if the result changes.`}
        confirmLabel="Calculate"
        pending={action.pending}
        onConfirm={settle}
        onCancel={() => setSettling(false)}
      />
    </Screen>
  );
}
