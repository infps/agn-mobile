import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Confirm,
  Empty,
  Loading,
  Notice,
  Row,
  Rows,
  SearchBar,
  Sheet,
  money,
} from "@/components/admin/ui";
import { Caption, fullName } from "@/components/admin/MoneyBits";

type Category = "BELGIAN" | "STANDARD" | "WTA";

/** A pool the season's betting scheme actually prices — a tier at zero is not offered. */
interface Pool {
  category: Category;
  tierIndex: number;
  amount: number;
}

interface PlacedBet {
  category: string;
  tierIndex: number;
  bettorId: string;
  stakePaid: boolean;
}

interface Bird {
  raceItemId: number;
  band: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  bets: PlacedBet[];
}

interface BetBoard {
  birds?: Bird[];
  pools?: Pool[];
  bettingOpen?: boolean;
  raceStatus?: string;
}

interface Breeder {
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface Selection {
  raceItemId: number;
  band: string;
  category: Category;
  tierIndex: number;
  amount: number;
}

type Mode = "slip" | "pools" | "payer";

export const POOL_LABEL: Record<string, string> = {
  BELGIAN: "Belgian",
  STANDARD: "Standard",
  WTA: "WTA",
};

export const poolName = (p: { category: string; tierIndex: number }) =>
  `${POOL_LABEL[p.category] ?? p.category} #${p.tierIndex}`;

/**
 * Taking a cash bet at the rail.
 *
 * The portal does this on a grid — every bird down the side, every pool across
 * the top. A phone cannot show that grid, so it is walked instead: pick a bird,
 * then tick the pools it goes into. The order is the portal's, though: the bets
 * are chosen first and the person paying is named last, because one person
 * usually backs three or four birds and then hands over a single amount.
 *
 * The pools and their stakes come from the same board the portal reads, so the
 * price shown is the price the server will charge, and a pool a bird is already
 * in is shown as taken rather than being offered and then refused.
 *
 * Nothing is sent until the slip is complete. The endpoint takes the whole slip
 * at once and records one cash payment for the lot — sending each bet on its
 * own would leave a half-placed set, and two payments, when the fourth is
 * refused. Because that payment is recorded as already paid, the total is read
 * back before it goes.
 */
export function CashBetSheet({
  open,
  onClose,
  raceId,
  raceName,
  onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  raceName: string;
  onPlaced: () => void;
}) {
  const toast = useToast();
  const action = useAdminAction();

  const [mode, setMode] = useState<Mode>("slip");
  const [birdQuery, setBirdQuery] = useState("");
  const [payerQuery, setPayerQuery] = useState("");
  const [picking, setPicking] = useState<Bird | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [payer, setPayer] = useState<{ userId: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const boardReq = useAdminData<BetBoard>(open && raceId ? `/breeder/race/${raceId}/bet` : null, [
    open,
    raceId,
  ]);
  // Only when somebody gets as far as naming who is paying.
  const breedersReq = useAdminData<{ breeders?: Breeder[] }>(
    open && mode === "payer" ? "/admin/breeders" : null,
    [open, mode]
  );

  const reset = () => {
    setMode("slip");
    setBirdQuery("");
    setPayerQuery("");
    setPicking(null);
    setSelections([]);
    setPayer(null);
    setConfirming(false);
  };

  // A slip never survives into another race.
  useEffect(() => {
    if (open) reset();
  }, [open, raceId]);

  const birds = useMemo(() => boardReq.data?.birds ?? [], [boardReq.data]);
  const pools = useMemo(() => boardReq.data?.pools ?? [], [boardReq.data]);
  const raceStatus = boardReq.data?.raceStatus ?? "";
  const registering = raceStatus === "REGISTERING";

  const total = selections.reduce((s, x) => s + x.amount, 0);
  const staged = (raceItemId: number, p: Pool) =>
    selections.some(
      (s) => s.raceItemId === raceItemId && s.category === p.category && s.tierIndex === p.tierIndex
    );

  const birdChoices: Choice[] = useMemo(() => {
    const q = birdQuery.trim().toLowerCase();
    const matched = q
      ? birds.filter((b) => `${b.band ?? ""} ${b.ownerName ?? ""}`.toLowerCase().includes(q))
      : birds;
    return matched.map((b) => {
      const mine = selections.filter((s) => s.raceItemId === b.raceItemId).length;
      const free = pools.length - b.bets.length;
      return {
        key: b.raceItemId,
        label: b.band ?? `Entry ${b.raceItemId}`,
        hint: [
          b.ownerName,
          mine > 0 ? `${mine} on the slip` : null,
          b.bets.length > 0 ? `${b.bets.length} pool${b.bets.length === 1 ? "" : "s"} taken` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        disabled: free <= 0,
        disabledReason: "every pool is taken",
      };
    });
  }, [birds, birdQuery, selections, pools.length]);

  // Any breeder with a linked account can be the one paying, as in the portal.
  const payerChoices: Choice[] = useMemo(() => {
    const q = payerQuery.trim().toLowerCase();
    const all = (breedersReq.data?.breeders ?? []).filter((b) => !!b.userId);
    const matched = q
      ? all.filter((b) => `${fullName(b, "")} ${b.email ?? ""}`.toLowerCase().includes(q))
      : all;
    return matched.slice(0, 60).map((b) => ({
      key: b.userId as string,
      label: fullName(b, b.email || (b.userId as string)),
      hint: b.email,
    }));
  }, [breedersReq.data, payerQuery]);

  const togglePool = (p: Pool) => {
    if (!picking) return;
    const band = picking.band ?? `Entry ${picking.raceItemId}`;
    setSelections((prev) =>
      staged(picking.raceItemId, p)
        ? prev.filter(
            (s) =>
              !(
                s.raceItemId === picking.raceItemId &&
                s.category === p.category &&
                s.tierIndex === p.tierIndex
              )
          )
        : [
            ...prev,
            {
              raceItemId: picking.raceItemId,
              band,
              category: p.category,
              tierIndex: p.tierIndex,
              amount: p.amount,
            },
          ]
    );
  };

  const place = async () => {
    if (!payer || selections.length === 0) return;
    const { ok, data } = await action.run<{ betsCreated?: number; totalPaid?: number }>(
      "post",
      `/admin/race/${raceId}/betting/place-cash-bet`,
      {
        bettorUserId: payer.userId,
        selections: selections.map((s) => ({
          raceItemId: s.raceItemId,
          category: s.category,
          tierIndex: s.tierIndex,
        })),
      }
    );
    setConfirming(false);
    if (ok) {
      const made = data?.betsCreated ?? selections.length;
      toast.success(
        `Cash bets registered — ${made} bet${made === 1 ? "" : "s"}, ${money(data?.totalPaid ?? total)}.`
      );
      reset();
      onClose();
      onPlaced();
    } else {
      // A refusal usually means somebody else took a pool in the meantime.
      boardReq.reload();
    }
  };

  const title =
    mode === "pools"
      ? (picking?.band ?? "Bird")
      : mode === "payer"
        ? "Who is paying cash?"
        : "Take a cash bet";

  const subtitle =
    mode === "pools"
      ? `${picking?.ownerName ?? "No owner on record"} — tick the pools to enter`
      : mode === "payer"
        ? `${selections.length} bet${selections.length === 1 ? "" : "s"} · ${money(total)}`
        : selections.length === 0
          ? `On ${raceName} — pick the bets first, then who pays`
          : `${selections.length} staged · ${money(total)} — nothing is placed until you register it`;

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      {boardReq.loading ? (
        <Loading />
      ) : boardReq.forbidden ? (
        <Notice>
          The list of birds and pools for this race is only given to admin accounts, so a cash bet
          cannot be taken from this sign-in.
        </Notice>
      ) : boardReq.error ? (
        <Notice>{boardReq.error}</Notice>
      ) : !registering ? (
        <Notice>
          This race is {raceStatus ? raceStatus.toLowerCase() : "not open"} — cash bets can only be
          taken while a race is still registering.
        </Notice>
      ) : birds.length === 0 ? (
        <Empty>No birds are in this race yet.</Empty>
      ) : pools.length === 0 ? (
        <Notice>
          This season has no betting scheme, or the scheme prices no pool tiers, so there is
          nothing to bet into.
        </Notice>
      ) : mode === "slip" ? (
        <>
          {selections.length > 0 ? (
            <>
              <Caption>The slip</Caption>
              <Rows>
                {selections.map((s, i) => (
                  <Row
                    key={`${s.raceItemId}-${s.category}-${s.tierIndex}`}
                    title={s.band}
                    subtitle={poolName(s)}
                    right={money(s.amount)}
                    rightSub="remove"
                    onPress={() => setSelections((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </Rows>
              <ButtonRow>
                <Button label="Clear" tone="secondary" onPress={() => setSelections([])} full />
                <Button
                  label={`Who pays — ${money(total)}`}
                  icon="person-outline"
                  onPress={() => {
                    setPayerQuery("");
                    setMode("payer");
                  }}
                  full
                />
              </ButtonRow>
            </>
          ) : null}

          <Caption>Add a bird</Caption>
          <SearchBar value={birdQuery} onChange={setBirdQuery} placeholder="Band or owner" />
          <ChoiceList
            choices={birdChoices}
            onPick={(k) => {
              const found = birds.find((b) => b.raceItemId === Number(k));
              if (found) {
                setPicking(found);
                setMode("pools");
              }
            }}
            empty="No birds match your search."
          />
        </>
      ) : mode === "pools" && picking ? (
        <>
          <View className="mt-2">
            <Rows>
              {pools.map((p) => {
                const taken = picking.bets.find(
                  (b) => b.category === p.category && b.tierIndex === p.tierIndex
                );
                const on = staged(picking.raceItemId, p);
                // The portal colours a taken cell by who holds it and whether
                // the stake has cleared; here that is said in words.
                const holder = taken
                  ? `${
                      picking.ownerUserId != null && taken.bettorId === picking.ownerUserId
                        ? "taken by the owner"
                        : "taken by another bettor"
                    } · stake ${taken.stakePaid ? "paid" : "not paid"}`
                  : null;
                return (
                  <Row
                    key={`${p.category}-${p.tierIndex}`}
                    title={poolName(p)}
                    subtitle={holder ?? (on ? "on the slip — tap to take it off" : "tap to add")}
                    right={money(p.amount)}
                    rightTone={taken ? "text-slate-400" : on ? "text-emerald-600" : "text-slate-900"}
                    badge={
                      taken
                        ? { label: "taken", bg: "bg-slate-200", text: "text-slate-600" }
                        : on
                          ? { label: "added", bg: "bg-emerald-100", text: "text-emerald-700" }
                          : null
                    }
                    onPress={taken ? undefined : () => togglePool(p)}
                  />
                );
              })}
            </Rows>
          </View>
          <ButtonRow>
            <Button
              label="Done with this bird"
              onPress={() => {
                setPicking(null);
                setBirdQuery("");
                setMode("slip");
              }}
              full
            />
          </ButtonRow>
        </>
      ) : (
        <>
          {payer ? (
            <>
              <View className="mt-3">
                <Rows>
                  <Row
                    title={payer.name}
                    subtitle="Paying cash for this slip"
                    right="change"
                    onPress={() => setPayer(null)}
                  />
                </Rows>
              </View>
              <Text className="mt-2 text-xs text-slate-400">
                {selections.map((s) => `${s.band} ${poolName(s)}`).join(", ")}
              </Text>
            </>
          ) : (
            <>
              <View className="mt-2">
                <SearchBar
                  value={payerQuery}
                  onChange={setPayerQuery}
                  placeholder="Search breeder or bettor"
                />
              </View>
              {breedersReq.loading ? (
                <Loading />
              ) : breedersReq.forbidden ? (
                <Notice>
                  The person paying is picked from the breeder list, and breeder access has not
                  been given to you.
                </Notice>
              ) : breedersReq.error ? (
                <Notice>{breedersReq.error}</Notice>
              ) : (
                <ChoiceList
                  choices={payerChoices}
                  onPick={(k) => {
                    const found = payerChoices.find((c) => c.key === k);
                    if (found) setPayer({ userId: String(k), name: found.label });
                  }}
                  empty={
                    payerQuery
                      ? "No match."
                      : "No breeder has an account to bet under."
                  }
                />
              )}
            </>
          )}
          <ButtonRow>
            <Button label="Back to the slip" tone="secondary" onPress={() => setMode("slip")} full />
            <Button
              label={`Register — ${money(total)}`}
              icon="cash-outline"
              onPress={() => setConfirming(true)}
              disabled={!payer || selections.length === 0}
              full
            />
          </ButtonRow>
        </>
      )}

      <Confirm
        open={confirming}
        title={`Register ${money(total)} in cash?`}
        body={`${selections.length} bet${selections.length === 1 ? "" : "s"} on ${raceName} are placed for ${
          payer?.name ?? "this bettor"
        }, and ${money(total)} is recorded as cash already received from them. Only do this with the money in hand.`}
        confirmLabel="Register"
        tone="success"
        pending={action.pending}
        onConfirm={place}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}
