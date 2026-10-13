import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  Sheet,
  tabular,
} from "@/components/admin/ui";
import { BasketEntries, type StatusData } from "@/components/admin/BasketEntries";
import { Caption, Pill, Segments, sexLabel, shortBand } from "@/components/admin/scan";

interface Assignment {
  id: number;
  assignedAt: string | null;
  inventoryItem?: {
    id: number;
    bird?: {
      id: number;
      band: string | null;
      birdName: string | null;
      rfid: string | null;
      color: string | null;
      sex: number | null;
      attention: boolean | null;
      note: string | null;
    } | null;
    eventInventory?: {
      breeder?: { id: number; firstName: string | null; lastName: string | null } | null;
    } | null;
    /** The first time it was ever basketed, when the history has it. */
    birdEventHistory?: { createdAt: string }[];
  } | null;
}

interface Basket {
  id: number;
  basketNo: number;
  capacity: number;
  phase: string;
  label: string | null;
  raceId: number | null;
  _count?: { assignments?: number };
  assignments?: Assignment[];
}

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
}

/** What the loft assigner says it would do, before it is allowed to do it. */
interface LoftPlan {
  message?: string;
  heldBack?: { inventoryItemId: number; band: string; reason: string }[];
  assigned?: {
    groupKey: number;
    label: string;
    basketNo: number;
    basketLabel: string | null;
    birdCount: number;
  }[];
  unassigned?: { groupKey: number; label: string; birdCount: number }[];
  summary?: {
    totalGroups: number;
    assignedGroups: number;
    unassignedGroups: number;
    totalBirds: number;
    assignedBirds: number;
  };
}

/** The race assigner answers by basket rather than by breeder. */
interface RacePlan {
  message?: string;
  baskets?: {
    basketId: number;
    basketNo: number;
    basketLabel: string | null;
    capacity: number;
    birdCount: number;
    breeders: string[];
  }[];
  unassigned?: number;
  summary?: {
    totalBirds: number;
    totalCapacity: number;
    assignedBirds: number;
    unassignedBirds: number;
    basketCount: number;
  };
}

type Tab = "loft" | "race" | "prescan";
type LoftMode = "shuffle" | "assign";
type RaceMode = "reset" | "incremental";

type Plan =
  | { kind: "loft"; mode: LoftMode; data: LoftPlan }
  | { kind: "race"; mode: RaceMode; data: RacePlan };

const filled = (b: Basket) => b._count?.assignments ?? b.assignments?.length ?? 0;
const labelOf = (b: { label: string | null; basketNo: number }) => b.label || `Basket #${b.basketNo}`;

/**
 * Baskets, and how full they are.
 *
 * Three tabs, because the portal has three and they are different jobs. Loft
 * baskets belong to the season and are filled by breeder, so a breeder's birds
 * travel together. Race baskets belong to one race and are filled at random, so
 * nobody's birds sit beside each other on the truck. Prescan identifies a bird
 * and changes nothing.
 *
 * The two kinds of basket are kept apart everywhere — different tabs, different
 * requests — because a loft basket and a race basket can share a number without
 * being the same thing, and one list would make a real basket look
 * double-booked.
 *
 * Both assigners always preview first. Either can move every bird in the season
 * in one press, and an operator is entitled to see that plan before it becomes
 * the truth; when baskets already hold birds there is a stop before even the
 * preview, as in the portal. The phone must not be the looser of the two.
 *
 * Scanning happens on its own screen: it needs the whole display, and it is
 * what somebody does with a bird in the other hand.
 */
