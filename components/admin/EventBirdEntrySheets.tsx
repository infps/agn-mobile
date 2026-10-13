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
  Field,
  Loading,
  Notice,
  SearchBar,
  Sheet,
} from "@/components/admin/ui";
import {
  ALL_BET_KEYS,
  BET_CLASSES,
  COLORS,
  Chips,
  FEDERATIONS,
  Heading,
  Label,
  Toggle,
  fullName,
  isDay,
  toDay,
} from "@/components/admin/birdParts";

/**
 * What the forms need to know about the event's active season: what its fees
 * are, what each betting class costs, and which races a bird can be lost at.
 *
 * Read from the same public event route the portal's event page loads, which
 * carries every season with its schemes and races attached.
 */
export interface SeasonInfo {
  id: number;
  isActive?: boolean;
  feeScheme?: {
    entryFee?: number | null;
    hotSpot1Fee?: number | null;
    hotSpot2Fee?: number | null;
    hotSpot3Fee?: number | null;
    hotSpotFinalFee?: number | null;
    birdFeeItems?: { birdNo: number; birdFee: number | null }[];
  } | null;
  bettingScheme?: Record<string, unknown> | null;
  races?: { id: number; name: string | null; description: string | null; raceNumber?: number | null }[];
}

export function useActiveSeason(eventId: string | number | undefined, enabled: boolean): SeasonInfo | null {
  const req = useAdminData<{ event?: { seasons?: SeasonInfo[] } }>(
    enabled && eventId ? `/breeder/events/${eventId}` : null,
    [eventId, enabled]
  );
  const seasons = req.data?.event?.seasons ?? [];
  return seasons.find((s) => s.isActive) ?? seasons[0] ?? null;
}

