import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { BirdEventMedia } from "@/components/admin/BirdEventMedia";
import { BreederTransferSheet } from "@/components/admin/EventBirdEntrySheets";
import {
  Button,
  ButtonRow,
  ChoiceList,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  SectionTitle,
  Sheet,
  money,
} from "@/components/admin/ui";
import {
  BET_CLASSES,
  COLORS,
  Chips,
  FEDERATIONS,
  Label,
  SEXES,
  Toggle,
  fullName,
  isDay,
  sexLabel,
  toDay,
  when,
} from "@/components/admin/birdParts";
import { sexLabel as wordSex, useDisplaySettings } from "@/components/admin/displaySettings";

interface Bet {
  bettorId: string | null;
  ownerUserId: string | null;
  category: string | null;
  tierIndex: number | null;
  amount: number | null;
  stakePaid?: boolean;
}

interface RaceItem {
  id: number;
  race?: { id: number; name: string | null; raceNumber: number | null; startTime: string | null } | null;
  result?: { birdPosition: number | null; arrivalTime: string | null; prizeValue: number | null } | null;
  bets?: Bet[];
}

interface Group {
  id: number;
  name: string | null;
  color: string | null;
}

type InventoryItem = {
  id: number;
  arrivalDate: string | null;
  departureDate: string | null;
  isBackup: number | null;
  entryFeeValue: number | null;
  perchFeeValue: number | null;
  raceFeeValue: number | null;
  hotSpotFeeValue: number | null;
  entryRefund: number | null;
  hotSpotRefund: number | null;
  betsRefund: number | null;
  eventInventory?: {
    loft: string | null;
    signInDate?: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
    season?: { name: string | null; event?: { id: number; name: string | null } | null } | null;
  } | null;
  raceItems?: RaceItem[];
  basketAssignments?: {
    id: number;
    eventBasket?: {
      label: string | null;
      basketNo: number | null;
      phase: string | null;
      capacity: number | null;
      race?: { name: string | null } | null;
    } | null;
  }[];
  currentGroup?: Group | null;
  tagColorGroup?: Group | null;
} & Record<string, unknown>;

interface Bird {
  id: number;
  band: string | null;
  band1: string | null;
  band2: string | null;
  band3: string | null;
  band4: string | null;
  codeMasked: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
  image: string | null;
  isActive: number | null;
  isLost: number | null;
  lostDate: string | null;
  lostRaceId: number | null;
  isPublic: number | null;
  attention: boolean | null;
  healthStatus: string | null;
  healthNote: string | null;
  healthUpdatedAt: string | null;
  note: string | null;
  breeder?: {
    firstName: string | null;
    lastName: string | null;
    country?: string | null;
    city1?: string | null;
    state1?: string | null;
    user?: { loftName: string | null } | null;
  } | null;
  lostRace?: { name: string | null } | null;
  inventoryItems?: InventoryItem[];
}

interface Location {
  status: "LOST" | "ARRIVED" | "BASKETED" | "HELD";
  label: string;
  eventName?: string;
  raceName?: string;
  basketLabel?: string;
  phase?: "LOFT" | "RACE";
  since?: string;
}

interface HistoryEntry {
  type: "REGISTERED" | "BASKETED" | "RELEASED" | "ARRIVED" | "FOREIGN_BIRD" | "LOST";
  date: string;
  eventName?: string;
  raceName?: string;
  basketLabel?: string;
  phase?: "LOFT" | "RACE";
  position?: number;
  prizeValue?: number;
}

interface Activity {
  id: number;
  action: string;
  detail: string | null;
  createdAt: string;
  performedBy?: { name: string | null } | null;
}

/** Anything other than healthy holds the bird back from basketting. */
const HEALTH: { key: string; label: string; hint: string }[] = [
  { key: "HEALTHY", label: "Healthy", hint: "Cleared to fly" },
  { key: "INJURED", label: "Injured", hint: "Held back from basketting" },
  { key: "HOSPITALIZED", label: "Hospitalised", hint: "Held back from basketting" },
  { key: "DEAD", label: "Dead", hint: "Held back, and taken off the active roster" },
];

const HISTORY_ICON: Record<HistoryEntry["type"], keyof typeof Ionicons.glyphMap> = {
  REGISTERED: "clipboard-outline",
  BASKETED: "cube-outline",
  RELEASED: "rocket-outline",
  ARRIVED: "flag-outline",
  FOREIGN_BIRD: "help-circle-outline",
  LOST: "warning-outline",
};