export default function EventBaskets() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const action = useAdminAction();

  const [tab, setTab] = useState<Tab>("loft");
  const [view, setView] = useState<"baskets" | "entries">("baskets");
  const [open, setOpen] = useState<number | null>(null);
  const [raceId, setRaceId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const mayManage = can("baskets.manage");
  const mayStatus = canAny("checkin.view", "checkin.manage");
  const base = eventId ? `/admin/event/${eventId}/baskets` : null;

  // Race baskets belong to a race, so the list comes first.
  const racesReq = useAdminData<{ races?: Race[] }>(
    eventId && canAny("races.view", "races.manage") ? `/admin/race?eventId=${eventId}` : null,
    [eventId]
  );
  const races = useMemo(() => racesReq.data?.races ?? [], [racesReq.data]);

  // The first race is selected for you, as the portal does.
  useEffect(() => {
    if (raceId == null && races.length > 0) setRaceId(races[0].id);
  }, [races, raceId]);

  const phase = tab === "race" ? "RACE" : "LOFT";
  const listPath = !base
    ? null
    : phase === "LOFT"
      ? `${base}?phase=LOFT`
      : raceId != null
        ? `${base}?phase=RACE&raceId=${raceId}`
        : null;

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    baskets?: Basket[];
  }>(listPath, [eventId, phase, raceId]);

  // "Active" in the capacity line is every approved bird of the season.
  const statusReq = useAdminData<StatusData>(
    eventId && mayStatus ? `/admin/event/${eventId}/checkin-status` : null,
    [eventId]
  );

  const baskets = useMemo(
    () => (listPath ? (data?.baskets ?? []) : []).slice().sort((a, b) => a.basketNo - b.basketNo),
    [data, listPath]
  );
  const race = races.find((r) => r.id === raceId) ?? null;
  const raceLabel = (r: Race) => r.name || `Race #${r.raceNumber ?? r.id}`;

  const capacity = baskets.reduce((s, b) => s + b.capacity, 0);
  const occupancy = baskets.reduce((s, b) => s + filled(b), 0);
  const active = statusReq.data?.summary?.total ?? null;
  const insufficient = active != null && capacity < active;
  const hasAssignments = baskets.some((b) => filled(b) > 0);
  const nextNo = baskets.length > 0 ? Math.max(...baskets.map((b) => b.basketNo)) + 1 : 1;

  const [creating, setCreating] = useState(false);
  const [newCapacity, setNewCapacity] = useState("");
  const [editing, setEditing] = useState<Basket | null>(null);
  const [form, setForm] = useState({ label: "", capacity: "" });
  const [clearing, setClearing] = useState<Basket | null>(null);
  const [removing, setRemoving] = useState<Basket | null>(null);

  // The assigner: a stop when birds are already placed, then the plan, then the commit.
  const [redoing, setRedoing] = useState<LoftMode | RaceMode | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  const done = () => {
    reload();
    setTick((t) => t + 1);
  };

  const create = async (keepOpen: boolean) => {
    const cap = parseInt(newCapacity.trim(), 10);
    if (isNaN(cap) || cap < 1) {
      toast.error("Capacity must be a positive number.");
      return;
    }
    if (phase === "RACE" && raceId == null) {
      toast.error("Select a race first.");
      return;
    }
    const { ok, data: said } = await action.run<{ basket?: Basket }>("post", base!, {
      capacity: cap,
      phase,
      ...(phase === "RACE" ? { raceId } : {}),
    });
    if (ok) {
      toast.success(
        `${phase === "RACE" ? "Race basket" : "Basket"} #${said?.basket?.basketNo ?? nextNo} created.`
      );
      setNewCapacity("");
      if (!keepOpen) setCreating(false);
      done();
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const cap = parseInt(form.capacity.trim(), 10);
    if (isNaN(cap) || cap < 1) {
      toast.error("Capacity must be a positive number.");
      return;
    }
    const { ok } = await action.run(
      "patch",
      base!,
      { basketId: editing.id, label: form.label.trim(), capacity: cap },
      { success: "Basket updated." }
    );
    if (ok) {
      setEditing(null);
      done();
    }
  };

  const clear = async () => {
    if (!clearing) return;
    const { ok } = await action.run(
      "patch",
      base!,
      { basketId: clearing.id, action: "clear" },
      { success: `Basket #${clearing.basketNo} cleared.` }
    );
    if (ok) {
      setClearing(null);
      done();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", base!, { basketId: removing.id }, {
      success: `Basket #${removing.basketNo} deleted.`,
    });
    if (ok) {
      setRemoving(null);
      done();
    }
  };

  /** Ask the server what it would do. Nothing is written. */
  const preview = async (mode: LoftMode | RaceMode) => {
    if (phase === "LOFT") {
      const { ok, data: got } = await action.run<LoftPlan>("post", `${base}/assign`, {
        preview: true,
        mode,
      });
      if (!ok || !got) return;
      // The route answers 200 with only a sentence when there are no birds.
      if (!got.assigned?.length && !got.unassigned?.length) {
        toast.info(got.message || "No birds to assign.");
        return;
      }
      setPlan({ kind: "loft", mode: mode as LoftMode, data: got });
      return;
    }

    if (raceId == null) {
      toast.error("Select a race first.");
      return;
    }
    const { ok, data: got } = await action.run<RacePlan>("post", `${base}/assign-race`, {
      preview: true,
      raceId,
      mode,
    });
    if (!ok || !got) return;
    if (!got.baskets?.length) {
      toast.info(got.message || "No birds to assign.");
      return;
    }
    setPlan({ kind: "race", mode: mode as RaceMode, data: got });
  };

  const apply = async () => {
    if (!plan) return;
    const { ok } =
      plan.kind === "loft"
        ? await action.run("post", `${base}/assign`, { preview: false, mode: plan.mode })
        : await action.run("post", `${base}/assign-race`, {
            preview: false,
            raceId,
            mode: plan.mode,
          });
    if (ok) {
      toast.success(
        plan.kind === "race" && plan.mode === "incremental"
          ? "New birds added to race baskets."
          : plan.kind === "race"
            ? "Birds assigned to race baskets."
            : "Birds assigned to baskets."
      );
      setPlan(null);
      done();
    }
  };

  /** Rebuilding wipes what is there, so it stops first when there is something to wipe. */
  const startFull = () => {
    const mode = phase === "LOFT" ? "shuffle" : "reset";
    if (hasAssignments) setRedoing(mode);
    else preview(mode);
  };

  const scan = (mode: "loft" | "race" | "identify") => {
    const q = [
      `eventId=${eventId}`,
      `name=${encodeURIComponent(String(name ?? ""))}`,
      `mode=${mode}`,
      raceId != null ? `raceId=${raceId}` : null,
      race ? `raceName=${encodeURIComponent(raceLabel(race))}` : null,
    ]
      .filter(Boolean)
      .join("&");
    router.push(`/(admin)/event-scan?${q}` as never);
  };

  if (forbidden) return <NoAccess what="Baskets" />;

  const racePicker = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {races.map((r) => {
        const on = r.id === raceId;
        return (
          <Pressable
            key={r.id}
            onPress={() => {
              setRaceId(r.id);
              setOpen(null);
              setPlan(null);
            }}
            className={`rounded-full border px-3.5 py-2 ${
              on ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
            }`}
          >
            <Text className={`text-xs font-medium ${on ? "text-white" : "text-slate-600"}`}>
              {raceLabel(r)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const assigning = action.pending && plan == null;

  return (
    <Screen
      title="Baskets"
      subtitle={name ?? undefined}
      onRefresh={() => {
        refresh();
        statusReq.reload();
        setTick((t) => t + 1);
      }}
      refreshing={refreshing}
      header={
        <>
          <Segments
            options={[
              { key: "loft", label: "Loft" },
              { key: "race", label: "Race" },
              { key: "prescan", label: "Prescan" },
            ]}
            value={tab}
            onChange={(next) => {
              setTab(next);
              setOpen(null);
              setPlan(null);
            }}
          />

          {tab !== "loft" ? (
            <View className="mt-3">
              {races.length === 0 ? (
                <Text className="text-xs text-slate-500">
                  {racesReq.loading
                    ? "Loading races…"
                    : racesReq.forbidden || !canAny("races.view", "races.manage")
                      ? "The race list is not part of your access."
                      : "No races yet."}
                </Text>
              ) : (
                racePicker
              )}
            </View>
          ) : null}

          {tab !== "prescan" && mayManage ? (
            <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
              <Button
                label={phase === "LOFT" ? "Set baskets" : "Reset & reassign"}
                icon="color-wand-outline"
                onPress={startFull}
                pending={assigning}
                disabled={
                  baskets.length === 0 ||
                  insufficient ||
                  (phase === "RACE" && (raceId == null || active === 0))
                }
              />
              <Button
                label={phase === "LOFT" ? "Assign" : "Add new birds only"}
                tone="secondary"
                icon="add"
                onPress={() => preview(phase === "LOFT" ? "assign" : "incremental")}
                disabled={
                  action.pending ||
                  baskets.length === 0 ||
                  (phase === "RACE" && (raceId == null || active === 0))
                }
              />
              <Button
                label="Add basket"
                tone="secondary"
                icon="add-circle-outline"
                disabled={phase === "RACE" && raceId == null}
                onPress={() => {
                  setNewCapacity("");
                  setCreating(true);
                }}
              />
              <Button
                label={phase === "LOFT" ? "Scan to place" : "Prescan"}
                tone="secondary"
                icon="scan-outline"
                disabled={!hasAssignments || (phase === "RACE" && raceId == null)}
                onPress={() => scan(phase === "LOFT" ? "loft" : "race")}
              />
            </View>
          ) : null}
        </>
      }
    >
      {tab === "prescan" ? (
        <View className="mt-4">
          <Text className="text-sm text-slate-600">
            Scan any tag to identify the bird and its breeder. Read-only — no assignments are made.
          </Text>
          <View className="mt-3 flex-row">
            <Button label="Start scanning" icon="scan-outline" onPress={() => scan("identify")} />
          </View>
          <Caption>Entries</Caption>
          {eventId ? <BasketEntries eventId={eventId} raceId={raceId} refreshKey={tick} /> : null}
        </View>
      ) : loading && listPath ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          {/* Capacity against the birds that have to fit — the portal's badge. */}
          <View className="mt-4 flex-row flex-wrap items-center" style={{ gap: 8 }}>
            <View className={`rounded-full px-3 py-1 ${insufficient ? "bg-rose-100" : "bg-slate-100"}`}>
              <Text
                className={`text-xs font-medium ${insufficient ? "text-rose-700" : "text-slate-700"}`}
                style={tabular}
              >
                Capacity {capacity} / Active {active ?? "—"}
              </Text>
            </View>
            {insufficient ? (
              <Text className="text-xs text-rose-600">
                Need {(active ?? 0) - capacity} more {phase === "LOFT" ? "loft" : "race"} slot(s)
              </Text>
            ) : null}
          </View>
          {mayManage && !hasAssignments && baskets.length > 0 ? (
            <Text className="mt-2 text-xs text-slate-400">
              {phase === "LOFT"
                ? "Run Set baskets first; scanning says where each bird was put."
                : "Run Reset & reassign first; the prescan says which basket each bird goes in."}
            </Text>
          ) : null}

          <View className="mt-3">
            <Segments
              options={[
                { key: "baskets", label: `${phase === "LOFT" ? "Loft" : "Race"} baskets (${baskets.length})` },
                { key: "entries", label: "Entries" },
              ]}
              value={view}
              onChange={setView}
            />
          </View>

          {view === "entries" ? (
            <View className="mt-3">
              {eventId ? (
                <BasketEntries
                  eventId={eventId}
                  raceId={raceId}
                  capacity={capacity}
                  occupancy={occupancy}
                  refreshKey={tick}
                />
              ) : null}
            </View>
          ) : (
            <View className="mt-3" style={{ gap: 10 }}>
              {phase === "RACE" && raceId == null ? (
                <Empty>Pick a race to see its baskets.</Empty>
              ) : baskets.length === 0 ? (
                <Empty>No {phase === "LOFT" ? "loft" : "race"} baskets yet.</Empty>
              ) : (
                baskets.map((basket) => {
                  const count = filled(basket);
                  const over = count > basket.capacity;
                  const isFull = count >= basket.capacity;
                  const isOpen = open === basket.id;
                  const breeders = [
                    ...new Set(
                      (basket.assignments ?? [])
                        .map((a) => a.inventoryItem?.eventInventory?.breeder?.lastName)
                        .filter(Boolean)
                    ),
                  ];
                  return (
                    <View
                      key={basket.id}
                      className={`overflow-hidden rounded-xl border bg-white ${
                        over ? "border-rose-300" : "border-slate-200"
                      }`}
                    >
                      <Pressable
                        onPress={() => setOpen(isOpen ? null : basket.id)}
                        className="flex-row items-center gap-3 px-4 py-3"
                      >
                        <View className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                          <Text className="text-sm font-bold text-slate-700">{basket.basketNo}</Text>
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="font-medium text-slate-900" numberOfLines={1}>
                            {labelOf(basket)}
                          </Text>
                          <Text className="text-xs text-slate-500" numberOfLines={1}>
                            {breeders.join(", ") || "Empty"}
                          </Text>
                        </View>
                        <Text
                          className={`text-sm font-semibold ${isFull ? "text-rose-600" : "text-slate-700"}`}
                          style={tabular}
                        >
                          {count}/{basket.capacity}
                        </Text>
                        <Ionicons
                          name={isOpen ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#94a3b8"
                        />
                      </Pressable>

                      {isOpen && (
                        <View className="border-t border-slate-100 p-3">
                          {mayManage ? (
                            <View className="mb-3 flex-row flex-wrap" style={{ gap: 8 }}>
                              <Button
                                label="Edit"
                                tone="secondary"
                                icon="create-outline"
                                onPress={() => {
                                  setForm({
                                    label: basket.label ?? "",
                                    capacity: String(basket.capacity),
                                  });
                                  setEditing(basket);
                                }}
                              />
                              {/* The portal offers clearing on loft baskets only. */}
                              {phase === "LOFT" ? (
                                <Button
                                  label="Clear"
                                  tone="secondary"
                                  icon="swap-horizontal-outline"
                                  onPress={() => setClearing(basket)}
                                  disabled={count === 0}
                                />
                              ) : null}
                              <Button
                                label="Delete"
                                tone="secondary"
                                icon="trash-outline"
                                onPress={() => setRemoving(basket)}
                              />
                            </View>
                          ) : null}

                          {(basket.assignments ?? []).length === 0 ? (
                            <Text className="px-1 text-xs text-slate-500">Empty.</Text>
                          ) : (
                            <View className="overflow-hidden rounded-xl border border-slate-200">
                              {[...(basket.assignments ?? [])]
                                .sort(
                                  (a, b) =>
                                    new Date(a.assignedAt ?? 0).getTime() -
                                    new Date(b.assignedAt ?? 0).getTime()
                                )
                                .map((a, index) => {
                                  const b = a.inventoryItem?.bird;
                                  const who = a.inventoryItem?.eventInventory?.breeder?.lastName;
                                  const at =
                                    a.inventoryItem?.birdEventHistory?.[0]?.createdAt ?? a.assignedAt;
                                  return (
                                    <View
                                      key={a.id}
                                      className={`flex-row items-center gap-3 px-3 py-2 ${
                                        index > 0 ? "border-t border-slate-100" : ""
                                      } ${b?.attention ? "bg-rose-50" : ""}`}
                                    >
                                      <View className="min-w-0 flex-1">
                                        <Text
                                          className="text-sm font-medium text-slate-900"
                                          numberOfLines={1}
                                        >
                                          {shortBand(b?.band) || "No band"}
                                          {b?.birdName ? ` · ${b.birdName}` : ""}
                                        </Text>
                                        <Text className="text-xs text-slate-500" numberOfLines={1}>
                                          {[who, b?.color, sexLabel(b?.sex)].filter(Boolean).join(" · ") ||
                                            "—"}
                                          {b?.note ? ` · ${b.note}` : ""}
                                        </Text>
                                      </View>
                                      {b?.attention ? <Pill label="!" tone="rose" /> : null}
                                      <Text className="text-[11px] text-slate-400" style={tabular}>
                                        {at ? new Date(at).toLocaleTimeString() : "—"}
                                      </Text>
                                    </View>
                                  );
                                })}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}
        </>
      )}

      {/* The plan, before it becomes the truth. */}
      <Sheet
        open={plan != null}
        onClose={() => setPlan(null)}
        title="Assignment preview"
        subtitle="Nothing has changed yet"
      >
        {plan?.kind === "loft" ? (
          <View className="mt-2">
            {plan.data.summary ? (
              <Text className="text-xs text-slate-500">
                {plan.data.summary.assignedGroups}/{plan.data.summary.totalGroups} breeders ·{" "}
                {plan.data.summary.assignedBirds} of {plan.data.summary.totalBirds} birds
              </Text>
            ) : null}

            {(plan.data.unassigned ?? []).length > 0 ? (
              <Notice tone="rose">
                {(plan.data.unassigned ?? []).length} breeder(s) could not be assigned — no basket has
                enough space:{" "}
                {(plan.data.unassigned ?? []).map((u) => `${u.label} (${u.birdCount})`).join(", ")}
              </Notice>
            ) : null}

            {(plan.data.heldBack ?? []).length > 0 ? (
              <Notice>
                {(plan.data.heldBack ?? []).length} bird(s) held back as not fit to fly:{" "}
                {(plan.data.heldBack ?? [])
                  .slice(0, 12)
                  .map((h) => `${shortBand(h.band)} (${h.reason})`)
                  .join(", ")}
                {(plan.data.heldBack ?? []).length > 12 ? "…" : ""}
              </Notice>
            ) : null}

            <Caption>Who goes where</Caption>
            <Rows>
              {(plan.data.assigned ?? []).map((a) => (
                <Row
                  key={a.groupKey}
                  title={a.label}
                  subtitle={`${a.birdCount} birds`}
                  right={a.basketLabel ?? `Basket #${a.basketNo}`}
                />
              ))}
            </Rows>
          </View>
        ) : plan?.kind === "race" ? (
          <View className="mt-2">
            {plan.data.summary ? (
              <Text className="text-xs text-slate-500">
                {plan.data.summary.assignedBirds}/{plan.data.summary.totalBirds} birds ·{" "}
                {plan.data.summary.basketCount} baskets
              </Text>
            ) : null}

            {(plan.data.summary?.unassignedBirds ?? 0) > 0 ? (
              <Notice tone="rose">
                {plan.data.summary?.unassignedBirds} bird(s) could not be assigned — capacity
                exhausted.
              </Notice>
            ) : null}

            <Caption>Baskets</Caption>
            <Rows>
              {(plan.data.baskets ?? []).map((b) => (
                <Row
                  key={b.basketId}
                  title={b.basketLabel ?? `Basket #${b.basketNo}`}
                  subtitle={b.breeders.join(", ") || undefined}
                  right={`${b.birdCount}/${b.capacity}`}
                />
              ))}
            </Rows>
          </View>
        ) : null}

        <ButtonRow>
          <Button label="Discard" tone="secondary" onPress={() => setPlan(null)} full />
          <Button label="Confirm & save" onPress={apply} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={phase === "LOFT" ? "Add new loft basket" : "Add new race basket"}
        subtitle={
          phase === "RACE" && race
            ? `For ${raceLabel(race)} · it will be No. ${nextNo}`
            : `It will be No. ${nextNo}`
        }
      >
        <Field
          label="Capacity"
          value={newCapacity}
          onChange={setNewCapacity}
          placeholder="Enter capacity"
          keyboard="numeric"
          autoFocus
          hint="The number is given by the server. A name can be added afterwards with Edit."
        />
        <ButtonRow>
          <Button
            label="Save and new"
            tone="secondary"
            onPress={() => create(true)}
            disabled={action.pending || !newCapacity.trim()}
            full
          />
          <Button
            label="Save and close"
            onPress={() => create(false)}
            pending={action.pending}
            disabled={!newCapacity.trim()}
            full
          />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={`Edit basket #${editing?.basketNo ?? ""}`}
      >
        <Field
          label="Name / label"
          value={form.label}
          onChange={(v) => setForm({ ...form, label: v })}
          placeholder={phase === "LOFT" ? "e.g. LB-SMITH-1" : "e.g. RB-1"}
          hint="Leave it empty to go back to the number."
        />
        <Field
          label="Capacity"
          value={form.capacity}
          onChange={(v) => setForm({ ...form, capacity: v })}
          keyboard="numeric"
          hint="Cannot go below the number of birds already in it."
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button label="Save" onPress={saveEdit} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={redoing != null}
        title={phase === "LOFT" ? "Re-assign all baskets?" : "Re-assign all race baskets?"}
        body={
          phase === "LOFT"
            ? "Birds are already assigned to loft baskets. Running Set baskets will clear all existing assignments and re-assign them by breeder. This cannot be undone. You will see the plan before anything is saved."
            : "Birds are already assigned to race baskets. This will clear all existing race assignments and redistribute randomly. This cannot be undone. You will see the plan before anything is saved."
        }
        confirmLabel="Preview"
        tone="primary"
        pending={action.pending}
        onConfirm={() => {
          const mode = redoing;
          setRedoing(null);
          if (mode) preview(mode);
        }}
        onCancel={() => setRedoing(null)}
      />

      <Confirm
        open={clearing != null}
        title={`Clear basket #${clearing?.basketNo ?? ""}?`}
        body={
          clearing && filled(clearing) > 0
            ? `${filled(clearing)} bird(s) will be unassigned and need to be reassigned. The basket itself stays.`
            : "Basket is empty."
        }
        confirmLabel="Clear basket"
        pending={action.pending}
        onConfirm={clear}
        onCancel={() => setClearing(null)}
      />

      <Confirm
        open={removing != null}
        title={`Delete basket #${removing?.basketNo ?? ""}?`}
        body={`${
          removing && filled(removing) > 0
            ? `${filled(removing)} bird(s) will be unassigned and need to be reassigned. `
            : ""
        }This cannot be undone.`}
        confirmLabel="Delete basket"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
