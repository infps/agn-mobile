import React, { useEffect, useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import api from "@/service/api.service";
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
  SearchBar,
  Screen,
  Sheet,
  money,
} from "@/components/admin/ui";
import { Caption, Line, Segments, fullName, parseAmount } from "@/components/admin/MoneyBits";

interface Group {
  id: number;
  groupNumber: number;
  birdCount: number;
  calculatedPrice: number;
  startingBid: number;
  /** PENDING, BIDDING, SOLD, EARLY_BOUGHT, HOUSE or COMPLETED. */
  status: string;
  isHouse: boolean;
  finalPrice: number | null;
  owner?: { id: string; name: string | null } | null;
  lastBidAt: string | null;
  currentBid?: { amount: number; bidderName: string | null } | null;
  members?: {
    eventInventoryId: number;
    breeder: { firstName: string | null; lastName: string | null } | null;
  }[];
}

interface Config {
  pricePerBird: number;
  targetGroupSize: number;
  biddingDuration: number;
  antiSnipeDuration: number;
  bidRaiseOptions: number[] | null;
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

type Tab = "auction" | "lots" | "setup";
type LotMode = "home" | "reprice" | "buyer";

const STATUS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-slate-200", text: "text-slate-600" },
  EARLY_BOUGHT: { bg: "bg-blue-100", text: "text-blue-700" },
  BIDDING: { bg: "bg-amber-100", text: "text-amber-800" },
  SOLD: { bg: "bg-emerald-100", text: "text-emerald-700" },
  HOUSE: { bg: "bg-orange-100", text: "text-orange-700" },
  COMPLETED: { bg: "bg-violet-100", text: "text-violet-700" },
};

const BLANK_SETUP = {
  pricePerBird: "",
  targetGroupSize: "15",
  biddingDuration: "120",
  antiSnipeDuration: "10",
  bidRaiseOptions: "10,50,100,500",
  youtubeStreamUrl: "",
};

const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? parseInt(text.trim(), 10) : null);

/**
 * The Calcutta, set up, watched and run.
 *
 * Three parts, the portal's three: the setup that prices the auction and cuts
 * the lofts into lots, the lots themselves, and the block where one lot at a
 * time is sold.
 *
 * Bids arrive in the portal over a websocket. This app has none, so while a lot
 * is up it asks again every few seconds instead. Polling lags a websocket, so
 * the figure on screen can be a beat behind the room. That is why closing a lot
 * names the bid it is about to accept instead of only asking to confirm — the
 * number is the thing worth checking, not the intent — and why the anti-snipe
 * wait is counted down here from the time of the last bid, the same way the
 * server counts it.
 *
 * A lot with no bids cannot be closed; the server refuses. It is either priced
 * lower and put back, or handed to the house, and both of those are offered on
 * the block for exactly that moment.
 */
