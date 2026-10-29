import { BETTING_ENABLED } from "@/constants/features";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { downloadAndShare } from "@/service/download.service";
import { PhantomSheet } from "@/components/admin/PhantomSheet";
import { RaceFormSheet } from "@/components/admin/RaceFormSheet";
import {
  ArrivalGroupsSheet,
  RaceItemSheet,
  RaceScanSheet,
  RecalculateSheet,
  StartRaceSheet,
  StatusVisibilitySheet,
  WindRouteSheet,
} from "@/components/admin/RaceSheets";
import { RaceTrackMap } from "@/components/RaceTrackMap";
import {
  type AdminRace,
  type AdminRaceItem,
  bandOf,
  breederOf,
  CheckRow,
  clock,
  isUnpaid,
  ITEM_STATUS,
  itemStatus,
  Label,
  Pills,
  RACE_STATUS,
  raceLabel,
} from "@/components/admin/raceParts";
import {
  Button,
  ButtonRow,
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
  SearchBar,
  SectionTitle,
  Sheet,
  Truncated,
  money,
} from "@/components/admin/ui";

interface Track {
  transportStatus: string | null;
  transportStartedAt: string | null;
  latest: { recordedAt: string } | null;
  pings: unknown[];
}

/** The portal's four counting chips; "released" counts everything that went up. */
const CHIPS: { key: string; label: string; values: string[] }[] = [
  { key: "loft", label: "Loft basketed", values: ["LOFT_BASKETED"] },
  { key: "released", label: "Released", values: ["RELEASED", "ARRIVED", "FOREIGN_BIRD"] },
  { key: "arrived", label: "Arrived", values: ["ARRIVED"] },
  { key: "foreign", label: "Foreign", values: ["FOREIGN_BIRD"] },
];

const EXPORTS = [
  { key: "pdf", label: "PDF", hint: "For printing and handing round" },
  { key: "xlsx", label: "Spreadsheet", hint: "Opens in Excel or Sheets" },
  { key: "csv", label: "CSV", hint: "Plain text, for importing elsewhere" },
];

const SHOWN = 300;

/** "HH:MM" to minutes past midnight, or null when it is not a time. */
const minutes = (raw: string) => {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? +m[1] * 60 + +m[2] : null;
};

