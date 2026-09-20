import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { CashBetSheet } from "@/components/admin/CashBetSheet";
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

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
  bettingOpen: boolean;
}

interface Entry {
  band: string | null;
  bettorName: string | null;
  position: number | null;
  amountIn: number;
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

/**
 * Betting pools, per race.
 *
 * Money in against money out, per pool, because that difference is the only
 * question worth asking of a pool before it settles. Unpaid stakes are called
 * out on the row: a bet whose stake never cleared is the one that causes an
 * argument at payout time, and it looks identical to a good bet otherwise.
 *
 * Opening a pool is reversible and lives here. Settling it is not: calculating
 * payouts writes what everyone is owed, so it asks first and says what it is
 * about to do. That confirmation is the only thing standing between a mistap
 * and a payout run, which is why it names the race rather than asking "are you
 * sure".
 *
 * Cash bets are taken here too. They need a bettor, a bird and a tier chosen
 * together, so they get their own stepped sheet rather than a button — and the
 * whole slip is sent at once, because a person backing four birds should not
 * end up with two of them placed.
 */
export default function EventBetting() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();

  const { can } = usePermissions();
  const action = useAdminAction();
  const [raceId, setRaceId] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const [betting, setBetting] = useState(false);
  const [pool, setPool] = useState<PoolData | null>(null);
  const [loadingPool, setLoadingPool] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);

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

  useEffect(() => {
    if (raceId == null) return;
    let cancelled = false;
    setLoadingPool(true);
    setPoolError(null);
    api
      .get(`/admin/race/${raceId}/betting/pool`)
      .then(({ data }) => {
        if (!cancelled) setPool(data ?? null);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setPool(null);
        setPoolError(err?.response?.data?.message ?? "Could not load this pool.");
      })
      .finally(() => {
        if (!cancelled) setLoadingPool(false);
      });
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  const race = races.find((r) => r.id === raceId) ?? null;
  const mayManage = can("betting.manage");
  const maySettle = can("betting.payouts");

  const loadPool = () => {
    if (raceId == null) return;
    setLoadingPool(true);
    api
      .get(`/admin/race/${raceId}/betting/pool`)
      .then(({ data }) => setPool(data ?? null))
      .catch(() => undefined)
      .finally(() => setLoadingPool(false));
  };

  const toggle = async () => {
    if (race == null) return;
    const { ok } = await action.run("post", `/admin/race/${race.id}/betting/toggle`, {}, {
      success: race.bettingOpen ? "Pool closed." : "Pool opened.",
    });
    if (ok) {
      racesReq.reload();
      loadPool();
    }
  };

  const settle = async () => {
    if (race == null) return;
    const { ok } = await action.run(
      "post",
      `/admin/race/${race.id}/betting/calculate-payouts`,
      {},
      { success: "Payouts calculated." }
    );
    if (ok) {
      setSettling(false);
      loadPool();
    }
  };

  if (racesReq.forbidden) return <NoAccess what="Betting" />;

  const unpaid = (pool?.pools ?? []).reduce(
    (s, p) => s + p.entries.filter((e) => !e.stakePaid).length,
    0
  );

  return (
    <Screen
      title="Betting"
      subtitle={name ?? undefined}
      onRefresh={racesReq.refresh}
      refreshing={racesReq.refreshing}
      header={
        races.length > 0 ? (
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
                    {r.name || `Race ${r.raceNumber ?? r.id}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
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

          {mayManage || maySettle ? (
            <ButtonRow>
              {mayManage ? (
                <Button
                  label={race?.bettingOpen ? "Close the pool" : "Open the pool"}
                  tone={race?.bettingOpen ? "secondary" : "primary"}
                  icon={race?.bettingOpen ? "lock-closed-outline" : "lock-open-outline"}
                  onPress={toggle}
                  pending={action.pending}
                  full
                />
              ) : null}
              {mayManage && race?.bettingOpen ? (
                <Button
                  label="Take a bet"
                  icon="cash-outline"
                  onPress={() => setBetting(true)}
                  full
                />
              ) : null}
              {maySettle ? (
                <Button
                  label="Settle payouts"
                  tone="danger"
                  icon="cash-outline"
                  onPress={() => setSettling(true)}
                  disabled={race?.bettingOpen === true}
                  full
                />
              ) : null}
            </ButtonRow>
          ) : null}

          {race?.bettingOpen && maySettle ? (
            <Text className="mt-2 text-xs text-slate-400">
              Close the pool before settling it.
            </Text>
          ) : null}

          {pool?.bettingOpen ? (
            <Notice>Betting is open on this race, so these figures are still moving.</Notice>
          ) : null}

          {unpaid > 0 && (
            <Notice tone="rose">
              {unpaid} stake{unpaid === 1 ? "" : "s"} on this race have not been paid.
            </Notice>
          )}

          <View className="mt-4" style={{ gap: 14 }}>
            {(pool?.pools ?? []).length === 0 ? (
              <Empty>Nobody has bet on this race.</Empty>
            ) : (
              (pool?.pools ?? []).map((p) => (
                <View key={`${p.category}:${p.tierIndex}`}>
                  <View className="mb-2 flex-row items-baseline justify-between">
                    <Text className="text-sm font-semibold text-slate-900">
                      {p.category.replace(/_/g, " ").toLowerCase()}
                      {p.tierIndex > 0 ? ` · tier ${p.tierIndex}` : ""}
                    </Text>
                    <Text className="text-xs text-slate-500">
                      {money(p.totalIn)} in · {money(p.totalPayout)} out
                    </Text>
                  </View>

                  <Rows>
                    {p.entries.slice(0, 50).map((e, index) => (
                      <Row
                        key={`${e.band}-${index}`}
                        title={e.band ?? "No band"}
                        subtitle={
                          [e.bettorName, e.position != null ? `finished ${e.position}` : null]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                        right={money(e.amountIn)}
                        rightSub={
                          e.payoutValue != null && e.payoutValue > 0
                            ? `won ${money(e.payoutValue)}`
                            : undefined
                        }
                        badge={
                          e.stakePaid
                            ? null
                            : { label: "unpaid", bg: "bg-rose-100", text: "text-rose-700" }
                        }
                      />
                    ))}
                  </Rows>
                </View>
              ))
            )}
          </View>
        </>
      )}

      <CashBetSheet
        open={betting}
        onClose={() => setBetting(false)}
        raceId={race?.id ?? 0}
        raceName={race?.name || `race ${race?.raceNumber ?? ""}`}
        onPlaced={loadPool}
      />

      <Confirm
        open={settling}
        title="Settle this pool?"
        body={`Payouts for ${race?.name || `race ${race?.raceNumber ?? ""}`} will be calculated from the finishing positions and written against every bet. Run it again only if the result changes.`}
        confirmLabel="Settle"
        pending={action.pending}
        onConfirm={settle}
        onCancel={() => setSettling(false)}
      />
    </Screen>
  );
}
