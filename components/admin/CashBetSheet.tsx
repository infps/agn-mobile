import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Empty,
  Loading,
  Notice,
  Row,
  Rows,
  SearchBar,
  Sheet,
} from "@/components/admin/ui";

interface Bettor {
  id: string;
  name: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
}

interface RaceItem {
  id: number;
  bird?: {
    band?: string | null;
    birdName?: string | null;
    breeder?: { firstName?: string | null; lastName?: string | null } | null;
  };
}

type Category = "BELGIAN" | "STANDARD" | "WTA";

/** How many tiers each pool shape has, per the server's own bounds. */
const TIERS: Record<Category, number> = { BELGIAN: 7, STANDARD: 6, WTA: 5 };

const CATEGORIES: { key: Category; label: string; hint: string }[] = [
  { key: "BELGIAN", label: "Belgian", hint: "Seven tiers" },
  { key: "STANDARD", label: "Standard", hint: "Six tiers" },
  { key: "WTA", label: "Winner takes all", hint: "Five tiers" },
];

interface Selection {
  raceItemId: number;
  band: string;
  category: Category;
  tierIndex: number;
}

/**
 * Taking a cash bet at the rail.
 *
 * Four things have to agree for a bet to exist — who is betting, on which bird,
 * in which pool, at which tier — and they are asked in that order because that
 * is the order somebody says them out loud. A name, then a bird, then "Belgian
 * three".
 *
 * Several bets are staged before anything is sent. One person usually backs
 * three or four birds in one go, and sending each as its own request means a
 * half-placed set when the fourth is refused — the endpoint takes them together
 * and prices them together, so this does too.
 *
 * Stake amounts are not shown, and deliberately. They live on the season's
 * betting scheme, which this app has no honest way to read; guessing one and
 * displaying it would be worse than showing none, because somebody would repeat
 * it to the person paying. The server prices the bet and says so if a tier has
 * no amount set.
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

  const [bettor, setBettor] = useState<Bettor | null>(null);
  const [query, setQuery] = useState("");
  const [birdQuery, setBirdQuery] = useState("");
  const [picking, setPicking] = useState<RaceItem | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);

  const bettorsReq = useAdminData<{ users?: Bettor[] }>(open ? "/admin/users" : null, [open]);
  const itemsReq = useAdminData<{ raceItems?: RaceItem[] }>(
    open && bettor ? `/admin/race-item?raceId=${raceId}` : null,
    [open, bettor?.id, raceId]
  );

  const who = (b: Bettor) =>
    `${b.name ?? ""} ${b.lastName ?? ""}`.trim() || b.email || "Unnamed";

  const bettorChoices: Choice[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = bettorsReq.data?.users ?? [];
    const matched = q
      ? all.filter((b) => `${who(b)} ${b.email ?? ""}`.toLowerCase().includes(q))
      : all;
    return matched.slice(0, 40).map((b) => ({
      key: b.id,
      label: who(b),
      hint: b.role === "BETTOR" ? "bettor account" : b.email,
    }));
  }, [bettorsReq.data, query]);

  const birdChoices: Choice[] = useMemo(() => {
    const q = birdQuery.trim().toLowerCase();
    const all = itemsReq.data?.raceItems ?? [];
    const taken = new Set(selections.map((s) => `${s.raceItemId}`));
    const matched = q
      ? all.filter((i) => {
          const owner = `${i.bird?.breeder?.firstName ?? ""} ${i.bird?.breeder?.lastName ?? ""}`;
          return `${i.bird?.band ?? ""} ${i.bird?.birdName ?? ""} ${owner}`
            .toLowerCase()
            .includes(q);
        })
      : all;
    return matched.slice(0, 60).map((i) => ({
      key: i.id,
      label: i.bird?.band ?? `Entry ${i.id}`,
      hint:
        `${i.bird?.breeder?.firstName ?? ""} ${i.bird?.breeder?.lastName ?? ""}`.trim() ||
        i.bird?.birdName ||
        null,
      // A bird can be backed in more than one pool, so this only marks the ones
      // already staged rather than blocking them.
      disabled: false,
      disabledReason: taken.has(String(i.id)) ? "already staged" : null,
    }));
  }, [itemsReq.data, birdQuery, selections]);

  const addSelection = (tierIndex: number) => {
    if (!picking || !category) return;
    const band = picking.bird?.band ?? `Entry ${picking.id}`;
    const duplicate = selections.some(
      (s) => s.raceItemId === picking.id && s.category === category && s.tierIndex === tierIndex
    );
    if (duplicate) {
      toast.error(`${band} is already in ${category.toLowerCase()} tier ${tierIndex}.`);
      return;
    }
    setSelections((prev) => [...prev, { raceItemId: picking.id, band, category, tierIndex }]);
    setPicking(null);
    setCategory(null);
    setBirdQuery("");
  };

  const place = async () => {
    if (!bettor || selections.length === 0) return;
    const { ok } = await action.run(
      "post",
      `/admin/race/${raceId}/betting/place-cash-bet`,
      {
        bettorUserId: bettor.id,
        selections: selections.map((s) => ({
          raceItemId: s.raceItemId,
          category: s.category,
          tierIndex: s.tierIndex,
        })),
      },
      { success: `${selections.length} bet${selections.length === 1 ? "" : "s"} registered.` }
    );
    if (ok) {
      reset();
      onClose();
      onPlaced();
    }
  };

  const reset = () => {
    setBettor(null);
    setSelections([]);
    setPicking(null);
    setCategory(null);
    setQuery("");
    setBirdQuery("");
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <>
      {/* Step one: whose bet is this. */}
      <Sheet
        open={open && bettor == null}
        onClose={close}
        title="Take a cash bet"
        subtitle={`On ${raceName} — who is betting?`}
      >
        <View className="mt-2">
          <SearchBar value={query} onChange={setQuery} placeholder="Name or email" />
        </View>
        {bettorsReq.loading ? (
          <Loading />
        ) : (
          <ChoiceList
            choices={bettorChoices}
            onPick={(k) => {
              const found = (bettorsReq.data?.users ?? []).find((b) => b.id === k);
              if (found) setBettor(found);
            }}
            empty={query ? "Nobody matches that." : "No accounts to bet for."}
          />
        )}
      </Sheet>

      {/* Step two: the running slip. */}
      <Sheet
        open={open && bettor != null && picking == null}
        onClose={close}
        title={bettor ? who(bettor) : "Cash bet"}
        subtitle={
          selections.length === 0
            ? "Nothing staged yet"
            : `${selections.length} staged — nothing is placed until you send it`
        }
      >
        {selections.length > 0 ? (
          <View className="mt-2">
            <Rows>
              {selections.map((s, i) => (
                <Row
                  key={`${s.raceItemId}-${s.category}-${s.tierIndex}-${i}`}
                  title={s.band}
                  subtitle={`${s.category.toLowerCase()} · tier ${s.tierIndex}`}
                  right="remove"
                  rightTone="text-rose-600"
                  onPress={() => setSelections((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
            </Rows>
          </View>
        ) : null}

        <Notice>
          The stake comes from this season&apos;s betting scheme. It is priced when the bet is
          sent, and refused if the tier has no amount set.
        </Notice>

        <Text className="mb-1 mt-4 text-xs font-medium text-slate-600">Add a bird</Text>
        <View>
          <SearchBar value={birdQuery} onChange={setBirdQuery} placeholder="Band or breeder" />
        </View>
        {itemsReq.loading ? (
          <Loading />
        ) : birdChoices.length === 0 ? (
          <Empty>{birdQuery ? "No bird matches that." : "This race has no entries."}</Empty>
        ) : (
          <ChoiceList
            choices={birdChoices}
            onPick={(k) => {
              const found = (itemsReq.data?.raceItems ?? []).find((i) => i.id === Number(k));
              if (found) {
                setPicking(found);
                setCategory(null);
              }
            }}
          />
        )}

        <ButtonRow>
          <Button label="Start over" tone="secondary" onPress={reset} full />
          <Button
            label="Place bets"
            onPress={place}
            pending={action.pending}
            disabled={selections.length === 0}
            full
          />
        </ButtonRow>
      </Sheet>

      {/* Step three: which pool, which tier. */}
      <Sheet
        open={picking != null}
        onClose={() => {
          setPicking(null);
          setCategory(null);
        }}
        title={picking?.bird?.band ?? "Bird"}
        subtitle={category ? "Which tier?" : "Which pool?"}
      >
        {category == null ? (
          <ChoiceList
            choices={CATEGORIES.map((c) => ({ key: c.key, label: c.label, hint: c.hint }))}
            onPick={(k) => setCategory(k as Category)}
          />
        ) : (
          <>
            <ChoiceList
              choices={Array.from({ length: TIERS[category] }, (_, i) => ({
                key: i + 1,
                label: `Tier ${i + 1}`,
              }))}
              onPick={(k) => addSelection(Number(k))}
            />
            <ButtonRow>
              <Button
                label="Back to pools"
                tone="secondary"
                onPress={() => setCategory(null)}
                full
              />
            </ButtonRow>
          </>
        )}
      </Sheet>
    </>
  );
}