const historyTitle = (e: HistoryEntry) => {
  switch (e.type) {
    case "REGISTERED":
      return `Registered for ${e.eventName ?? "event"}`;
    case "BASKETED":
      return `Basketed in ${e.basketLabel ?? "basket"}`;
    case "RELEASED":
      return `Released in ${e.raceName ?? "race"}`;
    case "ARRIVED":
      return e.position
        ? `Arrived #${e.position} in ${e.raceName ?? "race"}`
        : `Arrived in ${e.raceName ?? "race"}`;
    case "FOREIGN_BIRD":
      return `Did not finish ${e.raceName ?? "race"}`;
    case "LOST":
      return `Lost at ${e.raceName ?? "race"}`;
    default:
      return String(e.type);
  }
};

const historySub = (e: HistoryEntry) =>
  [
    e.type !== "REGISTERED" ? e.eventName : null,
    e.type === "BASKETED" && e.phase ? `${e.phase.toLowerCase()} phase` : null,
    e.type === "ARRIVED" && e.prizeValue ? `prize ${money(e.prizeValue)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** B1…, S1…, W1… for the classes an entry is in. */
const classesOf = (item: InventoryItem) =>
  BET_CLASSES.flatMap((g) => g.classes)
    .filter((c) => Number(item[c.key] ?? 0) > 0)
    .map((c) => c.label)
    .join(" ");

const BET_PREFIX: Record<string, string> = { BELGIAN: "B", STANDARD: "S", WTA: "W" };

const BLANK = {
  band1: "",
  band2: "",
  band3: "",
  band4: "",
  codeMasked: "",
  birdName: "",
  color: "",
  sex: "0",
  rfid: "",
  isActive: true,
  isLost: false,
  lostDate: "",
  lostRaceId: "",
  note: "",
  isPublic: false,
  attention: false,
};

/**
 * One bird, and everything that has happened to it.
 *
 * The portal spreads this across a detail page, a dialog and four tabs. Here it
 * is one scroll, ordered by what somebody holding the bird asks first: what is
 * it, where is it now, is it fit, and only then the long record behind it —
 * each event it was entered in, every race, and the log of who did what.
 *
 * Everything the portal lets an administrator change is changeable here: the
 * band and the rest of its details, its condition, the basketing flag, whose
 * entry it is, and whether it exists at all. The band is the bird's identity
 * and is already printed on its leg, so changing it is rare and correcting a
 * typo is the only good reason to; the form says so rather than hiding it.
 *
 * Transferring is done per entry, not per bird, because that is what the route
 * moves — one event's registration — and the bird can be entered in several.
 *
 * Pictures and notes belong to an event's season. Arriving here from an event's
 * bird list opens that event's; from the register, each entry can open its own.
 */
export default function AdminBirdDetail() {
  const { birdId, eventId } = useLocalSearchParams<{ birdId?: string; eventId?: string }>();
  const router = useRouter();
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();
  // The portal's bird properties card words the sex per display settings.
  const { sexTerminology } = useDisplaySettings();

  const [healthOpen, setHealthOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState("HEALTHY");
  const [healthNote, setHealthNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [deleting, setDeleting] = useState(false);
  const [transferring, setTransferring] = useState<InventoryItem | null>(null);
  const [mediaFor, setMediaFor] = useState<number | null>(eventId ? Number(eventId) : null);

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    bird?: Bird;
  }>(birdId ? `/admin/bird/${birdId}` : null, [birdId]);

  const locationReq = useAdminData<Location>(birdId ? `/birds/${birdId}/location` : null, [birdId]);
  const historyReq = useAdminData<{ entries?: HistoryEntry[] }>(
    birdId ? `/birds/${birdId}/history` : null,
    [birdId]
  );
  const activityReq = useAdminData<{ history?: Activity[] }>(
    birdId ? `/admin/bird/${birdId}/event-history` : null,
    [birdId]
  );

  const mayManage = can("birds.manage");
  const maySeeMedia = canAny("events.view", "events.manage");

  const bird = data?.bird ?? null;

  if (forbidden || !mayManage) return <NoAccess what="This bird's record" />;
  if (loading) return <Loading />;

  if (!bird) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-center text-sm text-slate-500">
          {error ?? "That bird could not be found."}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-sm font-medium text-blue-600">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const set = (patch: Partial<typeof BLANK>) => setForm((f) => ({ ...f, ...patch }));

  const refreshAll = () => {
    refresh();
    locationReq.reload();
    historyReq.reload();
    activityReq.reload();
  };

  const saveHealth = async () => {
    const note = healthNote.trim();
    const { ok, data: said } = await action.run<{ message?: string }>(
      "post",
      `/admin/bird/${birdId}/health`,
      // The route takes a note or no note; it refuses an explicit null.
      note ? { healthStatus, healthNote: note } : { healthStatus }
    );
    if (ok) {
      toast.success(said?.message || "Condition recorded.");
      setHealthOpen(false);
      reload();
      activityReq.reload();
    }
  };

  const openEdit = () => {
    setForm({
      band1: bird.band1 ?? "",
      band2: bird.band2 ?? "",
      band3: bird.band3 ?? "",
      band4: bird.band4 ?? "",
      codeMasked: bird.codeMasked ?? "",
      birdName: bird.birdName ?? "",
      color: bird.color ?? "",
      sex: String(bird.sex ?? 0),
      rfid: bird.rfid ?? "",
      isActive: bird.isActive === 1,
      isLost: bird.isLost === 1,
      lostDate: toDay(bird.lostDate),
      lostRaceId: bird.lostRaceId != null ? String(bird.lostRaceId) : "",
      note: bird.note ?? "",
      isPublic: bird.isPublic === 1,
      attention: !!bird.attention,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (form.isLost && form.lostDate && !isDay(form.lostDate)) {
      toast.error("Lost date should look like 2026-03-14.");
      return;
    }
    if (form.lostRaceId.trim() && !/^\d+$/.test(form.lostRaceId.trim())) {
      toast.error("Lost race is the race's number id.");
      return;
    }
    const body: Record<string, unknown> = {
      codeMasked: form.codeMasked.trim() || null,
      birdName: form.birdName.trim() || null,
      color: form.color || null,
      sex: Number(form.sex),
      rfid: form.rfid.trim() || null,
      isActive: form.isActive ? 1 : 0,
      isLost: form.isLost ? 1 : 0,
      lostDate: form.isLost && form.lostDate ? form.lostDate : null,
      lostRaceId: form.lostRaceId.trim() ? Number(form.lostRaceId.trim()) : null,
      note: form.note.trim() || null,
      isPublic: form.isPublic ? 1 : 0,
      attention: form.attention,
    };
    // A band part is only sent when it has something in it: the route refuses
    // an empty one, and a part that is not sent is left as it was.
    const parts = {
      band1: form.band1,
      band2: form.band2.trim(),
      band3: form.band3.trim().toUpperCase(),
      band4: form.band4.trim(),
    };
    for (const [key, value] of Object.entries(parts)) {
      if (value) body[key] = value;
    }

    const { ok } = await action.run("patch", `/admin/bird/${birdId}`, body, {
      success: "Bird updated.",
    });
    if (ok) {
      setEditOpen(false);
      reload();
    }
  };

  const setAttention = async (next: boolean) => {
    const { ok } = await action.run(
      "patch",
      `/admin/bird/${birdId}`,
      { attention: next },
      { success: next ? "Marked for attention." : "Attention cleared." }
    );
    if (ok) reload();
  };

  const remove = async () => {
    const { ok } = await action.run("delete", `/admin/bird/${birdId}`, undefined, {
      success: "Bird deleted.",
    });
    if (ok) {
      setDeleting(false);
      router.back();
    }
  };

  const contextEvent = eventId ? Number(eventId) : null;
  const eventOf = (item: InventoryItem) => item.eventInventory?.season?.event ?? null;
  // The event this page was opened from comes first.
  const entries = [...(bird.inventoryItems ?? [])].sort(
    (a, b) =>
      Number(eventOf(b)?.id === contextEvent) - Number(eventOf(a)?.id === contextEvent) || b.id - a.id
  );

  // Flattened across every event the bird has been entered in, newest first.
  const races = entries
    .flatMap((item) =>
      (item.raceItems ?? []).map((ri) => ({ ...ri, event: eventOf(item)?.name ?? null }))
    )
    .sort(
      (a, b) =>
        new Date(b.race?.startTime ?? 0).getTime() - new Date(a.race?.startTime ?? 0).getTime()
    );

  const flown = races.filter((r) => r.result?.birdPosition != null).length;
  const won = races.reduce((s, r) => s + (r.result?.prizeValue ?? 0), 0);
  const best = races.reduce<number | null>((b, r) => {
    const p = r.result?.birdPosition;
    return p != null && (b == null || p < b) ? p : b;
  }, null);

  const bandParts = [bird.band1, bird.band2, bird.band3, bird.band4].filter(Boolean);
  const band = bandParts.join("-") || bird.band || "No band";
  const who = fullName(bird.breeder) || "Unknown";
  const loft = bird.breeder?.user?.loftName;
  const health = bird.healthStatus ?? "HEALTHY";
  const fit = health === "HEALTHY";
  const location = locationReq.data;
  const history = historyReq.data?.entries ?? [];
  const activity = activityReq.data?.history ?? [];

  return (
    <Screen
      title={bird.birdName || band}
      subtitle={[bird.birdName ? band : null, who, loft].filter(Boolean).join(" · ") || null}
      onRefresh={refreshAll}
      refreshing={refreshing}
    >
      <Pressable onPress={() => router.back()} className="mt-3 flex-row items-center gap-1">
        <Ionicons name="chevron-back" size={16} color="#2563eb" />
        <Text className="text-sm font-medium text-blue-600">Back</Text>
      </Pressable>

      {error ? <Notice>{error}</Notice> : null}

      {bird.isLost === 1 ? <Notice tone="rose">This bird is recorded as lost.</Notice> : null}
      {!fit ? (
        <Notice tone="rose">
          {HEALTH.find((h) => h.key === health)?.label ?? health} — held back from basketting.
        </Notice>
      ) : null}
      {bird.attention ? <Notice>Pay attention to this bird during basketing.</Notice> : null}

      {bird.image ? (
        <View className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Image source={{ uri: bird.image }} style={{ width: "100%", height: 220 }} contentFit="cover" />
        </View>
      ) : null}

      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
        <Button
          label="Condition"
          icon="medkit-outline"
          onPress={() => {
            setHealthStatus(health);
            setHealthNote(bird.healthNote ?? "");
            setHealthOpen(true);
          }}
        />
        <Button label="Edit" tone="secondary" icon="create-outline" onPress={openEdit} />
        <Button label="Delete" tone="danger" icon="trash-outline" onPress={() => setDeleting(true)} />
      </View>

      <View className="rounded-xl border border-slate-200 bg-white px-4 pb-3 mt-3">
        <Toggle
          label="Pay attention during basketing"
          value={!!bird.attention}
          onChange={setAttention}
          disabled={action.pending}
        />
      </View>

      <SectionTitle>Current location</SectionTitle>
      {locationReq.loading ? (
        <Loading />
      ) : !location?.status ? (
        <Empty>Location unavailable.</Empty>
      ) : (
        <Rows>
          <Row
            title={location.label}
            subtitle={
              [
                [location.eventName, location.raceName].filter(Boolean).join(" · ") || null,
                location.basketLabel && location.phase
                  ? `${location.phase.toLowerCase()} basket ${location.basketLabel}`
                  : null,
                location.since ? `since ${when(location.since)}` : null,
              ]
                .filter(Boolean)
                .join(" — ") || undefined
            }
            badge={
              location.status === "LOST"
                ? { label: "lost", bg: "bg-rose-100", text: "text-rose-700" }
                : location.status === "ARRIVED"
                  ? { label: "arrived", bg: "bg-emerald-100", text: "text-emerald-700" }
                  : location.status === "BASKETED"
                    ? { label: "basketed", bg: "bg-blue-100", text: "text-blue-700" }
                    : { label: "held", bg: "bg-slate-100", text: "text-slate-600" }
            }
          />
        </Rows>
      )}

      <SectionTitle>Properties</SectionTitle>
      <Rows>
        <Row
          title="Band"
          right={band}
          rightSub={bird.isLost === 1 ? "lost" : bird.isActive === 1 ? "normal" : "inactive"}
        />
        <Row title="Code masked" right={bird.codeMasked || "not set"} />
        <Row title="Clocking device code" right={bandParts.join("") || "—"} />
        <Row title="Pigeon number" right={bird.band4 || "—"} />
        <Row title="Year" right={bird.band2 || "—"} />
        <Row title="Fancier" right={loft ? `${who} - ${loft}` : who} />
        <Row title="Country" right={bird.breeder?.country || "—"} />
        <Row
          title="Gender"
          right={bird.sex === 1 || bird.sex === 2 ? wordSex(bird.sex, sexTerminology) : sexLabel(bird.sex)}
        />
        <Row title="Colour" right={bird.color || "—"} />
        <Row
          title="RFID"
          right={bird.rfid || "not set"}
          rightTone={bird.rfid ? "text-emerald-600" : "text-slate-400"}
        />
        <Row title="Public profile" right={bird.isPublic === 1 ? "yes" : "no"} />
        {bird.isLost === 1 ? (
          <Row
            title="Lost"
            right={bird.lostDate ? new Date(bird.lostDate).toLocaleDateString() : "date not recorded"}
            rightSub={bird.lostRace?.name ?? undefined}
            rightTone="text-rose-600"
          />
        ) : null}
      </Rows>

      <SectionTitle>Health</SectionTitle>
      <View className="rounded-xl border border-slate-200 bg-white p-4">
        <Text className={`text-sm font-medium ${fit ? "text-emerald-700" : "text-rose-700"}`}>
          {HEALTH.find((h) => h.key === health)?.label ?? health}
          <Text className="font-normal text-slate-500">
            {fit ? " · cleared to fly" : " · held back from basketting"}
          </Text>
        </Text>
        <Text className="mt-1 text-sm text-slate-600">
          {bird.healthNote || "No health notes recorded."}
        </Text>
        {bird.healthUpdatedAt ? (
          <Text className="mt-1 text-xs text-slate-400">Updated {when(bird.healthUpdatedAt)}</Text>
        ) : null}
      </View>

      <SectionTitle>Notes</SectionTitle>
      <View className="rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-sm text-slate-700">{bird.note || "No notes"}</Text>
        <Text className="mt-1 text-xs text-slate-400">Changed with Edit, above.</Text>
      </View>

      {entries.map((item) => {
        const event = eventOf(item);
        const owner = fullName(item.eventInventory?.breeder) || item.eventInventory?.loft || "Unassigned";
        const baskets = item.basketAssignments ?? [];
        const total =
          (item.entryFeeValue ?? 0) +
          (item.perchFeeValue ?? 0) +
          (item.raceFeeValue ?? 0) +
          (item.hotSpotFeeValue ?? 0);
        const refunds = (item.entryRefund ?? 0) + (item.hotSpotRefund ?? 0) + (item.betsRefund ?? 0);
        const classes = classesOf(item);
        const staked = (item.raceItems ?? []).filter((ri) => (ri.bets ?? []).length > 0);
        const showingMedia = event != null && mediaFor === event.id;

        return (
          <View key={item.id}>
            <SectionTitle>
              {event?.name ?? "Event"}
              {item.eventInventory?.season?.name ? ` · ${item.eventInventory.season.name}` : ""}
            </SectionTitle>
            <Rows>
              <Row title="Entered by" right={owner} rightSub={item.isBackup === 1 ? "backup bird" : undefined} />
              <Row
                title="Loft group"
                right={item.currentGroup?.name ?? "not assigned"}
                rightTone={item.currentGroup ? "text-slate-900" : "text-slate-400"}
              />
              <Row
                title="Tag colour"
                right={item.tagColorGroup?.name ?? "not assigned"}
                rightTone={item.tagColorGroup ? "text-slate-900" : "text-slate-400"}
              />
              <Row
                title="Arrived"
                right={item.arrivalDate ? new Date(item.arrivalDate).toLocaleDateString() : "—"}
                rightSub={
                  item.departureDate
                    ? `left ${new Date(item.departureDate).toLocaleDateString()}`
                    : undefined
                }
              />
              <Row
                title="Basket"
                right={
                  baskets.length === 0
                    ? "not basketed"
                    : baskets
                        .map((b) => b.eventBasket?.label ?? `#${b.eventBasket?.basketNo ?? "-"}`)
                        .join(", ")
                }
                rightSub={
                  baskets
                    .map((b) =>
                      [b.eventBasket?.phase?.toLowerCase(), b.eventBasket?.race?.name]
                        .filter(Boolean)
                        .join(" ")
                    )
                    .filter(Boolean)
                    .join(", ") || undefined
                }
                rightTone={baskets.length ? "text-slate-900" : "text-slate-400"}
              />
              <Row title="Entry fee" right={money(item.entryFeeValue)} />
              <Row title="Per bird fee" right={money(item.perchFeeValue)} />
              <Row title="Race fee" right={money(item.raceFeeValue)} />
              <Row title="Perch fee (hot spot)" right={money(item.hotSpotFeeValue)} />
              <Row title="Fees total" right={money(total)} rightTone="text-slate-900" />
              {refunds > 0 ? (
                <Row
                  title="Refunds"
                  subtitle={`entry ${money(item.entryRefund ?? 0)} · hot spot ${money(
                    item.hotSpotRefund ?? 0
                  )} · bets ${money(item.betsRefund ?? 0)}`}
                  right={money(refunds)}
                />
              ) : null}
              <Row title="Betting classes" right={classes || "none"} />
              {staked.map((ri) => (
                <Row
                  key={`bets-${ri.id}`}
                  title={`Bets · ${ri.race?.name || `Race ${ri.race?.raceNumber ?? ri.id}`}`}
                  subtitle={(ri.bets ?? [])
                    .map((b) => {
                      const mine = b.ownerUserId != null && b.bettorId === b.ownerUserId;
                      return `${BET_PREFIX[b.category ?? ""] ?? "?"}${b.tierIndex ?? ""} ${money(
                        b.amount ?? 0
                      )} ${mine ? "owner" : "bettor"} ${b.stakePaid ? "paid" : "unpaid"}`;
                    })
                    .join(" · ")}
                />
              ))}
            </Rows>

            <ButtonRow>
              <Button
                label="Transfer breeder"
                tone="secondary"
                icon="swap-horizontal-outline"
                onPress={() => setTransferring(item)}
                full
              />
              {maySeeMedia && event ? (
                <Button
                  label={showingMedia ? "Hide pictures" : "Pictures & notes"}
                  tone="secondary"
                  icon="images-outline"
                  onPress={() => setMediaFor(showingMedia ? null : event.id)}
                  full
                />
              ) : null}
            </ButtonRow>

            {maySeeMedia && showingMedia && event ? (
              <BirdEventMedia eventId={event.id} birdId={bird.id} />
            ) : null}
          </View>
        );
      })}

      <SectionTitle>Racing record</SectionTitle>
      <Rows>
        <Row title="Races flown" right={String(flown)} />
        <Row title="Best position" right={best != null ? String(best) : "—"} />
        <Row title="Prize money" right={money(won)} rightTone="text-emerald-600" />
      </Rows>

      <SectionTitle>Races</SectionTitle>
      {races.length === 0 ? (
        <Empty>This bird has not been entered in a race.</Empty>
      ) : (
        <Rows>
          {races.slice(0, 60).map((r) => (
            <Row
              key={r.id}
              title={r.race?.name || `Race ${r.race?.raceNumber ?? r.race?.id ?? "—"}`}
              subtitle={
                [r.event, r.race?.startTime ? new Date(r.race.startTime).toLocaleDateString() : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              right={r.result?.birdPosition != null ? `#${r.result.birdPosition}` : "no position"}
              rightSub={
                r.result?.prizeValue != null && r.result.prizeValue > 0
                  ? money(r.result.prizeValue)
                  : undefined
              }
              rightTone={r.result?.birdPosition != null ? "text-slate-900" : "text-slate-400"}
            />
          ))}
        </Rows>
      )}

      <SectionTitle>History</SectionTitle>
      {historyReq.loading ? (
        <Loading />
      ) : historyReq.error ? (
        <Empty>History unavailable.</Empty>
      ) : history.length === 0 ? (
        <Empty>No history yet.</Empty>
      ) : (
        <Rows>
          {history.slice(0, 100).map((e, index) => (
            <Row
              key={index}
              leading={<Ionicons name={HISTORY_ICON[e.type] ?? "ellipse-outline"} size={16} color="#94a3b8" />}
              title={historyTitle(e)}
              subtitle={[when(e.date), historySub(e)].filter(Boolean).join(" · ")}
            />
          ))}
        </Rows>
      )}

      <SectionTitle>Event activity</SectionTitle>
      {activityReq.loading ? (
        <Loading />
      ) : activityReq.forbidden ? (
        <Empty>The activity log is not part of your access.</Empty>
      ) : activity.length === 0 ? (
        <Empty>No event activity yet.</Empty>
      ) : (
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {activity.slice(0, 100).map((a, index) => (
            <View key={a.id} className={`px-4 py-3 ${index > 0 ? "border-t border-slate-100" : ""}`}>
              <Text className="text-xs font-semibold text-slate-700">
                {a.action.replace(/_/g, " ")}
                <Text className="font-normal text-slate-400"> · {when(a.createdAt)}</Text>
              </Text>
              {a.detail ? <Text className="mt-0.5 text-sm text-slate-700">{a.detail}</Text> : null}
              {a.performedBy?.name ? (
                <Text className="mt-0.5 text-xs text-slate-400">{a.performedBy.name}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <Sheet
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        title="Condition"
        subtitle="Health stays with the bird across races until it is cleared"
      >
        <ChoiceList
          choices={HEALTH.map((h) => ({ key: h.key, label: h.label, hint: h.hint }))}
          selected={healthStatus}
          onPick={(k) => setHealthStatus(String(k))}
        />
        <Field
          label="Note"
          value={healthNote}
          onChange={setHealthNote}
          multiline
          placeholder="What happened, and who treated it"
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setHealthOpen(false)} full />
          <Button label="Record" onPress={saveHealth} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit bird" subtitle={band}>
        <Notice>
          The band is how every result finds this bird. Change it only to correct a mistake.
        </Notice>
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
            <Field label="Letters" value={form.band3} onChange={(v) => set({ band3: v.toUpperCase() })} />
          </View>
          <View className="flex-1">
            <Field label="Number" value={form.band4} onChange={(v) => set({ band4: v })} />
          </View>
        </View>

        <Label>Colour</Label>
        <Chips
          options={[
            ...COLORS,
            ...(form.color && !COLORS.includes(form.color) ? [form.color] : []),
          ].map((c) => ({ key: c, label: c }))}
          selected={form.color}
          onPick={(k) => set({ color: form.color === k ? "" : k })}
        />

        <Label>Sex</Label>
        <Chips options={SEXES} selected={form.sex} onPick={(k) => set({ sex: k })} />

        <Field
          label="Code masked"
          value={form.codeMasked}
          onChange={(v) => set({ codeMasked: v })}
          placeholder="e.g. AU-0-F2-03"
        />
        <Field label="Bird name" value={form.birdName} onChange={(v) => set({ birdName: v })} />
        <Field
          label="RFID"
          value={form.rfid}
          onChange={(v) => set({ rfid: v })}
          hint="Usually set by scanning at check-in. Type it only to correct one."
        />

        <Toggle label="Active" value={form.isActive} onChange={(v) => set({ isActive: v })} />
        <Toggle label="Lost" value={form.isLost} onChange={(v) => set({ isLost: v })} />
        {form.isLost ? (
          <View className="flex-row" style={{ gap: 8 }}>
            <View className="flex-1">
              <Field
                label="Lost date"
                value={form.lostDate}
                onChange={(v) => set({ lostDate: v })}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Lost race ID"
                value={form.lostRaceId}
                onChange={(v) => set({ lostRaceId: v })}
                keyboard="numeric"
              />
            </View>
          </View>
        ) : null}

        <Field label="Note" value={form.note} onChange={(v) => set({ note: v })} multiline />

        <Toggle label="Public profile" value={form.isPublic} onChange={(v) => set({ isPublic: v })} />
        <Toggle
          label="Pay attention during basketing"
          value={form.attention}
          onChange={(v) => set({ attention: v })}
        />

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditOpen(false)} full />
          <Button label="Save" onPress={saveEdit} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <BreederTransferSheet
        open={transferring != null}
        onClose={() => setTransferring(null)}
        onDone={reload}
        entryId={transferring?.id ?? null}
        currently={fullName(transferring?.eventInventory?.breeder)}
        what={transferring ? eventOf(transferring)?.name : null}
      />

      <Confirm
        open={deleting}
        title={`Delete ${band}?`}
        body="This removes the bird itself, and with it every event entry, race result, scan, basket assignment and lost-history record it has. It cannot be undone. To take it out of one event only, remove its entry from that event's bird list instead."
        confirmLabel="Delete bird"
        pending={action.pending}
        onCancel={() => setDeleting(false)}
        onConfirm={remove}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
