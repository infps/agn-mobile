import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import {
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

interface Group {
  id: number;
  groupNumber: number;
  birdCount: number;
  calculatedPrice: number;
  startingBid: number;
  status: string;
  isHouse: boolean;
  finalPrice: number | null;
  owner?: { name: string | null } | null;
  lastBidAt: string | null;
  currentBid?: { amount: number; bidderName: string | null } | null;
}

interface Config {
  pricePerBird: number;
  targetGroupSize: number;
  biddingDuration: number;
  phase: string;
  activeGroupId: number | null;
  youtubeStreamUrl: string | null;
}

const STATUS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-slate-200", text: "text-slate-600" },
  ACTIVE: { bg: "bg-emerald-100", text: "text-emerald-700" },
  SOLD: { bg: "bg-blue-100", text: "text-blue-700" },
  UNSOLD: { bg: "bg-amber-100", text: "text-amber-700" },
};

/**
 * The Calcutta, as something to watch rather than run.
 *
 * The portal drives the auction over a websocket — starting lots, closing
 * them, taking bids against a countdown. That belongs on the screen the
 * auctioneer is already sitting at; running a live auction from a phone, where
 * a dropped connection loses somebody's bid, is not an improvement.
 *
 * So this follows along. While a lot is live it polls every few seconds, which
 * is close enough for watching and cannot leave the auction in a broken state
 * the way a half-delivered bid could.
 */
export default function EventCalcutta() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();

  const configReq = useAdminData<{ config?: Config }>(
    eventId ? `/admin/event/${eventId}/calcutta/config` : null,
    [eventId]
  );
  const groupsReq = useAdminData<{ groups?: Group[] }>(
    eventId ? `/admin/event/${eventId}/calcutta/groups` : null,
    [eventId]
  );

  const config = configReq.data?.config ?? null;
  const groups = groupsReq.data?.groups ?? [];
  const live = config?.phase === "BIDDING";

  // Only while something is actually being bid on. Polling a finished auction
  // is just noise on somebody's data plan.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => groupsReq.reload(), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  if (configReq.forbidden || groupsReq.forbidden) return <NoAccess what="The Calcutta" />;

  const sold = groups.filter((g) => g.status === "SOLD");
  const raised = sold.reduce((s, g) => s + (g.finalPrice ?? 0), 0);
  const activeGroup = groups.find((g) => g.id === config?.activeGroupId) ?? null;

  return (
    <Screen
      title="Calcutta"
      subtitle={
        name
          ? `${name} · ${config?.phase ? config.phase.toLowerCase() : "not set up"}`
          : config?.phase?.toLowerCase()
      }
      onRefresh={() => {
        configReq.refresh();
        groupsReq.refresh();
      }}
      refreshing={groupsReq.refreshing}
    >
      {configReq.loading || groupsReq.loading ? (
        <Loading />
      ) : (
        <>
          {configReq.error ? <Notice>{configReq.error}</Notice> : null}

          {!config ? (
            <View className="mt-4">
              <Empty>No Calcutta has been set up for this season.</Empty>
            </View>
          ) : (
            <>
              <FigureRow>
                <Figure label="Lots" value={groups.length} basis="31%" />
                <Figure label="Sold" value={sold.length} tone="text-blue-600" basis="31%" />
                <Figure label="Raised" value={money(raised)} tone="text-emerald-600" basis="31%" />
              </FigureRow>

              {activeGroup && (
                <View className="mt-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4">
                  <Text className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    On the block now
                  </Text>
                  <Text className="mt-1 text-lg font-bold text-slate-900">
                    Lot {activeGroup.groupNumber} · {activeGroup.birdCount} birds
                  </Text>
                  <Text className="mt-1 text-2xl font-bold text-emerald-700">
                    {money(activeGroup.currentBid?.amount ?? activeGroup.startingBid)}
                  </Text>
                  <Text className="text-xs text-emerald-700">
                    {activeGroup.currentBid?.bidderName
                      ? `bid by ${activeGroup.currentBid.bidderName}`
                      : "no bids yet — starting price"}
                  </Text>
                </View>
              )}

              {!live && (
                <Notice>
                  Bidding is not open. Lots are started and closed from the portal, where the
                  auction runs live.
                </Notice>
              )}

              <View className="mt-4">
                {groups.length === 0 ? (
                  <Empty>No lots have been generated yet.</Empty>
                ) : (
                  <Rows>
                    {groups.map((g) => {
                      const price =
                        g.finalPrice ?? g.currentBid?.amount ?? g.startingBid;
                      return (
                        <Row
                          key={g.id}
                          title={`Lot ${g.groupNumber}${g.isHouse ? " · house" : ""}`}
                          subtitle={
                            [
                              `${g.birdCount} birds`,
                              g.owner?.name ?? g.currentBid?.bidderName ?? null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || undefined
                          }
                          right={money(price)}
                          rightSub={g.status === "SOLD" ? "sold" : undefined}
                          rightTone={
                            g.status === "SOLD"
                              ? "text-blue-600"
                              : g.id === config.activeGroupId
                                ? "text-emerald-600"
                                : "text-slate-600"
                          }
                          badge={{
                            label: g.status.toLowerCase(),
                            ...(STATUS[g.status] ?? STATUS.PENDING),
                          }}
                        />
                      );
                    })}
                  </Rows>
                )}
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
