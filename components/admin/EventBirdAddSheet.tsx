import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  ChoiceList,
  Field,
  Loading,
  Notice,
  SearchBar,
  Sheet,
} from "@/components/admin/ui";
import {
  ALL_BET_KEYS,
  COLORS,
  Chips,
  FEDERATIONS,
  Heading,
  Label,
  SEXES,
  Toggle,
  fullName,
  isDay,
} from "@/components/admin/birdParts";
import { BetClassPicker, useActiveSeason } from "@/components/admin/EventBirdEntrySheets";

type Mode = "new" | "event" | "season";

const MODES: { key: Mode; label: string }[] = [
  { key: "new", label: "Register new" },
  { key: "event", label: "From past event" },
  { key: "season", label: "From past season" },
];

interface Breeder {
  id: number;
  firstName: string | null;
  lastName: string | null;
}

/** An entry as the event's bird list returns it — here used as a source to copy from. */
interface SourceItem {
  id: number;
  bird: { id: number; band: string | null; birdName: string | null; color: string | null } | null;
  eventInventory?: { breederId?: number | null; breeder?: Breeder | null } | null;
}

const blank = () => ({
  band1: "",
  band2: String(new Date().getFullYear()).slice(-2),
  band3: "",
  band4: "",
  name: "",
  color: "",
  sex: "0",
  rfid: "",
  attention: false,
  isBackup: false,
  isActive: true,
  isLost: false,
  lostDate: "",
  lostRaceId: "",
  note: "",
  arrivalTime: "",
  departureTime: "",
  perchFeeValue: "",
  entryFeeValue: "",
  hotSpotFeeValue: "",
  raceFeeValue: "",
});

const amount = (s: string) => {
  const n = parseFloat(s);
  return s.trim() && Number.isFinite(n) ? n : null;
};

/**
 * Putting birds into an event, the three ways the portal offers.
 *
 * Registering a new one is the form for a bird nobody has seen before — it
 * creates the bird and its entry together. The other two copy birds that are
 * already on record from another event or another season, which is how most of
 * a returning breeder's team actually gets entered: nobody retypes forty bands.
 *
 * A new bird can only be registered to a breeder who is already in this event,
 * as in the portal; adding the breeder is a registration, and lives with them.
 * Picking the breeder fills in what the season's fee scheme says their next
 * bird costs, so a bird entered from the loft floor is billed the same as one
 * entered at the desk. The figures stay editable.
 *
 * "Add another" keeps the federation, year and letters and steps the number on
 * by one, because a breeder's birds are banded from one strip.
 */