const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m ago`;
};

/**
 * One control on the race.
 *
 * At module scope rather than inside the screen: a component declared during
 * render is a fresh type every time, so React tears the buttons down and
 * rebuilds them on each poll of the arrivals list — which on a live race is
 * every twenty seconds, under somebody's thumb.
 */
function Tool({
  label,
  icon,
  onPress,
  tone = "neutral",
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: "neutral" | "primary" | "danger";
}) {
  const bg = tone === "primary" ? "bg-emerald-600" : tone === "danger" ? "bg-rose-600" : "bg-white";
  const border = tone === "neutral" ? "border border-slate-200" : "";
  const fg = tone === "neutral" ? "text-slate-700" : "text-white";
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-center gap-2 rounded-xl px-3 py-3 ${bg} ${border}`}
      style={{ flexGrow: 1, flexBasis: "47%" }}
    >
      <Ionicons name={icon} size={16} color={tone === "neutral" ? "#334155" : "#ffffff"} />
      <Text className={`text-sm font-medium ${fg}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

type Open =
  | "start"
  | "end"
  | "recalc"
  | "corrections"
  | "scan"
  | "edit"
  | "note"
  | "betting"
  | "groups"
  | "visibility"
  | "wind"
  | "export"
  | "filter"
  | "transportStart"
  | "transportStop"
  | null;

/**
 * One race, with everything the portal's race page does to it.
 *
 * The top half moves the race through its day: start, end, scan, correct,
 * recalculate. Starting and ending cannot be undone and recalculating rewrites
 * prize money, so each of those stops for a sentence first — and recalculating
 * shows what would change before it is allowed to change it.
 *
 * The bottom half is the result table. A table that wide does not fit a phone,
 * so a row shows what is read at a glance — place, band, time, prize — and
 * opens onto the rest, which is also where a bird's status is changed by hand.
 *
 * Controls somebody was not granted are absent rather than greyed: reading a
 * race needs races.view, changing it races.manage, and rebuilding its result is
 * its own permission.
 */
export default function AdminRaceDetail() {
  const { raceId } = useLocalSearchParams<{ raceId?: string }>();
  const { can, canAny } = usePermissions();
  const router = useRouter();
  const toast = useToast();
  const action = useAdminAction();

  const [open, setOpen] = useState<Open>(null);
  const [picked, setPicked] = useState<AdminRaceItem | null>(null);
  const [note, setNote] = useState("");
  const [exporting, setExporting] = useState(false);

  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const raceReq = useAdminData<{ race?: AdminRace }>(
    raceId ? `/admin/race?raceId=${raceId}` : null,
    [raceId]
  );
  const itemsReq = useAdminData<{ raceItems?: AdminRaceItem[] }>(
    raceId ? `/admin/race-item?raceId=${raceId}` : null,
    [raceId]
  );

  const race = raceReq.data?.race ?? null;
  const items = useMemo(() => itemsReq.data?.raceItems ?? [], [itemsReq.data]);

  const canManage = can("races.manage");
  const moving = race?.transportStatus != null && race.transportStatus !== "IDLE";

  // The admin track carries what the public one does not need to: how fresh the
  // last fix is. Only asked for while the transport is actually out.
  const trackReq = useAdminData<Track>(
    canManage && race && moving ? `/admin/race/${race.id}/track` : null,
    [canManage, race?.id, moving]
  );

  const reloadAll = () => {
    raceReq.reload();
    itemsReq.reload();
  };

  // While a race is in the air the arrivals list is the whole point of the
  // screen, so it refreshes itself rather than waiting to be pulled.
  useEffect(() => {
    if (race?.status !== "STARTED") return;
    const timer = setInterval(() => {
      raceReq.reload();
      itemsReq.reload();
    }, 20_000);
    return () => clearInterval(timer);
    // The reload functions are recreated per request; the race id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race?.status, race?.id]);

  const counts = useMemo(() => {
    const raw: Record<string, number> = {};
    for (const i of items) raw[i.status] = (raw[i.status] ?? 0) + 1;
    return raw;
  }, [items]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const lo = minutes(from);
    const hi = minutes(to);
    return items.filter((i) => {
      if (statuses.length > 0 && !statuses.includes(i.status)) return false;
      if (unpaidOnly && !isUnpaid(i)) return false;
      // As in the portal, the window only tests birds that have a time at all.
      if ((lo != null || hi != null) && i.arrivalTime) {
        const d = new Date(i.arrivalTime);
        const at = d.getHours() * 60 + d.getMinutes();
        if (lo != null && at < lo) return false;
        if (hi != null && at > hi) return false;
      }
      if (!q) return true;
      return `${i.bird?.band ?? ""} ${bandOf(i)} ${i.bird?.birdName ?? ""} ${breederOf(i)} ${
        i.eventInventoryItem?.eventInventory?.loft ?? ""
      }`
        .toLowerCase()
        .includes(q);
    });
  }, [items, query, statuses, unpaidOnly, from, to]);

  const filtered = statuses.length > 0 || unpaidOnly || from.trim() !== "" || to.trim() !== "";
  const clearAll = () => {
    setStatuses([]);
    setUnpaidOnly(false);
    setFrom("");
    setTo("");
    setQuery("");
  };

  if (!canAny("races.view", "races.manage") || raceReq.forbidden) return <NoAccess what="This race" />;
  if (raceReq.loading) return <Loading />;

  if (!race) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-center text-sm text-slate-500">
          {raceReq.error ?? "That race could not be found."}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-sm font-medium text-blue-600">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const eventId = race.seasonRel?.event?.id ?? null;
  const tone = RACE_STATUS[race.status] ?? RACE_STATUS.ENDED;
  const arrived = items.filter((i) => i.arrivalTime != null).length;
  const close = () => setOpen(null);

  const endRace = async () => {
    const { ok, data } = await action.run<{ lostCount?: number; recoveredCount?: number }>(
      "post",
      `/admin/race/${race.id}/end`
    );
    if (ok) {
      toast.success(
        `Race ended. ${data?.lostCount ?? 0} marked lost, ${data?.recoveredCount ?? 0} recovered.`
      );
      close();
      reloadAll();
    }
  };

  const transport = async (which: "start" | "stop") => {
    const { ok } = await action.run("post", `/admin/race/${race.id}/transport/${which}`, undefined, {
      success: which === "start" ? "Transport started." : "Transport stopped.",
    });
    if (ok) {
      close();
      raceReq.reload();
    }
  };

  const toggleBetting = async () => {
    const { ok, data } = await action.run<{ bettingOpen?: boolean }>(
      "post",
      `/admin/race/${race.id}/betting/toggle`
    );
    if (ok) {
      toast.success(data?.bettingOpen ? "Betting is open." : "Betting is closed.");
      close();
      raceReq.reload();
    }
  };

  const saveNote = async () => {
    const { ok } = await action.run(
      "put",
      "/admin/race",
      { raceId: race.id, description: note.trim() },
      { success: "Description updated." }
    );
    if (ok) {
      close();
      raceReq.reload();
    }
  };

  const runExport = async (format: string | number) => {
    setExporting(true);
    const query = `format=${format}&raceId=${race.id}${eventId != null ? `&eventId=${eventId}` : ""}`;
    const result = await downloadAndShare(
      `/breeder/export/results?${query}`,
      `race-${race.id}-results.${format}`
    );
    setExporting(false);
    if (result.ok) close();
    else if (result.problem) toast.error(result.problem);
  };

  const conditions = (temp: string | null, weather: string | null, wind: string | null) =>
    [temp ? `${temp}°` : null, weather, wind].filter(Boolean).join(" · ") || "not recorded";

  return (
    <Screen
      title={race.description || raceLabel(race)}
      subtitle={[
        race.seasonRel?.event?.name ?? "Event",
        race.raceType?.name ?? "Race",
        race.location,
        `ID ${race.id}`,
      ]
        .filter(Boolean)
        .join(" · ")}
      onRefresh={() => {
        raceReq.refresh();
        itemsReq.refresh();
      }}
      refreshing={raceReq.refreshing || itemsReq.refreshing}
      header={
        <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-1" hitSlop={8}>
            <Ionicons name="chevron-back" size={16} color="#2563eb" />
            <Text className="text-sm font-medium text-blue-600">Races</Text>
          </Pressable>
          <View className={`rounded-full px-2 py-0.5 ${tone.bg}`}>
            <Text className={`text-[10px] font-medium ${tone.text}`}>{tone.label}</Text>
          </View>
          {race.isPrivate ? (
            <View className="rounded-full bg-amber-100 px-2 py-0.5">
              <Text className="text-[10px] font-medium text-amber-700">private</Text>
            </View>
          ) : null}
          {race.bettingOpen ? (
            <View className="rounded-full bg-emerald-100 px-2 py-0.5">
              <Text className="text-[10px] font-medium text-emerald-700">betting open</Text>
            </View>
          ) : null}
        </View>
      }
    >
      {raceReq.error ? <Notice>{raceReq.error}</Notice> : null}

      <Pressable
        onPress={
          canManage
            ? () => {
                setNote(race.description ?? "");
                setOpen("note");
              }
            : undefined
        }
        className="mt-3 flex-row items-start gap-2"
      >
        <Text className="flex-1 text-sm text-slate-600">
          <Text className="text-slate-400">Description / note: </Text>
          {race.description || "—"}
        </Text>
        {canManage ? <Ionicons name="create-outline" size={16} color="#64748b" /> : null}
      </Pressable>

      <FigureRow>
        <Figure
          label={race.startTime ? `Start · ${clock(race.startTime)}` : "Start time"}
          value={race.startTime ? new Date(race.startTime).toLocaleDateString() : "—"}
          basis="31%"
        />
        <Figure label="Miles" value={race.distance ?? "—"} basis="31%" />
        <Figure
          label="Sunrise / sunset"
          value={`${clock(race.sunrise)} / ${clock(race.sunset)}`}
          basis="31%"
        />
        <Figure label="Birds entered" value={items.length} basis="31%" />
        <Figure label="Clocked in" value={arrived} tone="text-emerald-600" basis="31%" />
        <Figure
          label="Prize money"
          value={money(items.reduce((s, i) => s + (i.prizeValue ?? 0), 0))}
          tone="text-blue-600"
          basis="31%"
        />
      </FigureRow>

      <View className="mt-3">
        <Rows>
          <Row
            title="Release conditions"
            subtitle={conditions(race.temperature, race.weather, race.wind)}
          />
          <Row
            title="Arrival conditions"
            subtitle={conditions(race.arrivalTemperature, race.arrivalWeather, race.arrivalWind)}
          />
          {race.endTime ? (
            <Row title="Ended" subtitle={new Date(race.endTime).toLocaleString()} />
          ) : null}
        </Rows>
      </View>

      <SectionTitle>Controls</SectionTitle>
      <View className="flex-row flex-wrap" style={{ gap: 10 }}>
        {canManage && race.status === "REGISTERING" ? (
          <Tool
            label="Start race"
            icon="paper-plane-outline"
            tone="primary"
            onPress={() => setOpen("start")}
          />
        ) : null}
        {canManage && race.status === "STARTED" ? (
          <Tool label="End race" icon="flag-outline" tone="danger" onPress={() => setOpen("end")} />
        ) : null}
        {canManage ? (
          <Tool
            label={race.status === "REGISTERING" ? "Loft scan" : "Scan arrivals"}
            icon="scan-outline"
            onPress={() => setOpen("scan")}
          />
        ) : null}
        {canManage ? (
          <Tool
            label="Wedge scanner"
            icon="barcode-outline"
            onPress={() => router.push(`/(admin)/checkin?raceId=${race.id}` as never)}
          />
        ) : null}
        {race.status !== "REGISTERING" ? (
          <Tool
            label="Corrections"
            icon="construct-outline"
            onPress={() => setOpen("corrections")}
          />
        ) : null}
        {can("races.recalculate") && race.status !== "REGISTERING" ? (
          <Tool label="Recalculate" icon="calculator-outline" onPress={() => setOpen("recalc")} />
        ) : null}
        <Tool label="Arrival groups" icon="git-merge-outline" onPress={() => setOpen("groups")} />
        <Tool label="Breeder view" icon="eye-outline" onPress={() => setOpen("visibility")} />
        <Tool label="Wind on route" icon="navigate-outline" onPress={() => setOpen("wind")} />
        <Tool label="Export results" icon="download-outline" onPress={() => setOpen("export")} />
        {canManage ? (
          <Tool label="Edit race" icon="create-outline" onPress={() => setOpen("edit")} />
        ) : null}
        {BETTING_ENABLED && can("betting.manage") && race.status === "REGISTERING" ? (
          <Tool
            label={race.bettingOpen ? "Close betting" : "Open betting"}
            icon="dice-outline"
            onPress={() => setOpen("betting")}
          />
        ) : null}
        {canAny("baskets.view", "baskets.manage") && eventId != null ? (
          <Tool
            label="Baskets"
            icon="cube-outline"
            onPress={() =>
              router.push(
                `/(admin)/event-baskets?eventId=${eventId}&name=${encodeURIComponent(
                  race.seasonRel?.event?.name ?? ""
                )}` as never
              )
            }
          />
        ) : null}
      </View>

      {/* Shown from the moment the race exists, not only once the lorry moves.
          Before transport starts the map is still the answer to "where are we
          going and how far", which is a night-before question; the component
          draws the loft and the liberation point on its own and fills in the
          route as pings arrive. Polling, though, only runs while something is
          actually moving. */}
      <SectionTitle>Route and transport</SectionTitle>
      <RaceTrackMap raceId={race.id} height={240} live={race.status !== "ENDED" && moving} />

      <Text className="mt-2 text-xs text-slate-500">
        Transport {(race.transportStatus ?? "IDLE").toLowerCase().replace(/_/g, " ")}
        {trackReq.data
          ? ` · last fix ${ago(trackReq.data.latest?.recordedAt)} · ${trackReq.data.pings.length} points`
          : ""}
        {race.transportStartedAt ? ` · left ${new Date(race.transportStartedAt).toLocaleString()}` : ""}
      </Text>
      {canManage ? (
        <ButtonRow>
          {race.transportStatus === "IN_TRANSIT" ? (
            <Button
              label="Stop transport"
              tone="secondary"
              icon="bus-outline"
              onPress={() => setOpen("transportStop")}
              full
            />
          ) : (
            <Button
              label="Start transport"
              tone="secondary"
              icon="bus-outline"
              onPress={() => setOpen("transportStart")}
              full
            />
          )}
          <Button
            label="Broadcast position"
            tone="secondary"
            icon="locate-outline"
            onPress={() => router.push(`/(admin)/transport-broadcast?raceId=${race.id}` as never)}
            full
          />
        </ButtonRow>
      ) : null}

      <SectionTitle
        action={
          filtered || query ? (
            <Pressable onPress={clearAll} hitSlop={8}>
              <Text className="text-xs font-medium text-blue-600">Clear all</Text>
            </Pressable>
          ) : undefined
        }
      >
        Race items ({results.length})
      </SectionTitle>

      <Pills
        pills={CHIPS.map((c) => ({
          key: c.key,
          label: c.label,
          lead: c.values.reduce((s, v) => s + (counts[v] ?? 0), 0),
        }))}
        isOn={(k) => {
          const chip = CHIPS.find((c) => c.key === k)!;
          return (
            chip.values.length === statuses.length && chip.values.every((v) => statuses.includes(v))
          );
        }}
        onPress={(k) => {
          const chip = CHIPS.find((c) => c.key === k)!;
          const on =
            chip.values.length === statuses.length && chip.values.every((v) => statuses.includes(v));
          setStatuses(on ? [] : [...chip.values]);
        }}
      />

      <View className="mt-2 flex-row items-center" style={{ gap: 8 }}>
        <View className="flex-1">
          <SearchBar value={query} onChange={setQuery} placeholder="Band, bird, breeder or loft" />
        </View>
        <Pressable
          onPress={() => setOpen("filter")}
          className={`rounded-xl border px-3 py-2.5 ${
            filtered ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"
          }`}
        >
          <Ionicons name="funnel-outline" size={18} color={filtered ? "#2563eb" : "#64748b"} />
        </Pressable>
      </View>

      <View className="mt-3">
        {itemsReq.loading ? (
          <Loading />
        ) : itemsReq.forbidden ? (
          <Notice>The entries of this race are not part of your access.</Notice>
        ) : itemsReq.error ? (
          <Notice>{itemsReq.error}</Notice>
        ) : results.length === 0 ? (
          <Empty>
            {items.length === 0 ? "No birds are entered in this race." : "No bird matches those filters."}
          </Empty>
        ) : (
          <Rows>
            {results.slice(0, SHOWN).map((item) => {
              const who = breederOf(item) || item.eventInventoryItem?.eventInventory?.loft || "Unassigned";
              const unpaid = isUnpaid(item);
              return (
                <View key={item.id} className={unpaid ? "bg-rose-50" : ""}>
                  <Row
                    leading={
                      <View className="w-9 items-center">
                        <Text className="text-sm font-semibold text-slate-900">
                          {item.birdPosition ?? "—"}
                        </Text>
                      </View>
                    }
                    title={`${bandOf(item)}${item.bird?.birdName ? ` · ${item.bird.birdName}` : ""}`}
                    subtitle={`${who}${
                      item.birdPositionHotSpot != null ? ` · hotspot ${item.birdPositionHotSpot}` : ""
                    }${unpaid ? " · unpaid" : ""}`}
                    badge={itemStatus(item.status)}
                    right={
                      item.arrivalTime ? new Date(item.arrivalTime).toLocaleTimeString() : null
                    }
                    rightSub={
                      item.prizeValue != null && item.prizeValue > 0
                        ? `${money(item.prizeValue)}${
                            item.birdDrop != null ? ` · drop ${item.birdDrop}` : ""
                          }`
                        : undefined
                    }
                    onPress={() => setPicked(item)}
                  />
                </View>
              );
            })}
          </Rows>
        )}
        <Truncated shown={Math.min(results.length, SHOWN)} total={results.length} where="a narrower search" />
      </View>

      {/* ---- sheets and confirmations ---- */}

      <StartRaceSheet
        open={open === "start"}
        onClose={close}
        raceId={race.id}
        eventId={eventId}
        onStarted={reloadAll}
      />

      <Confirm
        open={open === "end"}
        title="End the race?"
        body="Clocking closes. Every bird without an arrival is marked lost, positions and prize money are settled, and everyone in the race is told. This cannot be undone from here."
        confirmLabel="End race"
        pending={action.pending}
        onConfirm={endRace}
        onCancel={close}
      />

      <RecalculateSheet open={open === "recalc"} onClose={close} raceId={race.id} onApplied={reloadAll} />

      <PhantomSheet
        open={open === "corrections"}
        onClose={close}
        raceId={race.id}
        items={items}
        onResolved={itemsReq.reload}
        canManage={canManage}
      />

      <RaceScanSheet
        open={open === "scan"}
        onClose={close}
        raceId={race.id}
        raceStatus={race.status}
        onScanned={itemsReq.reload}
      />

      <RaceFormSheet
        open={open === "edit"}
        onClose={close}
        eventId={eventId}
        race={race}
        onSaved={raceReq.reload}
      />

      <ArrivalGroupsSheet
        open={open === "groups"}
        onClose={close}
        raceId={race.id}
        canManage={canManage}
        onChanged={itemsReq.reload}
      />
      <StatusVisibilitySheet
        open={open === "visibility"}
        onClose={close}
        raceId={race.id}
        canManage={canManage}
      />
      <WindRouteSheet open={open === "wind"} onClose={close} raceId={race.id} />

      <RaceItemSheet
        item={picked}
        onClose={() => setPicked(null)}
        eventId={eventId}
        canManage={canManage}
        canPresets={canManage && can("events.manage")}
        onChanged={reloadAll}
      />

      <Sheet open={open === "note"} onClose={close} title="Description / note">
        <Field label="Description" value={note} onChange={setNote} multiline autoFocus />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={close} full />
          <Button label="Save" onPress={saveNote} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={open === "export"}
        onClose={close}
        title="Export results"
        subtitle="The whole race, every breeder — handed to the share sheet"
      >
        {exporting ? (
          <Loading />
        ) : (
          <ChoiceList choices={EXPORTS} onPick={runExport} />
        )}
      </Sheet>

      <Sheet
        open={open === "filter"}
        onClose={close}
        title="Filter race items"
        subtitle={`${results.length} of ${items.length} showing`}
      >
        <Label>Status</Label>
        <Pills
          wrap
          pills={Object.keys(ITEM_STATUS).map((s) => ({
            key: s,
            label: ITEM_STATUS[s].label,
            lead: counts[s] ?? 0,
          }))}
          isOn={(k) => statuses.includes(String(k))}
          onPress={(k) =>
            setStatuses((prev) =>
              prev.includes(String(k)) ? prev.filter((s) => s !== k) : [...prev, String(k)]
            )
          }
        />
        <View className="mt-3">
          <CheckRow
            on={unpaidOnly}
            label="Unpaid only"
            hint="Entry fees not fully paid are shown in red."
            onPress={() => setUnpaidOnly((v) => !v)}
          />
        </View>
        <View className="flex-row" style={{ gap: 8 }}>
          <View className="flex-1">
            <Field label="Arrived from" value={from} onChange={setFrom} placeholder="HH:MM" />
          </View>
          <View className="flex-1">
            <Field label="Arrived to" value={to} onChange={setTo} placeholder="HH:MM" />
          </View>
        </View>
        <ButtonRow>
          <Button label="Clear all" tone="secondary" onPress={clearAll} full />
          <Button label="Done" onPress={close} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={open === "betting"}
        title={race.bettingOpen ? "Close betting on this race?" : "Open betting on this race?"}
        body={
          race.bettingOpen
            ? "No more bets will be taken on this race."
            : "The season is told the pool is open. Only one race in an event can take bets at a time."
        }
        confirmLabel={race.bettingOpen ? "Close betting" : "Open betting"}
        tone={race.bettingOpen ? "danger" : "primary"}
        pending={action.pending}
        onConfirm={toggleBetting}
        onCancel={close}
      />

      <Confirm
        open={open === "transportStart" || open === "transportStop"}
        title={open === "transportStop" ? "Stop transport?" : "Start transport?"}
        body={
          open === "transportStop"
            ? "The transport is marked as arrived and stops accepting position fixes."
            : "The transport is marked as on the road. Use Broadcast position on the phone travelling with the birds to send its location."
        }
        confirmLabel={open === "transportStop" ? "Stop transport" : "Start transport"}
        tone="primary"
        pending={action.pending}
        onConfirm={() => transport(open === "transportStop" ? "stop" : "start")}
        onCancel={close}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