/** Chips for the betting classes, each saying what the event charges for it. */
export function BetClassPicker({
  season,
  value,
  onChange,
}: {
  season: SeasonInfo | null;
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  return (
    <>
      {BET_CLASSES.map((group) => (
        <View key={group.title}>
          <Label>{group.title}</Label>
          <Chips
            options={group.classes.map((c) => {
              const price = Number(season?.bettingScheme?.[c.scheme] ?? 0);
              return { key: c.key, label: c.label, hint: price > 0 ? `$${price}` : null };
            })}
            selected={ALL_BET_KEYS.filter((k) => value[k])}
            onPick={(k) => onChange({ ...value, [k]: !value[k] })}
          />
        </View>
      ))}
    </>
  );
}

/** The slice of a listed entry these sheets need. */
export interface EntryRef {
  id: number;
  bird: {
    id: number;
    band: string | null;
    band1?: string | null;
    band2?: string | null;
    band3?: string | null;
    band4?: string | null;
    birdName: string | null;
  } | null;
  eventInventory?: {
    breeder?: { id: number; firstName: string | null; lastName: string | null } | null;
  } | null;
}

const bandOf = (entry: EntryRef | null) => {
  const b = entry?.bird;
  if (!b) return "this bird";
  return [b.band1, b.band2, b.band3, b.band4].filter(Boolean).join("-") || b.band || "this bird";
};

/* ------------------------------------------------------------------ */
/* Edit                                                               */
/* ------------------------------------------------------------------ */

interface FullBird {
  id: number;
  band1: string | null;
  band2: string | null;
  band3: string | null;
  band4: string | null;
  birdName: string | null;
  color: string | null;
  rfid: string | null;
  isActive: number | null;
  isLost: number | null;
  lostDate: string | null;
  lostRaceId: number | null;
  note: string | null;
  inventoryItems?: ({
    id: number;
    arrivalDate: string | null;
    departureDate: string | null;
    isBackup: number | null;
  } & Record<string, unknown>)[];
}

const BLANK_EDIT = {
  band1: "",
  band2: "",
  band3: "",
  band4: "",
  birdName: "",
  color: "",
  rfid: "",
  isActive: true,
  isLost: false,
  lostDate: "",
  lostRaceId: "",
  note: "",
  arrivalDate: "",
  departureDate: "",
  isBackup: false,
};

/**
 * Editing one bird's entry in one event.
 *
 * The route behind this replaces the whole entry: every field it knows about is
 * written from the request, and one that is left out is written as empty. The
 * event's bird list does not carry most of them — not the arrival or departure
 * dates, not whether the bird is a reserve, not its betting classes — so a form
 * filled from the list alone would blank them the first time anybody corrected
 * a name. The full record is therefore loaded first, and nothing can be saved
 * until it has arrived. A form that cannot show what it is about to overwrite
 * should not be allowed to overwrite it.
 *
 * Sex is not here because this route does not store it; it is changed on the
 * bird's own page, where it is.
 */
export function EventBirdEditSheet({
  open,
  onClose,
  onSaved,
  entry,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  entry: EntryRef | null;
  eventId: string | number | undefined;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const season = useActiveSeason(eventId, open);

  const birdId = entry?.bird?.id ?? null;
  const full = useAdminData<{ bird?: FullBird }>(
    open && birdId ? `/admin/bird/${birdId}` : null,
    [open, birdId]
  );

  const [form, setForm] = useState(BLANK_EDIT);
  const [bets, setBets] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  const bird = full.data?.bird ?? null;
  const item = useMemo(
    () => bird?.inventoryItems?.find((i) => i.id === entry?.id) ?? null,
    [bird, entry?.id]
  );

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    if (!bird || !item || bird.id !== birdId) return;
    setForm({
      band1: bird.band1 ?? "",
      band2: bird.band2 ?? "",
      band3: bird.band3 ?? "",
      band4: bird.band4 ?? "",
      birdName: bird.birdName ?? "",
      color: bird.color ?? "",
      rfid: bird.rfid ?? "",
      isActive: bird.isActive === 1,
      isLost: bird.isLost === 1,
      lostDate: toDay(bird.lostDate),
      lostRaceId: bird.lostRaceId != null ? String(bird.lostRaceId) : "",
      note: bird.note ?? "",
      arrivalDate: toDay(item.arrivalDate),
      departureDate: toDay(item.departureDate),
      isBackup: item.isBackup === 1,
    });
    setBets(Object.fromEntries(ALL_BET_KEYS.map((k) => [k, Number(item[k] ?? 0) > 0])));
    setReady(true);
  }, [open, bird, item, birdId]);

  const set = (patch: Partial<typeof BLANK_EDIT>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!entry || !item || !ready) return;
    if (!form.band1 || !form.band2.trim() || !form.band3.trim() || !form.band4.trim()) {
      toast.error("All four parts of the band are needed.");
      return;
    }
    if (!form.birdName.trim()) {
      toast.error("Give the bird a name.");
      return;
    }
    if (!form.color) {
      toast.error("Pick a colour.");
      return;
    }
    for (const [label, value] of [
      ["Lost date", form.isLost ? form.lostDate : ""],
      ["Arrival date", form.arrivalDate],
      ["Departure date", form.departureDate],
    ]) {
      if (value && !isDay(value)) {
        toast.error(`${label} should look like 2026-03-14.`);
        return;
      }
    }

    const body: Record<string, unknown> = {
      band1: form.band1,
      band2: form.band2.trim(),
      band3: form.band3.trim().toUpperCase(),
      band4: form.band4.trim(),
      birdName: form.birdName.trim(),
      color: form.color,
      rfid: form.rfid.trim() || null,
      isActive: form.isActive,
      isLost: form.isLost,
      lostDate: form.isLost && form.lostDate ? form.lostDate : null,
      lostRaceId: form.isLost && form.lostRaceId ? Number(form.lostRaceId) : null,
      note: form.note.trim() || null,
      arrivalDate: form.arrivalDate || null,
      departureDate: form.departureDate || null,
      isBackup: form.isBackup,
    };
    // A class that was already on keeps the figure it had; a new one is 1, as
    // the portal writes it.
    for (const key of ALL_BET_KEYS) {
      const had = Number(item[key] ?? 0);
      body[key] = bets[key] ? (had > 0 ? had : 1) : null;
    }

    const { ok } = await action.run("patch", `/admin/event-inventory-item/${entry.id}`, body, {
      success: "Entry updated.",
    });
    if (ok) {
      onClose();
      onSaved();
    }
  };

  const races = season?.races ?? [];

  return (
    <Sheet open={open} onClose={onClose} title="Edit bird" subtitle={bandOf(entry)}>
      {full.loading ? (
        <Loading />
      ) : full.forbidden ? (
        <Notice>
          Editing an entry needs the bird's full record, and that record is not part of your access.
          Nothing was changed.
        </Notice>
      ) : !bird || !item ? (
        <Notice>
          {full.error ??
            "This entry's full record could not be loaded, so it cannot be edited safely from here."}
        </Notice>
      ) : !ready ? (
        <Loading />
      ) : (
        <>
          <Label>Federation</Label>
          <Chips
            options={[
              ...FEDERATIONS,
              ...(form.band1 && !FEDERATIONS.includes(form.band1) ? [form.band1] : []),
            ].map((f) => ({ key: f, label: f }))}
            selected={form.band1}
            onPick={(k) => set({ band1: k })}
          />
          <View className="flex-row" style={{ gap: 8 }}>
            <View className="flex-1">
              <Field label="Year" value={form.band2} onChange={(v) => set({ band2: v })} />
            </View>
            <View className="flex-1">
              <Field
                label="Letters"
                value={form.band3}
                onChange={(v) => set({ band3: v.toUpperCase() })}
              />
            </View>
            <View className="flex-1">
              <Field label="Number" value={form.band4} onChange={(v) => set({ band4: v })} />
            </View>
          </View>

          <Field label="Name" value={form.birdName} onChange={(v) => set({ birdName: v })} />

          <Label>Colour</Label>
          <Chips
            options={[
              ...COLORS,
              ...(form.color && !COLORS.includes(form.color) ? [form.color] : []),
            ].map((c) => ({ key: c, label: c }))}
            selected={form.color}
            onPick={(k) => set({ color: k })}
          />

          <Field
            label="RFID tag"
            value={form.rfid}
            onChange={(v) => set({ rfid: v })}
            hint="Usually set by scanning at check-in. Type it only to correct one."
          />

          <Toggle label="Active" value={form.isActive} onChange={(v) => set({ isActive: v })} />
          <Toggle label="Lost" value={form.isLost} onChange={(v) => set({ isLost: v })} />
          {form.isLost ? (
            <>
              <Field
                label="Lost date"
                value={form.lostDate}
                onChange={(v) => set({ lostDate: v })}
                placeholder="YYYY-MM-DD"
              />
              <Label>Lost at race</Label>
              {races.length === 0 ? (
                <Text className="text-xs text-slate-400">This season has no races yet.</Text>
              ) : (
                <Chips
                  options={[
                    { key: "", label: "Not known" },
                    ...races.map((r) => ({
                      key: String(r.id),
                      label: r.description ?? r.name ?? `Race ${r.raceNumber ?? r.id}`,
                    })),
                  ]}
                  selected={form.lostRaceId}
                  onPick={(k) => set({ lostRaceId: k })}
                />
              )}
            </>
          ) : null}

          <View className="flex-row" style={{ gap: 8 }}>
            <View className="flex-1">
              <Field
                label="Arrival date"
                value={form.arrivalDate}
                onChange={(v) => set({ arrivalDate: v })}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Departure date"
                value={form.departureDate}
                onChange={(v) => set({ departureDate: v })}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <Toggle
            label="Backup bird"
            hint="A reserve, held to be swapped in for one that drops out"
            value={form.isBackup}
            onChange={(v) => set({ isBackup: v })}
          />

          <Field label="Notes" value={form.note} onChange={(v) => set({ note: v })} multiline />

          <Heading>Betting classes</Heading>
          <BetClassPicker season={season} value={bets} onChange={setBets} />

          <ButtonRow>
            <Button label="Cancel" tone="secondary" onPress={onClose} full />
            <Button label="Save" onPress={save} pending={action.pending} full />
          </ButtonRow>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Substitute                                                         */
/* ------------------------------------------------------------------ */

interface Backup {
  id: number;
  birdNo: number | null;
  band: string;
  birdName: string | null;
  eligible: boolean;
}

/**
 * Swap a reserve in for a bird that is out of the race, or undo that swap.
 *
 * Which of the two this is depends on the bird, and only the server knows — it
 * says whether the entry has already been replaced — so the sheet asks before
 * it offers anything. The replacement inherits the outgoing bird's number and
 * fees, which is why the registration still bills the same afterwards; that is
 * stated rather than left to be discovered on an invoice.
 */
export function EventBirdSubstituteSheet({
  open,
  onClose,
  onDone,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  entry: EntryRef | null;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const [selected, setSelected] = useState<number | null>(null);

  const path = entry ? `/admin/event-inventory-item/${entry.id}/substitute` : null;
  const req = useAdminData<{ alreadyReplaced?: boolean; backups?: Backup[] }>(
    open ? path : null,
    [open, entry?.id]
  );

  useEffect(() => {
    if (open) setSelected(null);
  }, [open, entry?.id]);

  const replaced = req.data?.alreadyReplaced === true;
  const eligible = (req.data?.backups ?? []).filter((b) => b.eligible);

  const finish = (message: unknown, fallback: string) => {
    toast.success(typeof message === "string" && message ? message : fallback);
    onClose();
    onDone();
  };

  const substitute = async () => {
    if (!path) return;
    const { ok, data } = await action.run<{ message?: string }>(
      "post",
      path,
      selected ? { incomingItemId: selected } : {}
    );
    if (ok) finish(data?.message, "Backup substituted in.");
  };

  const restore = async () => {
    if (!path) return;
    const { ok, data } = await action.run<{ message?: string }>("delete", path);
    if (ok) finish(data?.message, "Bird restored to the lineup.");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={replaced ? "Restore to lineup" : "Substitute a backup bird"}
      subtitle={bandOf(entry)}
    >
      {req.loading ? (
        <Loading />
      ) : req.forbidden ? (
        <Notice>Backup substitution is not part of your access.</Notice>
      ) : req.error ? (
        <Notice>{req.error}</Notice>
      ) : replaced ? (
        <>
          <Notice>
            {bandOf(entry)} was replaced. Restoring puts it back in the lineup at the end of the bird
            numbering and reprices the registration.
          </Notice>
          <ButtonRow>
            <Button label="Cancel" tone="secondary" onPress={onClose} full />
            <Button label="Restore" onPress={restore} pending={action.pending} full />
          </ButtonRow>
        </>
      ) : (
        <>
          <Notice>
            The reserve you pick takes over {bandOf(entry)}'s bird number and fees, so the
            registration still bills the same. Its bet stakes are flagged for refund.
          </Notice>
          {eligible.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">
              This registration has no eligible reserve. A backup is eligible only if it is not
              marked lost and is not already carrying a perch fee.
            </Text>
          ) : (
            <ChoiceList
              choices={eligible.map((b) => ({
                key: b.id,
                label: b.band || `Entry ${b.id}`,
                hint: [b.birdName, `backup ${b.birdNo ?? "—"}`].filter(Boolean).join(" · "),
              }))}
              selected={selected}
              onPick={(k) => setSelected(selected === k ? null : Number(k))}
            />
          )}
          <ButtonRow>
            <Button label="Cancel" tone="secondary" onPress={onClose} full />
            <Button
              label={selected ? "Substitute" : "Use first eligible"}
              onPress={substitute}
              pending={action.pending}
              disabled={eligible.length === 0}
              full
            />
          </ButtonRow>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Transfer                                                           */
/* ------------------------------------------------------------------ */

/**
 * Move a bird's entry to another breeder.
 *
 * The route is filed under `/admin/bird/…` but what it takes is the *entry's*
 * id, not the bird's: a transfer re-homes one registration and writes who it
 * came from into that entry's history. Sending a bird id there would move
 * whichever unrelated entry happened to share the number, so this sheet is only
 * ever handed an entry.
 *
 * It moves the whole registration the entry sits in, which is how the portal
 * does it too — said here because it is not what "transfer this bird" suggests.
 */
export function BreederTransferSheet({
  open,
  onClose,
  onDone,
  entryId,
  currently,
  what,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  entryId: number | null;
  currently?: string | null;
  what?: string | null;
}) {
  const action = useAdminAction();
  const [query, setQuery] = useState("");

  // Only while a transfer is being chosen — the breeder list is long.
  const req = useAdminData<{
    breeders?: { id: number; firstName: string | null; lastName: string | null; email: string | null }[];
  }>(open ? "/admin/breeders" : null, [open]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const choices: Choice[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = req.data?.breeders ?? [];
    const matched = q
      ? all.filter((b) => `${fullName(b)} ${b.email ?? ""}`.toLowerCase().includes(q))
      : all;
    return matched.slice(0, 40).map((b) => ({
      key: b.id,
      label: fullName(b) || b.email || `Breeder ${b.id}`,
      hint: b.email,
    }));
  }, [req.data, query]);

  const transfer = async (newBreederId: string | number) => {
    if (entryId == null) return;
    const { ok } = await action.run(
      "post",
      `/admin/bird/${entryId}/transfer-breeder`,
      { newBreederId: Number(newBreederId) },
      { success: "Breeder transferred." }
    );
    if (ok) {
      onClose();
      onDone();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Transfer breeder"
      subtitle={[what, `currently ${currently || "unassigned"}`].filter(Boolean).join(" · ")}
    >
      <Notice>
        This re-homes the registration this entry belongs to, and records who it came from.
      </Notice>
      <View className="mt-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search breeders" />
      </View>
      {req.loading || action.pending ? (
        <Loading />
      ) : req.forbidden ? (
        <Notice>The breeder list is not part of your access.</Notice>
      ) : (
        <ChoiceList
          choices={choices}
          onPick={transfer}
          empty={query ? "Nobody matches that." : "No breeders on record."}
        />
      )}
    </Sheet>
  );
}
