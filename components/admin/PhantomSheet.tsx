import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
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

interface Phantom {
  id: number;
  rfidTag: string | null;
  arrivalTime: string | null;
  resolved?: boolean | null;
  bird?: {
    id: number;
    band1: string | null;
    rfid: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  } | null;
}

interface RaceItem {
  id: number;
  bird?: {
    id?: number;
    band?: string | null;
    birdName?: string | null;
    breeder?: { firstName?: string | null; lastName?: string | null } | null;
  };
}

/**
 * A switch, drawn as a button that shows its own state.
 *
 * Declared here rather than inside the sheet: a component defined during
 * render is a new type on every render, so React unmounts and rebuilds it —
 * which, in a sheet with a search box above it, reset both switches on every
 * keystroke.
 */
function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Button
      label={`${on ? "✓ " : "  "}${label}`}
      tone={on ? "primary" : "secondary"}
      onPress={onPress}
      full
    />
  );
}

/**
 * Tags the readers saw that nobody could match to a bird.
 *
 * This is the failure mode of the whole scanning arrangement, and the one that
 * is invisible until somebody's bird is missing from the result. A tag that
 * reads cleanly but belongs to no registered bird is recorded as a phantom
 * rather than dropped, and this is where it gets a name put to it.
 *
 * Resolving one is two decisions, not one, which is why they are separate
 * switches: whether to attach the tag to that bird permanently, and whether to
 * count this read as the bird's arrival. A tag swapped between birds mid-season
 * wants the first without the second; a bird clocked on a spare reader wants
 * both.
 */
export function PhantomSheet({
  open,
  onClose,
  raceId,
  items,
  onResolved,
}: {
  open: boolean;
  onClose: () => void;
  raceId: number;
  /** The race's own entries — a phantom belongs to one of them or to nobody. */
  items: RaceItem[];
  onResolved: () => void;
}) {
  const action = useAdminAction();
  const [picking, setPicking] = useState<Phantom | null>(null);
  const [query, setQuery] = useState("");
  const [linkRfid, setLinkRfid] = useState(true);
  const [recordArrival, setRecordArrival] = useState(true);

  const { data, loading, error, reload } = useAdminData<{ phantoms?: Phantom[] }>(
    open ? `/admin/race/${raceId}/phantoms` : null,
    [open, raceId]
  );

  const phantoms = useMemo(
    () => (data?.phantoms ?? []).filter((p) => p.resolved !== true),
    [data]
  );

  const birds: Choice[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? items.filter((i) => {
          const who = `${i.bird?.breeder?.firstName ?? ""} ${i.bird?.breeder?.lastName ?? ""}`;
          return `${i.bird?.band ?? ""} ${i.bird?.birdName ?? ""} ${who}`
            .toLowerCase()
            .includes(q);
        })
      : items;
    return matched
      .filter((i) => i.bird?.id != null)
      .slice(0, 40)
      .map((i) => ({
        key: i.bird!.id!,
        label: i.bird?.band ?? `Bird ${i.bird?.id}`,
        hint:
          `${i.bird?.breeder?.firstName ?? ""} ${i.bird?.breeder?.lastName ?? ""}`.trim() ||
          i.bird?.birdName ||
          null,
      }));
  }, [items, query]);

  const resolve = async (birdId: string | number) => {
    if (!picking) return;
    const { ok } = await action.run(
      "post",
      `/admin/race/${raceId}/phantoms/${picking.id}`,
      { birdId: Number(birdId), linkRfid, recordArrival },
      { success: "Phantom resolved." }
    );
    if (ok) {
      setPicking(null);
      setQuery("");
      reload();
      onResolved();
    }
  };

  const drop = async (phantom: Phantom) => {
    const { ok } = await action.run("delete", `/admin/race/${raceId}/phantoms/${phantom.id}`, undefined, {
      success: "Phantom discarded.",
    });
    if (ok) {
      reload();
      onResolved();
    }
  };

  return (
    <>
      <Sheet
        open={open && picking == null}
        onClose={onClose}
        title="Unmatched tags"
        subtitle={
          phantoms.length > 0
            ? `${phantoms.length} read that belong to no registered bird`
            : "Every tag the readers saw was matched"
        }
      >
        {loading ? (
          <Loading />
        ) : error ? (
          <Notice>{error}</Notice>
        ) : phantoms.length === 0 ? (
          <Empty>Nothing to reconcile.</Empty>
        ) : (
          <View className="mt-2">
            <Rows>
              {phantoms.map((p) => (
                <Row
                  key={p.id}
                  title={p.rfidTag ?? `Phantom ${p.id}`}
                  subtitle={
                    p.arrivalTime
                      ? new Date(p.arrivalTime).toLocaleTimeString()
                      : "no arrival time recorded"
                  }
                  right="Match"
                  rightTone="text-cyan-600"
                  onPress={() => {
                    setLinkRfid(true);
                    setRecordArrival(true);
                    setQuery("");
                    setPicking(p);
                  }}
                />
              ))}
            </Rows>
            <Text className="mt-3 text-xs text-slate-400">
              A tag left here is not in the result. Match it to a bird, or discard it if it was a
              stray read.
            </Text>
          </View>
        )}
      </Sheet>

      <Sheet
        open={picking != null}
        onClose={() => setPicking(null)}
        title={`Tag ${picking?.rfidTag ?? ""}`}
        subtitle="Which bird did this read belong to?"
      >
        <View className="mt-2" style={{ gap: 8 }}>
          <Toggle
            on={linkRfid}
            label="Attach the tag to that bird"
            onPress={() => setLinkRfid((v) => !v)}
          />
          <Toggle
            on={recordArrival}
            label="Count it as the arrival"
            onPress={() => setRecordArrival((v) => !v)}
          />
        </View>

        <View className="mt-4">
          <SearchBar value={query} onChange={setQuery} placeholder="Search band or breeder" />
        </View>

        <ChoiceList
          choices={birds}
          onPick={resolve}
          empty={query ? "No entered bird matches that." : "This race has no entries."}
        />

        <ButtonRow>
          <Button
            label="Discard this read"
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
    </>
  );
}
