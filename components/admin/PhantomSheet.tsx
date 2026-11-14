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
  Field,
  Loading,
  Notice,
  Row,
  Rows,
  SearchBar,
  Sheet,
} from "@/components/admin/ui";
import {
  type AdminRaceItem,
  bandOf,
  breederOf,
  CheckRow,
  Pills,
} from "@/components/admin/raceParts";

type Band = {
  band1: string | null;
  band2: string | null;
  band3: string | null;
  band4: string | null;
};

interface Phantom {
  id: number;
  rfid: string | null;
  arrivalTime: string | null;
  /** Set once the read has been matched; an unmatched read has none. */
  birdId: number | null;
  bird?: (Band & { id: number }) | null;
}

interface Ignored {
  id: number;
  inventoryItemId: number | null;
  note: string | null;
  inventoryItem?: {
    id: number;
    bird?: (Band & { id: number; birdName: string | null }) | null;
  } | null;
}

const joinBand = (b?: Band | null) =>
  b ? [b.band1, b.band2, b.band3, b.band4].filter(Boolean).join("-") : "";

/**
 * Race-day corrections: tags nobody could match, and birds left out of the
 * result.
 *
 * The first is the failure mode of the whole scanning arrangement, and the one
 * that is invisible until somebody's bird is missing from the result. A tag
 * that reads cleanly but belongs to no registered bird is recorded as a phantom
 * rather than dropped, and this is where it gets a name put to it.
 *
 * Resolving one is two decisions, not one, which is why they are separate
 * switches: whether to attach the tag to that bird permanently, and whether to
 * count this read as the bird's arrival. A tag swapped between birds mid-season
 * wants the first without the second; a bird clocked on a spare reader wants
 * both.
 *
 * The second is the "it didn't really fly" list — a bird that went back to the
 * loft or was scanned in error. Neither change moves the leaderboard on its
 * own. The server says so in its reply, and that reply is what gets shown: the
 * positions shift only when the race is recalculated, which is a separate,
 * previewed step on the race screen.
 */
