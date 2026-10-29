import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ChoiceList,
  Loading,
  NoAccess,
  Notice,
  Screen,
  Sheet,
  tabular,
} from "@/components/admin/ui";
import type { StatusData, StatusItem } from "@/components/admin/BasketEntries";
import { Caption, personName, ScanField, sexLabel, shortBand } from "@/components/admin/scan";

type Mode = "loft" | "race" | "identify";
type ScanStatus = "ok" | "duplicate" | "foreign" | "unplaced";
type Category = "foreign" | "stray" | "attention" | "duplicate" | "unplaced" | "ok";

interface Scan {
  id: string;
  at: Date;
  rfid: string;
  status: ScanStatus;
  birdId?: number | null;
  band?: string | null;
  birdName?: string | null;
  breeder?: string | null;
  loftName?: string | null;
  color?: string | null;
  sex?: string | null;
  basket?: string | null;
  basketCapacity?: number | null;
  basketCount?: number | null;
  attention?: boolean;
  /** Flagged lost, and turned up again. */
  stray?: boolean;
  note?: string | null;
  /** Set once a foreign bird has been registered under the operator. */
  raceItemId?: number | null;
}

interface Race {
  id: number;
  name: string | null;
  status: string;
  startTime: string | null;
  raceType?: { prizeRole?: string | null } | null;
}

/** Most important flag wins the colour — the portal display's rule. */
function categoryOf(s: Scan): Category {
  if (s.status === "foreign") return "foreign";
  if (s.stray) return "stray";
  if (s.attention) return "attention";
  if (s.status === "duplicate") return "duplicate";
  if (s.status === "unplaced") return "unplaced";
  return "ok";
}

const STYLE: Record<Category, { label: string; solid: string; ink: string; soft: string }> = {
  ok: { label: "Basketed", solid: "bg-green-600", ink: "text-white", soft: "border-green-500 bg-green-50" },
  attention: { label: "Pay attention", solid: "bg-yellow-400", ink: "text-black", soft: "border-yellow-500 bg-yellow-50" },
  stray: { label: "Lost → stray", solid: "bg-orange-500", ink: "text-white", soft: "border-orange-500 bg-orange-50" },
  foreign: { label: "Foreign", solid: "bg-red-600", ink: "text-white", soft: "border-red-500 bg-red-50" },
  unplaced: { label: "No basket", solid: "bg-sky-600", ink: "text-white", soft: "border-sky-500 bg-sky-50" },
  duplicate: { label: "Already scanned", solid: "bg-gray-500", ink: "text-white", soft: "border-gray-400 bg-gray-50" },
};

const TITLES: Record<Mode, { title: string; hint: string }> = {
  loft: {
    title: "Scan to place — loft",
    hint: "Each read says which loft basket the bird belongs in. Nothing is changed.",
  },
  race: {
    title: "Prescan — race baskets",
    hint: "Each read marks the bird basketed for this race and says which basket it goes in.",
  },
  identify: {
    title: "Bird prescan",
    hint: "Scan any tag to identify the bird and its breeder. Read-only — no assignments made.",
  },
};

/** Basketing for hot spot N → hot spot N-1; otherwise the latest race already flown. */
function autoReference(races: Race[], currentId: number | null): Race | undefined {
  const current = races.find((r) => r.id === currentId);
  const hs = current?.raceType?.prizeRole?.match(/^HOTSPOT_(\d)$/);
  if (hs && Number(hs[1]) > 1) {
    const prev = races.find((r) => r.raceType?.prizeRole === `HOTSPOT_${Number(hs[1]) - 1}`);
    if (prev) return prev;
  }
  return races
    .filter((r) => r.id !== currentId && r.status !== "REGISTERING")
    .sort((a, b) => (b.startTime ?? "").localeCompare(a.startTime ?? ""))[0];
}

/**
 * The scanning station, and the display that goes with it.
 *
 * In the portal these are two windows: the dialog that takes the reads, and a
 * big-screen popup beside it that shows what the last read meant — the basket
 * in letters readable across a room, how many birds are still to come, where
 * this bird finished at the previous hot spot, where it stands on average. The
 * popup holds nothing of its own; the scanning tab feeds it.
 *
 * A phone is both at once, so they are one screen here: the field the tag
 * lands in at the top, and everything the display shows underneath it. The
 * colours and the order of precedence between them are the portal's, because
 * somebody who has learned that red means "not ours" should not have to learn
 * it again.
 *
 * Three jobs share it, as they share the portal's tab:
 *  - loft: look the bird up and say which loft basket Set Baskets gave it;
 *  - race: mark the bird basketed for one race and say its race basket;
 *  - identify: say whose bird this is, and change nothing at all.
 */
