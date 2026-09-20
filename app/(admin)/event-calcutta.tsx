import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
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
  Screen,
  Sheet,
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

interface Buyer {
  id: string;
  name: string | null;
  lastName?: string | null;
  email: string | null;
}

const STATUS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-slate-200", text: "text-slate-600" },
  ACTIVE: { bg: "bg-emerald-100", text: "text-emerald-700" },
  SOLD: { bg: "bg-blue-100", text: "text-blue-700" },
  UNSOLD: { bg: "bg-amber-100", text: "text-amber-700" },
  EARLY_BOUGHT: { bg: "bg-violet-100", text: "text-violet-700" },
};

/**
 * The Calcutta, watched and run.
 *
 * Bids still arrive over the portal's websocket — that is where the auctioneer
 * sits, and where a countdown belongs. What lives here is the control around
 * the bidding: putting the next lot up, closing the one that is up, pricing a
 * lot nobody wanted, and selling one outright before it reaches the block.
 *
 * While a lot is live it polls every few seconds. Polling lags a websocket, so
 * the figure on screen can be a beat behind the room. That is why closing a lot
 * names the bid it is about to accept instead of only asking to confirm — the
 * number is the thing worth checking, not the intent.
 */
export default function EventCalcutta() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [generating, setGenerating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [repricing, setRepricing] = useState<Group | null>(null);
  const [price, setPrice] = useState("");
  const [housing, setHousing] = useState<Group | null>(null);
  const [buyingFor, setBuyingFor] = useState<Group | null>(null);
  const [acting, setActing] = useState<Group | null>(null);

  const base = eventId ? `/admin/event/${eventId}/calcutta` : null;

  const configReq = useAdminData<{ config?: Config }>(base ? `${base}/config` : null, [eventId]);
  const groupsReq = useAdminData<{ groups?: Group[] }>(base ? `${base}/groups` : null, [eventId]);

  // Only fetched once somebody is actually choosing a buyer — the account list
  // is large and irrelevant to everyone just watching the auction.
  const buyersReq = useAdminData<{ users?: Buyer[] }>(buyingFor ? "/admin/users" : null, [
    buyingFor?.id,
  ]);

  const config = configReq.data?.config ?? null;
  const groups = useMemo(() => groupsReq.data?.groups ?? [], [groupsReq.data]);
  const live = config?.phase === "BIDDING";
  const mayManage = can("calcutta.manage");

  // Only while something is actually being bid on. Polling a finished auction
  // is just noise on somebody's data plan.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => groupsReq.reload(), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const refreshBoth = () => {
    configReq.reload();
    groupsReq.reload();
  };

  const generate = async () => {
    const { ok } = await action.run("post", `${base}/generate-groups`, {}, {
      success: "Lots generated.",
    });
    if (ok) {
      setGenerating(false);
      refreshBoth();
    }
  };

  const startLot = async (groupId: string | number) => {
    const { ok } = await action.run("post", `${base}/auction/start`, { groupId });
    if (ok) {
      toast.success("Lot is up.");
      setStarting(false);
      refreshBoth();
    }
  };

  const closeLot = async () => {
    const { ok } = await action.run("post", `${base}/auction/close`, {}, {
      success: "Lot closed.",
    });
    if (ok) {
      setClosing(false);
      refreshBoth();
    }
  };

  const reprice = async () => {
    if (!repricing) return;
    const value = parseFloat(price.trim());
    if (!price.trim() || isNaN(value) || value <= 0) {
      toast.error("Give a starting price above zero.");
      return;
    }
    const { ok } = await action.run(
      "post",
      `${base}/groups/${repricing.id}/reprice`,
      { newStartingBid: value },
      { success: `Lot ${repricing.groupNumber} repriced.` }
    );
    if (ok) {
      setRepricing(null);
      setPrice("");
      refreshBoth();
    }
  };

  const setHouse = async () => {
    if (!housing) return;
    const { ok } = await action.run("post", `${base}/groups/${housing.id}/set-house`, {}, {
      success: `Lot ${housing.groupNumber} is the house's.`,
    });
    if (ok) {
      setHousing(null);
      refreshBoth();
    }
  };

  const earlyBuy = async (buyerId: string | number) => {
    if (!buyingFor) return;
    const { ok } = await action.run(
      "post",
      `${base}/groups/${buyingFor.id}/early-buy`,
      { buyerId },
      { success: `Lot ${buyingFor.groupNumber} sold.` }
    );
    if (ok) {
      setBuyingFor(null);
      refreshBoth();
    }
  };

  if (configReq.forbidden || groupsReq.forbidden) return <NoAccess what="The Calcutta" />;

  const sold = groups.filter((g) => g.status === "SOLD" || g.status === "EARLY_BOUGHT");
  const raised = sold.reduce((s, g) => s + (g.finalPrice ?? 0), 0);
  const activeGroup = groups.find((g) => g.id === config?.activeGroupId) ?? null;

  /** Lots that have not been sold and are not currently up. */
  const startable: Choice[] = groups
    .filter((g) => g.status === "PENDING" || g.status === "UNSOLD")
    .map((g) => ({
      key: g.id,
      label: `Lot ${g.groupNumber}`,
      hint: `${g.birdCount} birds · starts at ${money(g.startingBid)}`,
    }));

  const buyers: Choice[] = (buyersReq.data?.users ?? []).map((u) => ({
    key: u.id,
    label: `${u.name ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unnamed",
    hint: u.email,
  }));

  const onBlockPrice = activeGroup?.currentBid?.amount ?? activeGroup?.startingBid ?? 0;

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
                    {money(onBlockPrice)}
                  </Text>
                  <Text className="text-xs text-emerald-700">
                    {activeGroup.currentBid?.bidderName
                      ? `bid by ${activeGroup.currentBid.bidderName}`
                      : "no bids yet — starting price"}
                  </Text>
                  {mayManage ? (
                    <ButtonRow>
                      <Button
                        label="Close this lot"
                        tone="danger"
                        icon="hammer-outline"
                        onPress={() => setClosing(true)}
                        full
                      />
                    </ButtonRow>
                  ) : null}
                </View>
              )}

              {mayManage ? (
                <ButtonRow>
                  {!activeGroup ? (
                    <Button
                      label="Put a lot up"
                      icon="play-outline"
                      onPress={() => setStarting(true)}
                      disabled={startable.length === 0}
                      full
                    />
                  ) : null}
                  <Button
                    label="Generate lots"
                    tone="secondary"
                    icon="albums-outline"
                    onPress={() => setGenerating(true)}
                    full
                  />
                </ButtonRow>
              ) : null}

              {!live && (
                <Notice>
                  Bidding is not open on this season yet. Lots can still be priced, sold early or
                  handed to the house.
                </Notice>
              )}

              <View className="mt-4">
                {groups.length === 0 ? (
                  <Empty>No lots have been generated yet.</Empty>
                ) : (
                  <Rows>
                    {groups.map((g) => {
                      const price = g.finalPrice ?? g.currentBid?.amount ?? g.startingBid;
                      const settled = g.status === "SOLD" || g.status === "EARLY_BOUGHT";
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
                          rightSub={settled ? "sold" : undefined}
                          rightTone={
                            settled
                              ? "text-blue-600"
                              : g.id === config.activeGroupId
                                ? "text-emerald-600"
                                : "text-slate-600"
                          }
                          badge={{
                            label: g.status.replace(/_/g, " ").toLowerCase(),
                            ...(STATUS[g.status] ?? STATUS.PENDING),
                          }}
                          onPress={
                            mayManage && !settled && g.id !== config.activeGroupId
                              ? () => setActing(g)
                              : undefined
                          }
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

      <Sheet
        open={acting != null}
        onClose={() => setActing(null)}
        title={`Lot ${acting?.groupNumber ?? ""}`}
        subtitle={`${acting?.birdCount ?? 0} birds · starts at ${money(acting?.startingBid)}`}
      >
        <View className="mt-2" style={{ gap: 8 }}>
          <Button
            label="Change the starting price"
            tone="secondary"
            icon="pricetag-outline"
            onPress={() => {
              setPrice(acting ? String(acting.startingBid) : "");
              setRepricing(acting);
              setActing(null);
            }}
          />
          <Button
            label="Sell it now to a buyer"
            tone="secondary"
            icon="person-outline"
            onPress={() => {
              setBuyingFor(acting);
              setActing(null);
            }}
          />
          <Button
            label="Hand it to the house"
            tone="secondary"
            icon="home-outline"
            onPress={() => {
              setHousing(acting);
              setActing(null);
            }}
          />
        </View>
      </Sheet>

      <Sheet
        open={starting}
        onClose={() => setStarting(false)}
        title="Put a lot up"
        subtitle="Bidding opens on it immediately"
      >
        <ChoiceList
          choices={startable}
          onPick={startLot}
          empty="Every lot has been sold or is already up."
        />
      </Sheet>

      <Sheet
        open={buyingFor != null}
        onClose={() => setBuyingFor(null)}
        title={`Sell lot ${buyingFor?.groupNumber ?? ""}`}
        subtitle={`Outright at ${money(buyingFor?.calculatedPrice)} — it never goes to the block`}
      >
        {buyersReq.loading ? (
          <Loading />
        ) : (
          <ChoiceList choices={buyers} onPick={earlyBuy} empty="No accounts to sell to." />
        )}
      </Sheet>

      <Sheet
        open={repricing != null}
        onClose={() => setRepricing(null)}
        title={`Reprice lot ${repricing?.groupNumber ?? ""}`}
        subtitle="Used when a lot went round once and nobody bid"
      >
        <Field
          label="Starting price"
          value={price}
          onChange={setPrice}
          keyboard="decimal-pad"
          autoFocus
          hint={`It was ${money(repricing?.startingBid)}.`}
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setRepricing(null)} full />
          <Button label="Reprice" onPress={reprice} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={closing}
        title={`Close lot ${activeGroup?.groupNumber ?? ""}?`}
        body={
          activeGroup?.currentBid
            ? `It sells to ${activeGroup.currentBid.bidderName ?? "the leading bidder"} for ${money(
                activeGroup.currentBid.amount
              )}. Check that against the room — this screen polls, so it can be a beat behind.`
            : "Nobody has bid on it. Closing now leaves it unsold, and it can be repriced or handed to the house."
        }
        confirmLabel="Close it"
        pending={action.pending}
        onConfirm={closeLot}
        onCancel={() => setClosing(false)}
      />

      <Confirm
        open={generating}
        title="Generate the lots?"
        body="Every registered loft with birds is grouped into lots at the configured size and price. Lots that already exist are replaced."
        confirmLabel="Generate"
        pending={action.pending}
        onConfirm={generate}
        onCancel={() => setGenerating(false)}
      />

      <Confirm
        open={housing != null}
        title={`Hand lot ${housing?.groupNumber ?? ""} to the house?`}
        body="The house takes it at the calculated price. It will not go to the block."
        confirmLabel="Hand it over"
        tone="primary"
        pending={action.pending}
        onConfirm={setHouse}
        onCancel={() => setHousing(null)}
      />
    </Screen>
  );
}