export function PhantomSheet({
  open,
  onClose,
  raceId,
  items,
  onResolved,
  canManage = true,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  /** The race's own entries — a phantom belongs to one of them or to nobody. */
  items: AdminRaceItem[];
  onResolved: () => void;
  /** Reading these needs races.view; changing them needs races.manage. */
  canManage?: boolean;
}) {
  const action = useAdminAction();
  const toast = useToast();
  const [tab, setTab] = useState<"tags" | "excluded">("tags");
  const [picking, setPicking] = useState<Phantom | null>(null);
  const [excluding, setExcluding] = useState(false);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [linkRfid, setLinkRfid] = useState(true);
  const [recordArrival, setRecordArrival] = useState(true);

  const phantomsReq = useAdminData<{ phantoms?: Phantom[] }>(
    open ? `/admin/race/${raceId}/phantoms` : null,
    [open, raceId]
  );
  const ignoredReq = useAdminData<{ ignored?: Ignored[] }>(
    open ? `/admin/race/${raceId}/ignore-birds` : null,
    [open, raceId]
  );

  const phantoms = useMemo(
    () => (phantomsReq.data?.phantoms ?? []).filter((p) => p.birdId == null),
    [phantomsReq.data]
  );
  const ignored = useMemo(() => ignoredReq.data?.ignored ?? [], [ignoredReq.data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? items.filter((i) =>
          `${i.bird?.band ?? ""} ${bandOf(i)} ${i.bird?.birdName ?? ""} ${breederOf(i)}`
            .toLowerCase()
            .includes(q)
        )
      : items;
    return pool;
  }, [items, query]);

  const birdChoices: Choice[] = useMemo(
    () =>
      matches
        .filter((i) => i.bird?.id != null)
        .slice(0, 40)
        .map((i) => ({
          key: i.bird!.id!,
          label: bandOf(i),
          hint: breederOf(i) || i.bird?.birdName || null,
        })),
    [matches]
  );

  const excludeChoices: Choice[] = useMemo(() => {
    const out = new Set(ignored.map((i) => i.inventoryItemId));
    return matches
      .filter((i) => i.inventoryItemId != null && i.bird != null && !out.has(i.inventoryItemId))
      .slice(0, 40)
      .map((i) => ({
        key: i.inventoryItemId!,
        label: bandOf(i),
        hint: breederOf(i) || i.bird?.birdName || null,
      }));
  }, [matches, ignored]);

  /** The server's own sentence, because it says whether a recalculation is owed. */
  const done = (said: { message?: string } | null, fallback: string) => {
    toast.success(said?.message ?? fallback);
    phantomsReq.reload();
    ignoredReq.reload();
    onResolved();
  };

  const resolve = async (birdId: string | number) => {
    if (!picking) return;
    const { ok, data } = await action.run<{ message?: string }>(
      "post",
      `/admin/race/${raceId}/phantoms/${picking.id}`,
      { birdId: Number(birdId), linkRfid, recordArrival }
    );
    if (ok) {
      setPicking(null);
      setQuery("");
      done(data, "Scan matched.");
    }
  };

  const drop = async (phantom: Phantom) => {
    const { ok, data } = await action.run<{ message?: string }>(
      "delete",
      `/admin/race/${raceId}/phantoms/${phantom.id}`
    );
    if (ok) done(data, "Scan dismissed.");
  };

  const exclude = async (inventoryItemId: string | number) => {
    const { ok, data } = await action.run<{ message?: string }>(
      "post",
      `/admin/race/${raceId}/ignore-birds`,
      { inventoryItemId: Number(inventoryItemId), ...(note.trim() ? { note: note.trim() } : {}) }
    );
    if (ok) {
      setExcluding(false);
      setNote("");
      setQuery("");
      done(data, "Bird excluded from results.");
    }
  };

  const reinclude = async (inventoryItemId: number) => {
    const { ok, data } = await action.run<{ message?: string }>(
      "delete",
      `/admin/race/${raceId}/ignore-birds?inventoryItemId=${inventoryItemId}`
    );
    if (ok) done(data, "Bird re-included.");
  };

  const loading = tab === "tags" ? phantomsReq.loading : ignoredReq.loading;
  const error = tab === "tags" ? phantomsReq.error : ignoredReq.error;

  return (
    <>
      <Sheet
        open={open && picking == null && !excluding}
        onClose={onClose}
        title="Race corrections"
        subtitle="Neither changes the leaderboard until the race is recalculated"
      >
        <View className="mt-2">
          <Pills
            wrap
            pills={[
              { key: "tags", label: "Unmatched tags", lead: phantoms.length },
              { key: "excluded", label: "Excluded birds", lead: ignored.length },
            ]}
            isOn={(k) => k === tab}
            onPress={(k) => setTab(k as "tags" | "excluded")}
          />
        </View>

        {loading ? (
          <Loading />
        ) : error ? (
          <Notice>{error}</Notice>
        ) : tab === "tags" ? (
          phantoms.length === 0 ? (
            <View className="mt-3">
              <Empty>Every tag the readers saw was matched.</Empty>
            </View>
          ) : (
            <View className="mt-3">
              <Rows>
                {phantoms.map((p) => (
                  <Row
                    key={p.id}
                    title={p.rfid ?? `Scan ${p.id}`}
                    subtitle={
                      p.arrivalTime
                        ? new Date(p.arrivalTime).toLocaleString()
                        : "no arrival time recorded"
                    }
                    right={canManage ? "Match" : null}
                    rightTone="text-cyan-600"
                    onPress={
                      canManage
                        ? () => {
                            setLinkRfid(true);
                            setRecordArrival(true);
                            setQuery("");
                            setPicking(p);
                          }
                        : undefined
                    }
                  />
                ))}
              </Rows>
              <Text className="mt-3 text-xs text-slate-400">
                A tag left here is not in the result. Match it to a bird, or dismiss it if it was a
                stray read.
              </Text>
            </View>
          )
        ) : (
          <View className="mt-3">
            {ignored.length === 0 ? (
              <Empty>No bird is excluded from this race.</Empty>
            ) : (
              <Rows>
                {ignored.map((i) => (
                  <Row
                    key={i.id}
                    title={
                      [joinBand(i.inventoryItem?.bird), i.inventoryItem?.bird?.birdName]
                        .filter(Boolean)
                        .join(" · ") || `Entry ${i.inventoryItemId ?? i.id}`
                    }
                    subtitle={i.note || "no reason given"}
                    right={canManage && i.inventoryItemId != null ? "Re-include" : null}
                    rightTone="text-cyan-600"
                    onPress={
                      canManage && i.inventoryItemId != null
                        ? () => reinclude(i.inventoryItemId!)
                        : undefined
                    }
                  />
                ))}
              </Rows>
            )}
            {canManage ? (
              <ButtonRow>
                <Button
                  label="Exclude a bird"
                  tone="secondary"
                  icon="remove-circle-outline"
                  onPress={() => {
                    setQuery("");
                    setNote("");
                    setExcluding(true);
                  }}
                  full
                />
              </ButtonRow>
            ) : null}
          </View>
        )}
      </Sheet>

      <Sheet
        open={picking != null}
        onClose={() => setPicking(null)}
        title={`Tag ${picking?.rfid ?? ""}`}
        subtitle="Which bird did this read belong to?"
      >
        <CheckRow
          on={linkRfid}
          label="Attach the tag to that bird"
          hint="So future scans match on their own."
          onPress={() => setLinkRfid((v) => !v)}
        />
        <CheckRow
          on={recordArrival}
          label="Count it as the arrival"
          hint="Records the read's time as the bird's arrival in this race."
          onPress={() => setRecordArrival((v) => !v)}
        />

        <View className="mt-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search band, name or breeder" />
        </View>

        <ChoiceList
          choices={birdChoices}
          onPick={resolve}
          empty={query ? "No entered bird matches that." : "This race has no entries."}
        />

        <ButtonRow>
          <Button
            label="Dismiss this read"
            tone="secondary"
            onPress={() => {
              const p = picking;
              setPicking(null);
              if (p) drop(p);
            }}
            full
          />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={excluding}
        onClose={() => setExcluding(false)}
        title="Exclude a bird"
        subtitle="It keeps its scan but takes no position"
      >
        <Field
          label="Reason (optional)"
          value={note}
          onChange={setNote}
          placeholder="Returned to loft without flying"
          hint="Kept in the bird's history."
        />
        <View className="mt-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search band, name or breeder" />
        </View>
        <ChoiceList
          choices={excludeChoices}
          onPick={exclude}
          empty={query ? "No entered bird matches that." : "Nothing left to exclude."}
        />
      </Sheet>
    </>
  );
}