export default function EventScan() {
  const params = useLocalSearchParams<{
    eventId?: string;
    name?: string;
    mode?: string;
    raceId?: string;
    raceName?: string;
  }>();
  const { eventId, name } = params;
  const mode: Mode = params.mode === "race" || params.mode === "identify" ? params.mode : "loft";
  const raceId = params.raceId ? Number(params.raceId) : null;

  const { can, canAny } = usePermissions();
  const toast = useToast();
  const router = useRouter();

  const [scans, setScans] = useState<Scan[]>([]);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState(false);
  // "auto" or a race id, and an average config id or null for off.
  const [refChoice, setRefChoice] = useState<"auto" | number>("auto");
  const [avgChoice, setAvgChoice] = useState<number | null>(null);

  const lock = useRef(false);
  const placed = useRef<Set<string>>(new Set());
  const seq = useRef(0);

  const mayRaces = canAny("races.view", "races.manage");
  const mayStatus = canAny("checkin.view", "checkin.manage");
  const base = eventId ? `/admin/event/${eventId}/baskets` : null;

  // Every bird of the season: the "yet to scan" figure, and for identify the
  // lookup itself.
  const statusReq = useAdminData<StatusData>(
    eventId && mayStatus ? `/admin/event/${eventId}/checkin-status` : null,
    [eventId]
  );
  const racesReq = useAdminData<{ races?: Race[] }>(
    eventId && mayRaces ? `/admin/race?eventId=${eventId}` : null,
    [eventId]
  );
  // How many birds this race expects, so the race prescan can count down.
  const raceItemsReq = useAdminData<{ raceItems?: unknown[] }>(
    mode === "race" && raceId && mayRaces ? `/admin/race-item?raceId=${raceId}` : null,
    [raceId]
  );

  const races = useMemo(() => racesReq.data?.races ?? [], [racesReq.data]);
  const refRace =
    refChoice === "auto" ? autoReference(races, raceId) : races.find((r) => r.id === refChoice);

  const refItemsReq = useAdminData<{
    raceItems?: { bird?: { id?: number } | null; birdPosition?: number | null }[];
  }>(refRace ? `/admin/race-item?raceId=${refRace.id}` : null, [refRace?.id]);

  // Averages sit behind races.view exactly.
  const avgReq = useAdminData<{ id: number; name: string }[]>(
    eventId && can("races.view") ? `/admin/event/${eventId}/averages` : null,
    [eventId]
  );
  const avgConfigs = Array.isArray(avgReq.data) ? avgReq.data : [];
  const avgConfig = avgConfigs.find((c) => c.id === avgChoice);
  const avgResultsReq = useAdminData<{
    results?: { birdId: number; rank: number | null; avgSpeedYPM: number | null }[];
  }>(
    eventId && avgConfig ? `/admin/event/${eventId}/averages/${avgConfig.id}/results` : null,
    [eventId, avgConfig?.id]
  );

  const positionByBird = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of refItemsReq.data?.raceItems ?? []) {
      if (i.bird?.id && i.birdPosition) m.set(i.bird.id, i.birdPosition);
    }
    return m;
  }, [refItemsReq.data]);

  const averageByBird = useMemo(() => {
    const m = new Map<number, { rank: number | null; speed: number | null }>();
    for (const r of avgResultsReq.data?.results ?? []) {
      m.set(r.birdId, { rank: r.rank, speed: r.avgSpeedYPM });
    }
    return m;
  }, [avgResultsReq.data]);

  const items = useMemo(() => statusReq.data?.items ?? [], [statusReq.data]);
  const byRfid = useMemo(() => {
    const m = new Map<string, StatusItem>();
    for (const item of items) if (item.bird?.rfid) m.set(item.bird.rfid, item);
    return m;
  }, [items]);

  const push = (scan: Omit<Scan, "id" | "at">) => {
    seq.current += 1;
    // Capped: enough for one basketing session, as the portal keeps it.
    setScans((prev) => [{ ...scan, id: String(seq.current), at: new Date() }, ...prev].slice(0, 2000));
  };

  const seenBefore = (rfid: string) => scans.find((s) => s.rfid === rfid && s.status !== "duplicate");

  /* --- loft: where does this bird go? --- */
  const readLoft = async (rfid: string) => {
    if (placed.current.has(rfid)) {
      const prev = seenBefore(rfid);
      push({ ...(prev ?? {}), rfid, status: "duplicate" });
      return;
    }
    const { data: d } = await api.post(`${base}/prescan-loft`, { rfid });
    if (d?.status === "foreign") {
      push({ rfid, status: "foreign" });
      return;
    }
    const shown = {
      rfid,
      birdId: d?.bird?.id ?? null,
      band: d?.bird?.band ?? null,
      birdName: d?.bird?.birdName ?? null,
      breeder: personName(d?.breeder) || null,
      loftName: d?.loftName ?? null,
      color: d?.bird?.color ?? null,
      sex: sexLabel(d?.bird?.sex) || null,
      attention: !!d?.bird?.attention,
      stray: d?.bird?.isLost === 1,
      note: d?.bird?.note ?? null,
    };
    if (d?.status === "unassigned") {
      push({ ...shown, status: "unplaced" });
      return;
    }
    placed.current.add(rfid);
    push({
      ...shown,
      status: "ok",
      basket: d?.basket?.label ?? null,
      basketCapacity: d?.basket?.capacity ?? null,
      basketCount: d?.basket?.count ?? null,
    });
  };

  /* --- race: mark it basketed, say its basket --- */
  const readRace = async (rfid: string) => {
    const { data: d } = await api.post(`${base}/prescan-race`, { rfid, raceId });
    push({
      rfid,
      status: d?.status === "scanned" ? "ok" : d?.status === "already_scanned" ? "duplicate" : "foreign",
      birdId: d?.bird?.id ?? null,
      band: d?.bird?.band ?? null,
      birdName: d?.bird?.birdName ?? null,
      basket: d?.basketLabel ?? null,
      attention: !!d?.bird?.attention,
      stray: d?.bird?.isLost === 1,
      note: d?.bird?.note ?? null,
    });
  };

  /* --- identify: whose bird is this? Nothing is written. --- */
  const readIdentify = (rfid: string) => {
    const item = byRfid.get(rfid);
    push({
      rfid,
      status: seenBefore(rfid) ? "duplicate" : !item ? "foreign" : item.isLoftBasketed ? "ok" : "unplaced",
      birdId: item?.bird?.id ?? null,
      band: item?.bird?.band ?? null,
      birdName: item?.bird?.birdName ?? null,
      breeder: personName(item?.breeder) || null,
      color: item?.bird?.color ?? null,
      sex: sexLabel(item?.bird?.sex) || null,
      basket: item?.loftBasketLabel ?? null,
      attention: !!item?.bird?.attention,
      stray: !!item?.isLost,
      note: item?.bird?.note ?? null,
    });
  };

  const onRead = async (raw: string) => {
    const rfid = raw.trim();
    if (!rfid || lock.current) return;
    if (mode === "identify") {
      readIdentify(rfid);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      if (mode === "loft") await readLoft(rfid);
      else await readRace(rfid);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "That scan lookup failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  /**
   * A bird nobody entered, standing in the basketing queue.
   *
   * The server registers it under the operator's own breeder record so it can
   * fly and be sorted out afterwards — which is why it refuses when the
   * operator has no breeder profile, and says so.
   */
  const addForeign = async (scan: Scan) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const { data: d } = await api.post(`${base}/prescan-race`, {
        rfid: scan.rfid,
        raceId,
        action: "register_foreign",
      });
      setScans((prev) =>
        prev.map((s) =>
          s.rfid === scan.rfid
            ? {
                ...s,
                status: "ok",
                birdId: d?.bird?.id ?? null,
                band: d?.bird?.band ?? s.rfid,
                birdName: d?.bird?.birdName ?? null,
                raceItemId: d?.raceItemId ?? null,
              }
            : s
        )
      );
      toast.success("Bird registered under your name, for reassigning later.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "That bird could not be registered.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const removeForeign = async (scan: Scan) => {
    if (scan.raceItemId) {
      try {
        await api.delete(`${base}/prescan-race`, { data: { raceItemId: scan.raceItemId } });
      } catch {
        // Best effort, as in the portal: the row leaves the list either way.
      }
    }
    setScans((prev) => prev.filter((s) => s.rfid !== scan.rfid));
  };

  if ((mode === "loft" || mode === "race") && !can("baskets.manage")) {
    return <NoAccess what="Basket scanning" />;
  }
  if (mode === "identify" && (!mayStatus || statusReq.forbidden)) {
    return <NoAccess what="Bird prescan" />;
  }

  const firsts = scans.filter((s) => s.status !== "duplicate");
  const uniqueKnown = new Set(firsts.filter((s) => s.status !== "foreign").map((s) => s.rfid)).size;

  // Birds this station still expects to see; null when it cannot be known.
  let remaining: number | null = null;
  if (mode === "loft" && statusReq.data?.items) {
    remaining = Math.max(0, items.filter((i) => i.isLoftBasketed).length - placed.current.size);
  } else if (mode === "race" && raceItemsReq.data?.raceItems) {
    remaining = Math.max(0, raceItemsReq.data.raceItems.length - uniqueKnown);
  } else if (mode === "identify" && statusReq.data?.items) {
    remaining = Math.max(0, items.length - uniqueKnown);
  }

  const tally = new Map<string, { count: number; capacity: number | null }>();
  for (const s of firsts) {
    if (s.status !== "ok" || !s.basket) continue;
    const b = tally.get(s.basket) ?? { count: 0, capacity: s.basketCapacity ?? null };
    b.count += 1;
    tally.set(s.basket, b);
  }
  const baskets = [...tally.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  const tiles: { label: string; value: number | string; box: string; ink: string }[] = [
    { label: "Yet to scan", value: remaining ?? "—", box: "border border-slate-300 bg-white", ink: "text-slate-950" },
    { label: "Scanned", value: firsts.length, box: "bg-slate-800", ink: "text-white" },
    { label: "Basketed", value: firsts.filter((s) => s.status === "ok").length, box: STYLE.ok.solid, ink: STYLE.ok.ink },
    { label: "Pay attention", value: firsts.filter((s) => s.attention).length, box: STYLE.attention.solid, ink: STYLE.attention.ink },
    { label: "Lost → stray", value: firsts.filter((s) => s.stray).length, box: STYLE.stray.solid, ink: STYLE.stray.ink },
    { label: "Foreign", value: firsts.filter((s) => categoryOf(s) === "foreign").length, box: STYLE.foreign.solid, ink: STYLE.foreign.ink },
    { label: "No basket", value: firsts.filter((s) => s.status === "unplaced").length, box: STYLE.unplaced.solid, ink: STYLE.unplaced.ink },
    { label: "Already scanned", value: scans.length - firsts.length, box: STYLE.duplicate.solid, ink: STYLE.duplicate.ink },
  ];

  const last = scans[0];
  const lastCat = last ? categoryOf(last) : null;
  const lastPosition = last?.birdId ? positionByBird.get(last.birdId) : undefined;
  const lastAverage = last?.birdId ? averageByBird.get(last.birdId) : undefined;
  const raceLabel = (r: Race) => r.name ?? `Race ${r.id}`;

  const subtitle = [name, params.raceName].filter(Boolean).join(" · ") || undefined;
  const missingRace = mode === "race" && !raceId;
  const waiting = mode === "identify" && statusReq.loading;

  return (
    <Screen
      title={TITLES[mode].title}
      subtitle={subtitle}
      header={
        <>
          <Pressable onPress={() => router.back()} className="mb-2 flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={16} color="#2563eb" />
            <Text className="text-sm font-medium text-blue-600">Baskets</Text>
          </Pressable>
          <Text className="mb-2 text-xs text-slate-500">{TITLES[mode].hint}</Text>
          {missingRace ? (
            <Notice>Open this from a race's baskets, so it knows which race is being basketed.</Notice>
          ) : waiting ? (
            <Loading />
          ) : (
            <ScanField onRead={onRead} pending={busy} />
          )}
        </>
      }
    >
      {/* The tiles the big screen shows across its top. */}
      <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
        {tiles.map((t) => (
          <View
            key={t.label}
            className={`rounded-xl px-3 py-2 ${t.box}`}
            style={{ flexGrow: 1, flexBasis: "22%", minWidth: 76 }}
          >
            <Text className={`text-[10px] font-medium ${t.ink}`} numberOfLines={1}>
              {t.label}
            </Text>
            <Text className={`text-2xl font-bold ${t.ink}`} style={tabular}>
              {t.value}
            </Text>
          </View>
        ))}
      </View>

      {/* The last read, in the colour of what it means. */}
      <View className={`mt-3 rounded-2xl p-4 ${lastCat ? STYLE[lastCat].solid : "bg-slate-800"}`}>
        {!last || !lastCat ? (
          <Text className="py-6 text-center text-base text-slate-300">Scan a bird to begin</Text>
        ) : (
          <>
            <Text className={`text-xs font-semibold uppercase tracking-wide ${STYLE[lastCat].ink}`}>
              {STYLE[lastCat].label}
              {last.attention && lastCat !== "attention" ? " · Pay attention" : ""}
              {last.stray && lastCat !== "stray" ? " · Lost → stray" : ""}
              {last.status === "duplicate" && lastCat !== "duplicate" ? " · Already scanned" : ""}
              {last.status === "unplaced" && lastCat !== "unplaced" ? " · No basket" : ""}
            </Text>
            <View className="mt-1 flex-row items-end justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className={`text-2xl font-bold ${STYLE[lastCat].ink}`} numberOfLines={1}>
                  {shortBand(last.band) || last.rfid}
                </Text>
                {last.birdName ? (
                  <Text className={`text-base font-semibold ${STYLE[lastCat].ink}`}>{last.birdName}</Text>
                ) : null}
                {last.breeder || last.loftName ? (
                  <Text className={`text-sm ${STYLE[lastCat].ink}`}>
                    {[last.breeder, last.loftName].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
                {last.status === "foreign" ? (
                  <Text className={`text-sm ${STYLE[lastCat].ink}`}>
                    {mode === "race" ? "Not entered in this race" : "Not registered in this event"}
                  </Text>
                ) : (
                  <Text className={`text-xs ${STYLE[lastCat].ink}`}>
                    {[last.color, last.sex, `EID ${last.rfid}`].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </View>
              <View className="items-end">
                <Text className={`text-[10px] font-semibold uppercase tracking-wide ${STYLE[lastCat].ink}`}>
                  Basket
                </Text>
                <Text className={`text-3xl font-black ${STYLE[lastCat].ink}`}>{last.basket || "—"}</Text>
                {last.basketCapacity != null && last.basketCount != null ? (
                  <Text className={`text-xs ${STYLE[lastCat].ink}`} style={tabular}>
                    {last.basketCount}/{last.basketCapacity}
                  </Text>
                ) : null}
              </View>
            </View>

            {last.status === "unplaced" && mode === "loft" ? (
              <Text className={`mt-2 text-sm ${STYLE[lastCat].ink}`}>
                Not in a loft basket — run Set Baskets, or it was skipped.
              </Text>
            ) : null}
            {last.note ? (
              <Text className={`mt-2 text-sm italic ${STYLE[lastCat].ink}`}>{last.note}</Text>
            ) : null}

            {(refRace || avgConfig) && last.status !== "foreign" ? (
              <View className="mt-3 flex-row gap-3">
                {refRace ? (
                  <View className="flex-1 rounded-xl bg-black/15 px-3 py-2">
                    <Text
                      className={`text-[10px] font-semibold uppercase tracking-wide ${STYLE[lastCat].ink}`}
                      numberOfLines={1}
                    >
                      Position · {raceLabel(refRace)}
                    </Text>
                    <Text className={`text-xl font-black ${STYLE[lastCat].ink}`} style={tabular}>
                      {lastPosition ? `#${lastPosition}` : "—"}
                    </Text>
                  </View>
                ) : null}
                {avgConfig ? (
                  <View className="flex-1 rounded-xl bg-black/15 px-3 py-2">
                    <Text
                      className={`text-[10px] font-semibold uppercase tracking-wide ${STYLE[lastCat].ink}`}
                      numberOfLines={1}
                    >
                      Average · {avgConfig.name}
                    </Text>
                    <Text className={`text-xl font-black ${STYLE[lastCat].ink}`} style={tabular}>
                      {lastAverage?.rank ? `#${lastAverage.rank}` : "—"}
                      {lastAverage?.speed != null ? (
                        <Text className="text-xs font-semibold"> {lastAverage.speed.toFixed(2)} ypm</Text>
                      ) : null}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {mode === "race" && last.status === "foreign" ? (
              <View className="mt-3 flex-row" style={{ gap: 8 }}>
                <Button label="Add bird" tone="secondary" icon="add" onPress={() => addForeign(last)} pending={busy} />
                <Button label="Remove" tone="secondary" icon="close" onPress={() => removeForeign(last)} />
              </View>
            ) : null}
          </>
        )}
      </View>

      {mayRaces ? (
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="min-w-0 flex-1 text-xs text-slate-500" numberOfLines={1}>
            Position from {refRace ? raceLabel(refRace) : "—"}
            {avgConfig ? ` · average ${avgConfig.name}` : ""}
          </Text>
          <Pressable onPress={() => setOptions(true)} hitSlop={8}>
            <Text className="text-xs font-medium text-cyan-700">Change</Text>
          </Pressable>
        </View>
      ) : null}

      {baskets.length > 0 ? (
        <>
          <Caption>Baskets</Caption>
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {baskets.map(([label, b]) => {
              const isFull = b.capacity != null && b.count >= b.capacity;
              return (
                <View key={label} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <Text className="text-xs font-semibold text-slate-900">{label}</Text>
                  <Text
                    className={`text-xs ${isFull ? "text-rose-600" : "text-slate-500"}`}
                    style={tabular}
                  >
                    {b.count}
                    {b.capacity != null ? ` / ${b.capacity}` : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <View className="flex-row items-center justify-between">
        <Caption>Scans ({scans.length})</Caption>
        {scans.length > 0 ? (
          <Pressable
            onPress={() => {
              setScans([]);
              placed.current = new Set();
            }}
            hitSlop={8}
            className="mt-3"
          >
            <Text className="text-xs font-medium text-slate-600">Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {scans.length === 0 ? (
        <Text className="text-xs text-slate-400">No scans yet.</Text>
      ) : (
        <View style={{ gap: 4 }}>
          {scans.slice(0, 150).map((s, i) => {
            const cat = categoryOf(s);
            return (
              <View
                key={s.id}
                className={`flex-row items-center gap-2 rounded-lg border-l-4 px-3 py-2 ${STYLE[cat].soft}`}
              >
                <Text className="w-7 text-xs text-slate-400" style={tabular}>
                  {scans.length - i}
                </Text>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
                    {shortBand(s.band) || s.rfid}
                  </Text>
                  <Text className="text-xs text-slate-600" numberOfLines={1}>
                    {[s.birdName, s.breeder].filter(Boolean).join(" · ") || "—"} ·{" "}
                    {s.at.toLocaleTimeString()}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-slate-900">{s.basket || "—"}</Text>
                  <Text className="text-[10px] font-semibold text-slate-600">
                    {[
                      STYLE[cat].label,
                      s.attention && cat !== "attention" ? "Attention" : null,
                      s.stray && cat !== "stray" ? "Stray" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                {mode === "race" && s.status === "foreign" ? (
                  <View style={{ gap: 4 }}>
                    <Pressable onPress={() => addForeign(s)} hitSlop={4}>
                      <Text className="text-xs font-medium text-cyan-700">Add bird</Text>
                    </Pressable>
                    <Pressable onPress={() => removeForeign(s)} hitSlop={4}>
                      <Text className="text-xs font-medium text-rose-600">Remove</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
          {scans.length > 150 ? (
            <Text className="mt-1 text-center text-xs text-slate-400">
              Showing the latest 150 of {scans.length}.
            </Text>
          ) : null}
        </View>
      )}

      <Caption>Legend</Caption>
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {(Object.keys(STYLE) as Category[]).map((c) => (
          <View key={c} className={`rounded-md px-2.5 py-1 ${STYLE[c].solid}`}>
            <Text className={`text-xs font-semibold ${STYLE[c].ink}`}>{STYLE[c].label}</Text>
          </View>
        ))}
      </View>

      <Sheet
        open={options}
        onClose={() => setOptions(false)}
        title="What the display adds"
        subtitle="Shown beside each bird as it is scanned"
      >
        <Caption>Position from</Caption>
        <ChoiceList
          choices={[
            {
              key: "auto",
              label: "Auto",
              hint:
                refChoice === "auto" && refRace
                  ? `Currently ${raceLabel(refRace)}`
                  : "The previous hot spot, or the latest race flown",
            },
            ...races
              .filter((r) => r.id !== raceId)
              .map((r) => ({ key: r.id, label: raceLabel(r), hint: r.status.toLowerCase() })),
          ]}
          selected={refChoice}
          onPick={(k) => setRefChoice(k === "auto" ? "auto" : Number(k))}
        />

        <Caption>Average</Caption>
        <ChoiceList
          choices={[
            { key: 0, label: "Off" },
            ...avgConfigs.map((c) => ({ key: c.id, label: c.name })),
          ]}
          selected={avgChoice ?? 0}
          onPick={(k) => setAvgChoice(Number(k) === 0 ? null : Number(k))}
        />
        {avgConfigs.length === 0 ? (
          <Text className="mt-2 text-xs text-slate-400">
            No averages have been set up for this season.
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