export function EventBirdAddSheet({
  open,
  onClose,
  onAdded,
  eventId,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  eventId: string | number | undefined;
  existing: SourceItem[];
}) {
  const toast = useToast();
  const action = useAdminAction();
  const season = useActiveSeason(eventId, open);

  const [mode, setMode] = useState<Mode | null>(null);
  const [breederId, setBreederId] = useState<number | null>(null);
  const [form, setForm] = useState(blank);
  const [bets, setBets] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);

  const [sourceEvent, setSourceEvent] = useState<number | null>(null);
  const [sourceSeason, setSourceSeason] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");

  const reset = () => {
    setMode(null);
    setBreederId(null);
    setForm(blank());
    setBets({});
    setMore(false);
    setSourceEvent(null);
    setSourceSeason(null);
    setPicked(new Set());
    setQuery("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm((f) => ({ ...f, ...patch }));

  // The breeders already in this event, which is who a new bird can be put under.
  const breeders = useMemo(() => {
    const seen = new Map<number, Breeder>();
    for (const item of existing) {
      const b = item.eventInventory?.breeder;
      if (b?.id && !seen.has(b.id)) seen.set(b.id, b);
    }
    return [...seen.values()].sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? ""));
  }, [existing]);

  // How many birds the chosen breeder had when picked, and how many this sheet
  // has added since. Counted here rather than re-read from the list, which
  // refreshes on its own schedule: the next bird's price depends on its number.
  const [counted, setCounted] = useState({ had: 0, added: 0 });

  const perchFor = (birdNo: number) =>
    season?.feeScheme?.birdFeeItems?.find((b) => b.birdNo === birdNo)?.birdFee ?? null;

  const pickBreeder = (id: number) => {
    setBreederId(id);
    const count = existing.filter((i) => i.eventInventory?.breederId === id).length;
    setCounted({ had: count, added: 0 });
    const scheme = season?.feeScheme;
    if (!scheme) return;
    const perch = perchFor(count + 1);
    const hotSpot =
      (scheme.hotSpot1Fee ?? 0) +
      (scheme.hotSpot2Fee ?? 0) +
      (scheme.hotSpot3Fee ?? 0) +
      (scheme.hotSpotFinalFee ?? 0);
    set({
      perchFeeValue: perch != null ? String(perch) : "",
      entryFeeValue: scheme.entryFee != null ? String(scheme.entryFee) : "",
      hotSpotFeeValue: hotSpot > 0 ? String(hotSpot) : "",
    });
  };

  const eventsReq = useAdminData<{ events?: { id: number; name: string | null }[] }>(
    open && mode === "event" ? "/breeder/events" : null,
    [open, mode]
  );
  const seasonsReq = useAdminData<{
    seasons?: { id: number; name: string | null; eventId: number; event?: { name: string | null } | null }[];
  }>(open && mode === "season" ? "/admin/seasons" : null, [open, mode]);

  // The list route ignores the event in the path once a season is named, which
  // is how the portal reads another season's birds too.
  const sourcePath =
    mode === "event" && sourceEvent
      ? `/admin/event/${sourceEvent}/event-inventory-items`
      : mode === "season" && sourceSeason
        ? `/admin/event/0/event-inventory-items?seasonId=${sourceSeason}`
        : null;
  const sourceReq = useAdminData<{ eventInventoryItems?: SourceItem[] }>(open ? sourcePath : null, [
    open,
    sourcePath,
  ]);

  const have = useMemo(
    () => new Set(existing.map((i) => i.bird?.id).filter((id): id is number => id != null)),
    [existing]
  );
  const sourceAll = sourceReq.data?.eventInventoryItems ?? [];
  const available = useMemo(
    () => sourceAll.filter((i) => i.bird && !have.has(i.bird.id)),
    [sourceAll, have]
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((i) =>
      `${i.bird?.band ?? ""} ${i.bird?.birdName ?? ""} ${fullName(i.eventInventory?.breeder)}`
        .toLowerCase()
        .includes(q)
    );
  }, [available, query]);

  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const register = async (another: boolean) => {
    if (!breederId) return toast.error("Select a breeder.");
    if (!form.band1) return toast.error("Select a federation.");
    if (!form.band2.trim()) return toast.error("Enter a year.");
    if (!form.band3.trim()) return toast.error("Enter letters.");
    if (!form.band4.trim()) return toast.error("Enter a band number.");
    if (!form.color) return toast.error("Select a colour.");
    for (const [label, value] of [
      ["Lost date", form.isLost ? form.lostDate : ""],
      ["Arrival date", form.arrivalTime],
      ["Departure date", form.departureTime],
    ]) {
      if (value && !isDay(value)) return toast.error(`${label} should look like 2026-03-14.`);
    }

    const band = {
      band1: form.band1,
      band2: form.band2.trim(),
      band3: form.band3.trim().toUpperCase(),
      band4: form.band4.trim(),
    };
    const body: Record<string, unknown> = {
      breederId,
      name: form.name.trim() || `${band.band1}-${band.band2}-${band.band3}-${band.band4}`,
      ...band,
      color: form.color,
      sex: Number(form.sex),
      rfid: form.rfid.trim() || undefined,
      attention: form.attention,
      isBackup: form.isBackup,
      isActive: form.isActive,
      isLost: form.isLost,
      lostDate: form.isLost && form.lostDate ? form.lostDate : null,
      lostRaceId: form.isLost && form.lostRaceId ? Number(form.lostRaceId) : null,
      note: form.note.trim() || null,
      arrivalTime: form.arrivalTime || null,
      departureTime: form.departureTime || null,
      perchFeeValue: amount(form.perchFeeValue),
      entryFeeValue: amount(form.entryFeeValue),
      hotSpotFeeValue: amount(form.hotSpotFeeValue),
      raceFeeValue: amount(form.raceFeeValue),
    };
    for (const key of ALL_BET_KEYS) body[key] = bets[key] ? 1 : null;

    const { ok } = await action.run("post", `/admin/event/${eventId}/register-bird`, body, {
      success: "Bird registered.",
    });
    if (!ok) return;

    onAdded();
    if (another) {
      const n = parseInt(form.band4, 10);
      const nextPerch = perchFor(counted.had + counted.added + 2);
      setCounted({ ...counted, added: counted.added + 1 });
      setForm({
        ...blank(),
        band1: band.band1,
        band2: band.band2,
        band3: band.band3,
        band4: Number.isNaN(n) ? "" : String(n + 1),
        perchFeeValue: nextPerch != null ? String(nextPerch) : "",
        entryFeeValue: form.entryFeeValue,
        hotSpotFeeValue: form.hotSpotFeeValue,
      });
      setBets({});
    } else {
      onClose();
    }
  };

  const copy = async () => {
    if (picked.size === 0) return toast.error("Select at least one bird.");
    const { ok, data } = await action.run<{ message?: string }>(
      "post",
      `/admin/event/${eventId}/add-birds`,
      { birdIds: [...picked] }
    );
    if (ok) {
      toast.success(data?.message || "Birds added.");
      onAdded();
      onClose();
    }
  };

  const races = season?.races ?? [];
  const sourceChosen = mode === "event" ? sourceEvent != null : sourceSeason != null;

  return (
    <Sheet open={open} onClose={onClose} title="Add birds" subtitle="To this event's active season">
      <Label>How would you like to add birds?</Label>
      <Chips
        options={MODES}
        selected={mode}
        onPick={(k) => {
          reset();
          setMode(k as Mode);
        }}
      />

      {mode === "new" ? (
        <>
          <Label>Breeder</Label>
          {breeders.length === 0 ? (
            <Notice>
              No breeder is registered to this event yet. Register the breeder first, then add
              their birds.
            </Notice>
          ) : breederId ? (
            <Pressable
              onPress={() => setBreederId(null)}
              className="flex-row items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            >
              <Text className="text-sm font-medium text-slate-900">
                {fullName(breeders.find((b) => b.id === breederId)) || `Breeder #${breederId}`}
              </Text>
              <Text className="text-xs font-medium text-blue-600">change</Text>
            </Pressable>
          ) : (
            <ChoiceList
              choices={breeders.map((b) => ({ key: b.id, label: fullName(b) || `Breeder #${b.id}` }))}
              onPick={(k) => pickBreeder(Number(k))}
            />
          )}

          {breederId ? (
            <>
              <Label>Federation</Label>
              <Chips
                options={FEDERATIONS.map((f) => ({ key: f, label: f }))}
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
                  <Field
                    label="Number"
                    value={form.band4}
                    onChange={(v) => set({ band4: v })}
                    keyboard="numeric"
                  />
                </View>
              </View>

              <Label>Colour</Label>
              <Chips
                options={COLORS.map((c) => ({ key: c, label: c }))}
                selected={form.color}
                onPick={(k) => set({ color: k })}
              />

              <Label>Sex</Label>
              <Chips options={SEXES} selected={form.sex} onPick={(k) => set({ sex: k })} />

              <Field
                label="Name"
                value={form.name}
                onChange={(v) => set({ name: v })}
                hint="Left blank, the band is used as the name."
              />
              <Field label="RFID tag" value={form.rfid} onChange={(v) => set({ rfid: v })} />

              <Toggle
                label="Pay attention during basketing"
                value={form.attention}
                onChange={(v) => set({ attention: v })}
              />
              <Toggle
                label="Backup bird"
                hint="A reserve, held to be swapped in for one that drops out"
                value={form.isBackup}
                onChange={(v) => set({ isBackup: v })}
              />

              {season?.feeScheme ? (
                <>
                  <Heading>Fees</Heading>
                  <View className="-mt-3 flex-row" style={{ gap: 8 }}>
                    <View className="flex-1">
                      <Field
                        label="Per bird"
                        value={form.perchFeeValue}
                        onChange={(v) => set({ perchFeeValue: v })}
                        keyboard="decimal-pad"
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="Entry"
                        value={form.entryFeeValue}
                        onChange={(v) => set({ entryFeeValue: v })}
                        keyboard="decimal-pad"
                      />
                    </View>
                  </View>
                  <View className="flex-row" style={{ gap: 8 }}>
                    <View className="flex-1">
                      <Field
                        label="Hot spot"
                        value={form.hotSpotFeeValue}
                        onChange={(v) => set({ hotSpotFeeValue: v })}
                        keyboard="decimal-pad"
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="Race"
                        value={form.raceFeeValue}
                        onChange={(v) => set({ raceFeeValue: v })}
                        keyboard="decimal-pad"
                      />
                    </View>
                  </View>
                </>
              ) : null}

              <Toggle
                label="More details"
                hint="Status, dates, notes and betting classes"
                value={more}
                onChange={setMore}
              />

              {more ? (
                <>
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
                      {races.length > 0 ? (
                        <>
                          <Label>Lost at race</Label>
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
                        </>
                      ) : null}
                    </>
                  ) : null}
                  <View className="flex-row" style={{ gap: 8 }}>
                    <View className="flex-1">
                      <Field
                        label="Arrival date"
                        value={form.arrivalTime}
                        onChange={(v) => set({ arrivalTime: v })}
                        placeholder="today"
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="Departure date"
                        value={form.departureTime}
                        onChange={(v) => set({ departureTime: v })}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                  </View>
                  <Field label="Notes" value={form.note} onChange={(v) => set({ note: v })} multiline />

                  <Heading>Betting classes</Heading>
                  <BetClassPicker season={season} value={bets} onChange={setBets} />
                </>
              ) : null}

              <ButtonRow>
                <Button
                  label="Add another"
                  tone="secondary"
                  onPress={() => register(true)}
                  disabled={action.pending}
                  full
                />
                <Button label="Register" onPress={() => register(false)} pending={action.pending} full />
              </ButtonRow>
            </>
          ) : null}
        </>
      ) : null}

      {mode === "event" || mode === "season" ? (
        <>
          <Label>{mode === "event" ? "Source event" : "Source season"}</Label>
          {sourceChosen ? (
            <Pressable
              onPress={() => {
                setSourceEvent(null);
                setSourceSeason(null);
                setPicked(new Set());
                setQuery("");
              }}
              className="flex-row items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            >
              <Text className="flex-1 text-sm font-medium text-slate-900" numberOfLines={1}>
                {mode === "event"
                  ? eventsReq.data?.events?.find((e) => e.id === sourceEvent)?.name ??
                    `Event #${sourceEvent}`
                  : (() => {
                      const s = seasonsReq.data?.seasons?.find((x) => x.id === sourceSeason);
                      return s ? `${s.name ?? "Season"} — ${s.event?.name ?? `Event #${s.eventId}`}` : "";
                    })()}
              </Text>
              <Text className="text-xs font-medium text-blue-600">change</Text>
            </Pressable>
          ) : mode === "event" ? (
            eventsReq.loading ? (
              <Loading />
            ) : (
              <ChoiceList
                choices={(eventsReq.data?.events ?? [])
                  .filter((e) => String(e.id) !== String(eventId))
                  .map((e) => ({ key: e.id, label: e.name || `Event #${e.id}` }))}
                onPick={(k) => {
                  setSourceEvent(Number(k));
                  setPicked(new Set());
                }}
                empty={eventsReq.error ?? "There is no other event to copy from."}
              />
            )
          ) : seasonsReq.loading ? (
            <Loading />
          ) : seasonsReq.forbidden ? (
            <Notice>The season list is not part of your access.</Notice>
          ) : (
            <ChoiceList
              choices={(seasonsReq.data?.seasons ?? []).map((s) => ({
                key: s.id,
                label: s.name || `Season #${s.id}`,
                hint: s.event?.name || `Event #${s.eventId}`,
              }))}
              onPick={(k) => {
                setSourceSeason(Number(k));
                setPicked(new Set());
              }}
              empty={seasonsReq.error ?? "No seasons on record."}
            />
          )}

          {sourceChosen ? (
            sourceReq.loading ? (
              <Loading />
            ) : sourceReq.forbidden ? (
              <Notice>That bird list is not part of your access.</Notice>
            ) : sourceReq.error ? (
              <Notice>{sourceReq.error}</Notice>
            ) : available.length === 0 ? (
              <Text className="mt-4 text-center text-sm text-slate-500">
                {sourceAll.length === 0
                  ? `No birds in this ${mode}.`
                  : "All of its birds are already in this event."}
              </Text>
            ) : (
              <>
                <View className="mt-3 flex-row items-center justify-between">
                  <Text className="text-xs font-medium text-slate-600">
                    Birds ({picked.size} of {available.length} selected)
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      setPicked(
                        picked.size === available.length
                          ? new Set()
                          : new Set(available.map((i) => i.bird!.id))
                      )
                    }
                  >
                    <Text className="text-xs font-medium text-blue-600">
                      {picked.size === available.length ? "Deselect all" : "Select all"}
                    </Text>
                  </Pressable>
                </View>
                <View className="mt-2">
                  <SearchBar value={query} onChange={setQuery} placeholder="Band, name or breeder" />
                </View>
                <View className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                  {shown.slice(0, 150).map((item, index) => {
                    const bird = item.bird!;
                    const on = picked.has(bird.id);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => toggle(bird.id)}
                        className={`flex-row items-center gap-3 px-3 py-2.5 ${
                          index > 0 ? "border-t border-slate-100" : ""
                        } ${on ? "bg-cyan-50" : "bg-white"}`}
                      >
                        <Ionicons
                          name={on ? "checkbox" : "square-outline"}
                          size={18}
                          color={on ? "#0891b2" : "#cbd5e1"}
                        />
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>
                            {bird.birdName || "Unnamed"}
                          </Text>
                          <Text className="text-xs text-slate-500" numberOfLines={1}>
                            {[bird.band, bird.color, fullName(item.eventInventory?.breeder)]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {shown.length > 150 ? (
                  <Text className="mt-2 text-xs text-slate-400">
                    Showing 150 of {shown.length} — search to narrow it. Select all still takes every
                    one.
                  </Text>
                ) : null}
                <ButtonRow>
                  <Button label="Cancel" tone="secondary" onPress={onClose} full />
                  <Button
                    label={`Add ${picked.size} bird${picked.size === 1 ? "" : "s"}`}
                    onPress={copy}
                    pending={action.pending}
                    disabled={picked.size === 0}
                    full
                  />
                </ButtonRow>
              </>
            )
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