export default function EventCalcutta() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [tab, setTab] = useState<Tab>("auction");
  const [generating, setGenerating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  const [acting, setActing] = useState<Group | null>(null);
  const [lotMode, setLotMode] = useState<LotMode>("home");
  const [price, setPrice] = useState("");
  const [confirmingPrice, setConfirmingPrice] = useState(false);
  const [confirmingHouse, setConfirmingHouse] = useState(false);
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [buyer, setBuyer] = useState<{ id: string; name: string } | null>(null);

  const [setup, setSetup] = useState(BLANK_SETUP);
  const [now, setNow] = useState(() => Date.now());

  const base = eventId ? `/admin/event/${eventId}/calcutta` : null;

  const configReq = useAdminData<{ config?: Config | null }>(base ? `${base}/config` : null, [
    eventId,
  ]);
  const groupsReq = useAdminData<{ groups?: Group[] }>(base ? `${base}/groups` : null, [eventId]);

  // Only fetched once somebody is actually choosing a buyer — the account list
  // is large and irrelevant to everyone just watching the auction.
  const choosingBuyer = acting != null && lotMode === "buyer";
  const buyersReq = useAdminData<{ users?: Buyer[] }>(choosingBuyer ? "/admin/users" : null, [
    choosingBuyer,
  ]);

  const config = configReq.data?.config ?? null;
  const groups = useMemo(() => groupsReq.data?.groups ?? [], [groupsReq.data]);
  const mayManage = can("calcutta.manage");
  const activeGroup = groups.find((g) => g.id === config?.activeGroupId) ?? null;
  const live = config?.activeGroupId != null;

  // Only while something is actually being bid on. Polling a finished auction
  // is just noise on somebody's data plan.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      groupsReq.reload();
      configReq.reload();
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // The anti-snipe countdown only needs a clock while there is a bid to count from.
  const lastBidAt = activeGroup?.lastBidAt ? new Date(activeGroup.lastBidAt).getTime() : null;
  useEffect(() => {
    if (lastBidAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [lastBidAt]);

  // The form follows the saved config, so reopening Setup never shows stale boxes.
  useEffect(() => {
    if (!config) {
      setSetup(BLANK_SETUP);
      return;
    }
    setSetup({
      pricePerBird: String(config.pricePerBird ?? ""),
      targetGroupSize: String(config.targetGroupSize ?? 15),
      biddingDuration: String(config.biddingDuration ?? 120),
      antiSnipeDuration: String(config.antiSnipeDuration ?? 10),
      bidRaiseOptions: (config.bidRaiseOptions ?? []).join(","),
      youtubeStreamUrl: config.youtubeStreamUrl ?? "",
    });
    // Keyed on the values, not the object: every poll returns a new object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config?.pricePerBird,
    config?.targetGroupSize,
    config?.biddingDuration,
    config?.antiSnipeDuration,
    config?.youtubeStreamUrl,
    (config?.bidRaiseOptions ?? []).join(","),
    config == null,
  ]);

  const refreshBoth = () => {
    configReq.reload();
    groupsReq.reload();
  };

  const openLot = (g: Group) => {
    setLotMode("home");
    setPrice(String(g.startingBid));
    setBuyer(null);
    setBuyerId("");
    setBuyerQuery("");
    setActing(g);
  };

  const saveSetup = async () => {
    const pricePerBird = parseAmount(setup.pricePerBird);
    const targetGroupSize = wholeNumber(setup.targetGroupSize);
    const biddingDuration = wholeNumber(setup.biddingDuration);
    const antiSnipeDuration = wholeNumber(setup.antiSnipeDuration);
    if (pricePerBird == null || pricePerBird < 0) {
      toast.error("Give a price per bird.");
      return;
    }
    if (!targetGroupSize) {
      toast.error("The target group size is a whole number above zero.");
      return;
    }
    if (biddingDuration == null || antiSnipeDuration == null) {
      toast.error("The two durations are whole numbers of seconds.");
      return;
    }
    const { ok } = await action.run(
      "post",
      `${base}/config`,
      {
        pricePerBird,
        targetGroupSize,
        biddingDuration,
        antiSnipeDuration,
        bidRaiseOptions: setup.bidRaiseOptions
          .split(",")
          .map((x) => parseInt(x.trim(), 10))
          .filter(Boolean),
        youtubeStreamUrl: setup.youtubeStreamUrl.trim() || null,
      },
      { success: "Config saved." }
    );
    if (ok) refreshBoth();
  };

  const generate = async () => {
    const { ok, data } = await action.run<{ groups?: unknown[] }>(
      "post",
      `${base}/generate-groups`
    );
    setGenerating(false);
    if (ok) {
      toast.success(`Generated ${data?.groups?.length ?? 0} groups.`);
      setTab("lots");
      refreshBoth();
    }
  };

  const startLot = async (groupId: string | number) => {
    const { ok } = await action.run("post", `${base}/auction/start`, { groupId: Number(groupId) });
    if (ok) {
      toast.success("Lot is up.");
      setStarting(false);
      refreshBoth();
    }
  };

  /**
   * Closing is sent by hand rather than through useAdminAction. The anti-snipe
   * refusal comes back as a number of milliseconds with no sentence attached,
   * and "wait eight more seconds" is the only useful thing to say about it.
   */
  const closeLot = async () => {
    if (closeBusy) return;
    setCloseBusy(true);
    try {
      const { data } = await api.post(`${base}/auction/close`, {});
      toast.success(`Sold to ${data?.winnerName ?? "the leading bidder"} for ${money(data?.finalPrice)}.`);
      setClosing(false);
      refreshBoth();
    } catch (err: any) {
      const said = err?.response?.data;
      const status = err?.response?.status;
      if (said?.remainingMs) {
        toast.error(`Anti-snipe active — ${Math.ceil(said.remainingMs / 1000)}s remaining.`);
      } else if (said?.message || said?.error) {
        toast.error(said.message ?? said.error);
      } else if (status === 401 || status === 403) {
        toast.error("That is not part of your access.");
      } else {
        toast.error("That did not go through.");
      }
      setClosing(false);
      refreshBoth();
    } finally {
      setCloseBusy(false);
    }
  };

  const newPrice = parseAmount(price);

  const askReprice = () => {
    if (!acting) return;
    if (newPrice == null || newPrice <= 0) {
      toast.error("Give a starting bid above zero.");
      return;
    }
    if (newPrice >= acting.calculatedPrice) {
      toast.error(`The starting bid has to be less than the calculated price, ${money(acting.calculatedPrice)}.`);
      return;
    }
    setConfirmingPrice(true);
  };

  const reprice = async () => {
    if (!acting || newPrice == null) return;
    const { ok } = await action.run(
      "post",
      `${base}/groups/${acting.id}/reprice`,
      { newStartingBid: newPrice },
      { success: `Lot ${acting.groupNumber} repriced.` }
    );
    setConfirmingPrice(false);
    if (ok) {
      setActing(null);
      refreshBoth();
    }
  };

  const setHouse = async () => {
    if (!acting) return;
    const { ok } = await action.run("post", `${base}/groups/${acting.id}/set-house`, {}, {
      success: `Lot ${acting.groupNumber} is the house's.`,
    });
    setConfirmingHouse(false);
    if (ok) {
      setActing(null);
      refreshBoth();
    }
  };

  const earlyBuy = async () => {
    if (!acting || !buyer) return;
    const { ok } = await action.run(
      "post",
      `${base}/groups/${acting.id}/early-buy`,
      { buyerId: buyer.id },
      { success: `Lot ${acting.groupNumber} sold to ${buyer.name}.` }
    );
    setBuyer(null);
    if (ok) {
      setActing(null);
      refreshBoth();
    }
  };

  if (configReq.forbidden || groupsReq.forbidden) return <NoAccess what="The Calcutta" />;

  const sold = groups.filter((g) => g.status === "SOLD" || g.status === "EARLY_BOUGHT");
  const raised = sold.reduce((s, g) => s + (g.finalPrice ?? 0), 0);
  const pending = groups.filter((g) => g.status === "PENDING");
  const nextUp = pending[0] ?? null;

  /** Only a pending lot can go up; the server refuses anything else. */
  const startable: Choice[] = pending.map((g) => ({
    key: g.id,
    label: `Lot ${g.groupNumber}`,
    hint: `${g.birdCount} birds · starts at ${money(g.startingBid)}`,
  }));

  const buyers: Choice[] = (buyersReq.data?.users ?? [])
    .filter((u) => {
      const q = buyerQuery.trim().toLowerCase();
      return !q || `${u.name ?? ""} ${u.lastName ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q);
    })
    .slice(0, 60)
    .map((u) => ({
      key: u.id,
      label: `${u.name ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unnamed",
      hint: u.email,
    }));

  const antiSnipe = config?.antiSnipeDuration ?? 10;
  const elapsed = lastBidAt != null ? Math.max(0, Math.floor((now - lastBidAt) / 1000)) : null;
  const sniping = elapsed != null && elapsed < antiSnipe;
  const topBid = activeGroup?.currentBid ?? null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "auction", label: "Auction" },
    { key: "lots", label: `Lots (${groups.length})` },
    { key: "setup", label: "Setup" },
  ];

  const who = (g: Group) => g.owner?.name ?? (g.isHouse ? "House" : null);

  return (
    <Screen
      title="Calcutta"
      subtitle={
        [name, config ? (config.phase ?? "").toLowerCase() : "not set up"].filter(Boolean).join(" · ")
      }
      onRefresh={() => {
        configReq.refresh();
        groupsReq.refresh();
      }}
      refreshing={groupsReq.refreshing}
      header={<Segments<Tab> options={tabs} value={tab} onChange={setTab} />}
    >
      {configReq.loading || groupsReq.loading ? (
        <Loading />
      ) : (
        <>
          {configReq.error ? <Notice>{configReq.error}</Notice> : null}
          {groupsReq.error && groupsReq.error !== configReq.error ? (
            <Notice>{groupsReq.error}</Notice>
          ) : null}

          {tab !== "setup" && !config ? (
            <View className="mt-4">
              <Empty>
                No Calcutta has been set up for this season.
                {mayManage ? " Start on the Setup tab." : ""}
              </Empty>
            </View>
          ) : null}

          {tab === "auction" && config ? (
            <>
              <FigureRow>
                <Figure label="Lots" value={groups.length} basis="31%" />
                <Figure label="Sold" value={sold.length} tone="text-blue-600" basis="31%" />
                <Figure label="Raised" value={money(raised)} tone="text-emerald-600" basis="31%" />
              </FigureRow>

              {config.youtubeStreamUrl ? (
                <ButtonRow>
                  <Button
                    label="Open the stream"
                    tone="secondary"
                    icon="logo-youtube"
                    onPress={() =>
                      Linking.openURL(config.youtubeStreamUrl as string).catch(() =>
                        toast.error("That stream link could not be opened.")
                      )
                    }
                    full
                  />
                </ButtonRow>
              ) : (
                <Text className="mt-3 text-xs text-slate-400">No stream URL configured.</Text>
              )}

              {activeGroup ? (
                <View className="mt-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4">
                  <Text className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    On the block now
                  </Text>
                  <Text className="mt-1 text-lg font-bold text-slate-900">
                    Lot {activeGroup.groupNumber} · {activeGroup.birdCount} birds
                  </Text>
                  <Text className="mt-1 text-2xl font-bold text-emerald-700">
                    {topBid ? money(topBid.amount) : "No bids yet"}
                  </Text>
                  <Text className="text-xs text-emerald-700">
                    {topBid
                      ? `bid by ${topBid.bidderName ?? "a bidder"}`
                      : `starts at ${money(activeGroup.startingBid)}`}
                  </Text>

                  {elapsed != null ? (
                    <View className="mt-3">
                      <Text className="text-xs text-slate-600">
                        {sniping
                          ? `Anti-snipe: ${antiSnipe - elapsed}s remaining`
                          : "Anti-snipe cleared"}
                      </Text>
                      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                        <View
                          className="h-full bg-amber-500"
                          style={{
                            width: `${Math.min(100, antiSnipe > 0 ? (elapsed / antiSnipe) * 100 : 100)}%`,
                          }}
                        />
                      </View>
                    </View>
                  ) : null}

                  {mayManage ? (
                    <>
                      <ButtonRow>
                        <Button
                          label="Close this lot"
                          tone="danger"
                          icon="hammer-outline"
                          onPress={() => setClosing(true)}
                          disabled={!topBid || sniping}
                          full
                        />
                      </ButtonRow>
                      {!topBid ? (
                        <Text className="mt-2 text-xs text-slate-600">
                          A lot with no bids cannot be closed. Reprice it or hand it to the house.
                        </Text>
                      ) : null}
                      <ButtonRow>
                        <Button
                          label="Re-price"
                          tone="secondary"
                          icon="pricetag-outline"
                          onPress={() => {
                            openLot(activeGroup);
                            setLotMode("reprice");
                          }}
                          full
                        />
                        <Button
                          label="House"
                          tone="secondary"
                          icon="home-outline"
                          // Opens the lot rather than the confirm directly: the
                          // confirm lives inside the lot's sheet, and a modal
                          // cannot be raised from one that is still sliding up.
                          onPress={() => openLot(activeGroup)}
                          full
                        />
                      </ButtonRow>
                    </>
                  ) : null}
                </View>
              ) : (
                <View className="mt-4">
                  <Empty>No lot is on the block.</Empty>
                </View>
              )}

              {mayManage && !activeGroup ? (
                <ButtonRow>
                  <Button
                    label="Put a lot up"
                    icon="play-outline"
                    onPress={() => setStarting(true)}
                    disabled={startable.length === 0}
                    full
                  />
                </ButtonRow>
              ) : null}

              {nextUp && nextUp.id !== activeGroup?.id ? (
                <Text className="mt-3 text-xs text-slate-500">
                  Next: lot {nextUp.groupNumber} ({nextUp.birdCount} birds)
                </Text>
              ) : null}

              <Text className="mt-3 text-xs text-slate-400">
                The portal lists each bid as it lands. This app only ever knows the leading one, so
                there is no running bid log here.
              </Text>
            </>
          ) : null}

          {tab === "lots" && config ? (
            <View className="mt-4">
              {groups.length === 0 ? (
                <Empty>No lots yet. Generate them on the Setup tab.</Empty>
              ) : (
                <Rows>
                  {groups.map((g) => {
                    const shown = g.finalPrice ?? g.currentBid?.amount ?? g.startingBid;
                    const settled = g.finalPrice != null;
                    return (
                      <Row
                        key={g.id}
                        title={`Lot ${g.groupNumber}`}
                        subtitle={
                          [
                            `${g.birdCount} birds`,
                            `calc ${money(g.calculatedPrice)}`,
                            who(g) ?? g.currentBid?.bidderName ?? null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                        right={money(shown)}
                        rightSub={settled ? "final" : g.currentBid ? "leading bid" : "start bid"}
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
                        onPress={() => openLot(g)}
                      />
                    );
                  })}
                </Rows>
              )}
            </View>
          ) : null}

          {tab === "setup" ? (
            mayManage ? (
              <>
                <Field
                  label="Price per bird ($)"
                  value={setup.pricePerBird}
                  onChange={(v) => setSetup({ ...setup, pricePerBird: v })}
                  keyboard="decimal-pad"
                />
                <Field
                  label="Target group size"
                  value={setup.targetGroupSize}
                  onChange={(v) => setSetup({ ...setup, targetGroupSize: v })}
                  keyboard="numeric"
                />
                <Field
                  label="Bidding duration (seconds)"
                  value={setup.biddingDuration}
                  onChange={(v) => setSetup({ ...setup, biddingDuration: v })}
                  keyboard="numeric"
                />
                <Field
                  label="Anti-snipe duration (seconds)"
                  value={setup.antiSnipeDuration}
                  onChange={(v) => setSetup({ ...setup, antiSnipeDuration: v })}
                  keyboard="numeric"
                />
                <Field
                  label="Bid raise options (comma-separated)"
                  value={setup.bidRaiseOptions}
                  onChange={(v) => setSetup({ ...setup, bidRaiseOptions: v })}
                  placeholder="10,50,100,500"
                />
                <Field
                  label="YouTube stream URL (optional)"
                  value={setup.youtubeStreamUrl}
                  onChange={(v) => setSetup({ ...setup, youtubeStreamUrl: v })}
                  placeholder="https://youtube.com/embed/..."
                />
                {!config ? (
                  <Notice>
                    Saving this for the first time also switches the event&apos;s race format to
                    Calcutta.
                  </Notice>
                ) : null}
                <ButtonRow>
                  <Button
                    label="Save config"
                    onPress={saveSetup}
                    pending={action.pending && !generating}
                    full
                  />
                  <Button
                    label="Generate groups"
                    tone="secondary"
                    icon="albums-outline"
                    onPress={() => setGenerating(true)}
                    disabled={!config}
                    full
                  />
                </ButtonRow>
              </>
            ) : config ? (
              <View className="mt-4">
                <Rows>
                  <Line label="Price per bird" value={money(config.pricePerBird)} />
                  <Line label="Target group size" value={String(config.targetGroupSize)} />
                  <Line label="Bidding duration" value={`${config.biddingDuration}s`} />
                  <Line label="Anti-snipe duration" value={`${config.antiSnipeDuration}s`} />
                  <Line
                    label="Bid raise options"
                    value={(config.bidRaiseOptions ?? []).join(", ") || "—"}
                  />
                  <Line label="Stream" value={config.youtubeStreamUrl ? "set" : "none"} />
                </Rows>
              </View>
            ) : (
              <View className="mt-4">
                <Empty>No Calcutta has been set up for this season.</Empty>
              </View>
            )
          ) : null}
        </>
      )}

      {/* One lot: who is in it, and what can still be done with it. */}
      <Sheet
        open={acting != null}
        onClose={() => setActing(null)}
        title={
          lotMode === "reprice"
            ? `Re-price lot ${acting?.groupNumber ?? ""}`
            : lotMode === "buyer"
              ? `Early sell lot ${acting?.groupNumber ?? ""}`
              : `Lot ${acting?.groupNumber ?? ""}`
        }
        subtitle={
          lotMode === "buyer"
            ? `Outright at ${money(acting?.calculatedPrice)} — it never goes to the block`
            : `${acting?.birdCount ?? 0} birds · calculated ${money(
                acting?.calculatedPrice
              )} · start bid ${money(acting?.startingBid)}`
        }
      >
        {lotMode === "home" && acting ? (
          <>
            <View className="mt-3">
              <Rows>
                <Line label="Status" value={acting.status.replace(/_/g, " ").toLowerCase()} />
                <Line label="Owner" value={who(acting) ?? "—"} />
                {acting.currentBid ? (
                  <Line
                    label={`Leading bid · ${acting.currentBid.bidderName ?? "a bidder"}`}
                    value={money(acting.currentBid.amount)}
                  />
                ) : null}
                {acting.finalPrice != null ? (
                  <Line label="Final price" value={money(acting.finalPrice)} tone="text-blue-600" />
                ) : null}
              </Rows>
            </View>

            {mayManage && (acting.status === "PENDING" || acting.status === "BIDDING") ? (
              <View className="mt-3" style={{ gap: 8 }}>
                {acting.status === "PENDING" ? (
                  <Button
                    label="Early sell"
                    tone="secondary"
                    icon="person-outline"
                    onPress={() => setLotMode("buyer")}
                  />
                ) : null}
                <Button
                  label="Re-price"
                  tone="secondary"
                  icon="pricetag-outline"
                  onPress={() => {
                    setPrice(String(acting.startingBid));
                    setLotMode("reprice");
                  }}
                />
                <Button
                  label="House"
                  tone="secondary"
                  icon="home-outline"
                  onPress={() => setConfirmingHouse(true)}
                />
              </View>
            ) : null}

            <Caption>Lofts in this lot ({acting.members?.length ?? 0})</Caption>
            {(acting.members ?? []).length === 0 ? (
              <Empty>No approved registrations are in this lot.</Empty>
            ) : (
              <Rows>
                {(acting.members ?? []).map((m) => (
                  <Row key={m.eventInventoryId} title={fullName(m.breeder)} />
                ))}
              </Rows>
            )}
          </>
        ) : null}

        {lotMode === "reprice" && acting ? (
          <>
            <Field
              label="New starting bid ($)"
              value={price}
              onChange={setPrice}
              keyboard="decimal-pad"
              autoFocus
              hint={`It was ${money(acting.startingBid)}. It has to be less than the calculated price, ${money(
                acting.calculatedPrice
              )}.`}
            />
            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setLotMode("home")} full />
              <Button label="Re-price" onPress={askReprice} full />
            </ButtonRow>
          </>
        ) : null}

        {lotMode === "buyer" && acting ? (
          <>
            <View className="mt-2">
              <SearchBar value={buyerQuery} onChange={setBuyerQuery} placeholder="Name or email" />
            </View>
            {buyersReq.loading ? (
              <Loading />
            ) : buyersReq.forbidden || buyersReq.error ? (
              <>
                <Notice>
                  The account list is not available to this sign-in, so the buyer has to be given
                  by user ID, as the portal asks for it.
                </Notice>
                <Field label="Buyer user ID" value={buyerId} onChange={setBuyerId} />
                <ButtonRow>
                  <Button
                    label="Use this ID"
                    onPress={() => setBuyer({ id: buyerId.trim(), name: `user ${buyerId.trim()}` })}
                    disabled={!buyerId.trim()}
                    full
                  />
                </ButtonRow>
              </>
            ) : (
              <ChoiceList
                choices={buyers}
                onPick={(key) => {
                  const found = buyers.find((b) => b.key === key);
                  if (found) setBuyer({ id: String(key), name: found.label });
                }}
                empty={buyerQuery ? "Nobody matches that." : "No accounts to sell to."}
              />
            )}
            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setLotMode("home")} full />
            </ButtonRow>
          </>
        ) : null}

        <Confirm
          open={buyer != null}
          title={`Sell lot ${acting?.groupNumber ?? ""} for ${money(acting?.calculatedPrice)}?`}
          body={`${buyer?.name ?? "The buyer"} takes lot ${acting?.groupNumber ?? ""} outright at the calculated price, ${money(
            acting?.calculatedPrice
          )}. It does not go to the block, and this cannot be undone from here.`}
          confirmLabel="Confirm early buy"
          pending={action.pending}
          onConfirm={earlyBuy}
          onCancel={() => setBuyer(null)}
        />

        <Confirm
          open={confirmingPrice}
          title={`Start lot ${acting?.groupNumber ?? ""} at ${money(newPrice ?? 0)}?`}
          body={
            acting?.currentBid || acting?.status === "BIDDING"
              ? `The starting bid drops from ${money(acting?.startingBid)} to ${money(
                  newPrice ?? 0
                )}. Every bid already placed on this lot is thrown away${
                  acting?.currentBid ? `, including the leading ${money(acting.currentBid.amount)}` : ""
                }, and the lot goes back to pending.`
              : `The starting bid changes from ${money(acting?.startingBid)} to ${money(newPrice ?? 0)}.`
          }
          confirmLabel="Re-price"
          tone={acting?.currentBid ? "danger" : "primary"}
          pending={action.pending}
          onConfirm={reprice}
          onCancel={() => setConfirmingPrice(false)}
        />

        <Confirm
          open={confirmingHouse}
          title={`Mark lot ${acting?.groupNumber ?? ""} as House?`}
          body={`Lot ${acting?.groupNumber ?? ""} will be marked as House, with no external owner${
            acting?.currentBid
              ? `. The leading bid of ${money(acting.currentBid.amount)} is not accepted`
              : ""
          }. It cannot be put back up from here.`}
          confirmLabel="Mark as House"
          pending={action.pending}
          onConfirm={setHouse}
          onCancel={() => setConfirmingHouse(false)}
        />
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
          empty="No lot is pending."
        />
      </Sheet>

      <Confirm
        open={closing}
        title={`Close lot ${activeGroup?.groupNumber ?? ""} at ${money(topBid?.amount ?? 0)}?`}
        body={`It sells to ${topBid?.bidderName ?? "the leading bidder"} for ${money(
          topBid?.amount ?? 0
        )}, or for whatever the leading bid is by the time this lands. Check that against the room — this screen polls, so it can be a beat behind.`}
        confirmLabel="Close it"
        pending={closeBusy}
        onConfirm={closeLot}
        onCancel={() => setClosing(false)}
      />

      <Confirm
        open={generating}
        title="Regenerate groups?"
        body="This deletes every pending lot and cuts the registered lofts into lots again at the configured size and price. Lots already sold, sold early or handed to the house are kept."
        confirmLabel="Generate"
        pending={action.pending}
        onConfirm={generate}
        onCancel={() => setGenerating(false)}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
