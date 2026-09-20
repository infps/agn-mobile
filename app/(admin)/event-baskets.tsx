import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  type Choice,
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
  Sheet,
} from "@/components/admin/ui";

interface Assignment {
  id: number;
  inventoryItem?: {
    id: number;
    bird?: { id: number; band: string | null; birdName: string | null; rfid: string | null } | null;
    eventInventory?: {
      loft: string | null;
      breeder?: { firstName: string | null; lastName: string | null } | null;
    } | null;
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

/** What the assigner says it would do, before it is allowed to do it. */
interface Plan {
  preview: boolean;
  heldBack?: number;
  assigned?: { label: string | null; basketNo: number; birdCount: number }[];
  unassigned?: { label: string | null; birdCount: number }[];
  summary?: {
    assignedGroups: number;
    unassignedGroups: number;
    totalBirds: number;
    assignedBirds: number;
  };
}

/**
 * Baskets, and how full they are.
 *
 * A basket is really a number and a fill level, which is what the row shows.
 * The two phases are kept apart because a loft basket and a race basket can
 * share a number without being the same thing — the database allows it, and
 * mixing them on one list would make a real basket look double-booked.
 *
 * Filling them is the work. Three ways, because the portal has three and they
 * are not interchangeable: fill everything at once by breeder, drop one bird in
 * by scanning its tag, or clear a basket and start it again.
 *
 * The bulk assigner always previews first. It can move every bird in the season
 * in one press, and an operator is entitled to see that plan before it becomes
 * the truth — the portal works this way and the phone must not be the looser
 * of the two.
 */
export default function EventBaskets() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [phase, setPhase] = useState<"LOFT" | "RACE">("LOFT");
  const [open, setOpen] = useState<number | null>(null);

  const base = eventId ? `/admin/event/${eventId}/baskets` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    baskets?: Basket[];
  }>(base, [eventId]);

  // Race baskets belong to a race, so creating or filling one needs the list.
  const racesReq = useAdminData<{ races?: Race[] }>(
    eventId ? `/admin/race?eventId=${eventId}` : null,
    [eventId]
  );

  const all = useMemo(() => data?.baskets ?? [], [data]);
  const baskets = useMemo(
    () => all.filter((b) => b.phase === phase).sort((a, b) => a.basketNo - b.basketNo),
    [all, phase]
  );
  const races = useMemo(() => racesReq.data?.races ?? [], [racesReq.data]);
  const mayManage = can("baskets.manage");

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ capacity: "", label: "", raceId: null as number | null });

  const [renaming, setRenaming] = useState<Basket | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const [clearing, setClearing] = useState<Basket | null>(null);
  const [removing, setRemoving] = useState<Basket | null>(null);

  const [scanning, setScanning] = useState(false);
  const [tag, setTag] = useState("");
  const [log, setLog] = useState<{ key: string; text: string; ok: boolean }[]>([]);
  const tagRef = useRef<TextInput>(null);
  const seq = useRef(0);

  // The bulk assigner: a chosen mode, then the plan it returns, then the commit.
  const [planning, setPlanning] = useState(false);
  const [mode, setMode] = useState<string | number | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planRaceId, setPlanRaceId] = useState<number | null>(null);

  const filled = (b: Basket) => b._count?.assignments ?? b.assignments?.length ?? 0;
  const placed = baskets.reduce((s, b) => s + filled(b), 0);
  const space = baskets.reduce((s, b) => s + b.capacity, 0);

  const raceLabel = (r: Race) => r.name ?? `Race ${r.raceNumber ?? r.id}`;

  const create = async () => {
    const capacity = parseInt(form.capacity.trim(), 10);
    if (!form.capacity.trim() || isNaN(capacity) || capacity <= 0) {
      toast.error("Capacity has to be a whole number above zero.");
      return;
    }
    if (phase === "RACE" && form.raceId == null) {
      toast.error("A race basket has to belong to a race.");
      return;
    }

    const { ok } = await action.run(
      "post",
      base!,
      {
        capacity,
        phase,
        label: form.label.trim() || undefined,
        ...(phase === "RACE" ? { raceId: form.raceId } : {}),
      },
      { success: "Basket created." }
    );
    if (ok) {
      setCreating(false);
      setForm({ capacity: "", label: "", raceId: null });
      reload();
    }
  };

  const rename = async () => {
    if (!renaming) return;
    const { ok } = await action.run(
      "patch",
      base!,
      { basketId: renaming.id, label: newLabel.trim() },
      { success: "Basket renamed." }
    );
    if (ok) {
      setRenaming(null);
      reload();
    }
  };

  const clear = async () => {
    if (!clearing) return;
    const { ok } = await action.run(
      "patch",
      base!,
      { basketId: clearing.id, action: "clear" },
      { success: "Basket emptied." }
    );
    if (ok) {
      setClearing(null);
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", base!, { basketId: removing.id }, {
      success: "Basket deleted.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  /**
   * A tag read into a loft basket.
   *
   * The endpoint answers 200 for outcomes that are not failures — a bird
   * already placed, a tag it had to link first — so the response is read rather
   * than assumed. The running list is the only way to notice a scanner that has
   * started repeating itself.
   */
  const scanIn = async () => {
    const rfid = tag.trim();
    if (!rfid || action.pending) return;

    const { ok, data: said } = await action.run<{ message?: string; alreadyAssigned?: boolean }>(
      "post",
      `${base}/scan-loft`,
      { rfid }
    );

    if (ok) {
      seq.current += 1;
      setLog((prev) =>
        [
          {
            key: String(seq.current),
            text: `${rfid} · ${said?.message ?? "placed"}`,
            ok: said?.alreadyAssigned !== true,
          },
          ...prev,
        ].slice(0, 25)
      );
      reload();
    }
    setTag("");
    tagRef.current?.focus();
  };

  const MODES: Choice[] =
    phase === "LOFT"
      ? [
          {
            key: "shuffle",
            label: "Reshuffle everything",
            hint: "Clears every loft basket and redistributes all birds by breeder",
          },
          {
            key: "assign",
            label: "Place the unbasketed only",
            hint: "Leaves birds already in a basket where they are",
          },
        ]
      : [
          {
            key: "reset",
            label: "Rebuild for this race",
            hint: "Clears the race baskets and fills them again",
          },
          {
            key: "incremental",
            label: "Top up",
            hint: "Adds birds that are not yet in a race basket",
          },
        ];

  const assignPath = phase === "LOFT" ? `${base}/assign` : `${base}/assign-race`;

  const buildPlan = async (picked: string | number) => {
    setMode(picked);
    if (phase === "RACE" && planRaceId == null) {
      toast.error("Pick the race first.");
      return;
    }
    const { ok, data: got } = await action.run<Plan>("post", assignPath, {
      preview: true,
      mode: picked,
      ...(phase === "RACE" ? { raceId: planRaceId } : {}),
    });
    if (ok && got) setPlan(got);
  };

  const applyPlan = async () => {
    if (mode == null) return;
    const { ok, data: got } = await action.run<Plan>("post", assignPath, {
      preview: false,
      mode,
      ...(phase === "RACE" ? { raceId: planRaceId } : {}),
    });
    if (ok) {
      toast.success(`${got?.summary?.assignedBirds ?? 0} birds basketed.`);
      setPlan(null);
      setMode(null);
      setPlanning(false);
      reload();
    }
  };

  const closePlanner = () => {
    setPlanning(false);
    setPlan(null);
    setMode(null);
  };

  if (forbidden) return <NoAccess what="Baskets" />;

  return (
    <Screen
      title="Baskets"
      subtitle={name ?? undefined}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <>
          <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
            {(["LOFT", "RACE"] as const).map((p) => {
              const active = p === phase;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    setPhase(p);
                    setOpen(null);
                  }}
                  className={`flex-1 rounded-lg py-2 ${active ? "bg-blue-600" : ""}`}
                >
                  <Text
                    className={`text-center text-sm font-medium ${
                      active ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {p === "LOFT" ? "Loft baskets" : "Race baskets"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mayManage ? (
            <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
              <Button label="Fill baskets" icon="shuffle-outline" onPress={() => setPlanning(true)} />
              {phase === "LOFT" ? (
                <Button
                  label="Scan in"
                  tone="secondary"
                  icon="scan-outline"
                  onPress={() => {
                    setScanning(true);
                    setTag("");
                  }}
                />
              ) : null}
              <Button
                label="New basket"
                tone="secondary"
                icon="add"
                onPress={() => {
                  setForm({ capacity: "", label: "", raceId: null });
                  setCreating(true);
                }}
              />
            </View>
          ) : null}
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Baskets" value={baskets.length} basis="31%" />
            <Figure label="Birds placed" value={placed} basis="31%" />
            <Figure
              label="Spaces left"
              value={Math.max(0, space - placed)}
              tone={space - placed <= 0 ? "text-rose-600" : "text-slate-900"}
              basis="31%"
            />
          </FigureRow>

          <View className="mt-4" style={{ gap: 10 }}>
            {baskets.length === 0 ? (
              <Empty>
                No {phase === "LOFT" ? "loft" : "race"} baskets have been created for this season.
              </Empty>
            ) : (
              baskets.map((basket) => {
                const count = filled(basket);
                const isFull = count >= basket.capacity;
                const isOpen = open === basket.id;
                return (
                  <View
                    key={basket.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : basket.id)}
                      className="flex-row items-center gap-3 px-4 py-3"
                    >
                      <View className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                        <Text className="text-sm font-bold text-slate-700">{basket.basketNo}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-medium text-slate-900">
                          {basket.label ?? `Basket ${basket.basketNo}`}
                        </Text>
                        <Text className={`text-xs ${isFull ? "text-rose-600" : "text-slate-500"}`}>
                          {count} of {basket.capacity}
                          {isFull ? " · full" : ""}
                        </Text>
                      </View>
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
                              label="Rename"
                              tone="secondary"
                              icon="create-outline"
                              onPress={() => {
                                setNewLabel(basket.label ?? "");
                                setRenaming(basket);
                              }}
                            />
                            <Button
                              label="Empty"
                              tone="secondary"
                              icon="remove-circle-outline"
                              onPress={() => setClearing(basket)}
                              disabled={count === 0}
                            />
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
                          <Rows>
                            {(basket.assignments ?? []).slice(0, 40).map((a) => {
                              const b = a.inventoryItem?.bird;
                              const who = `${
                                a.inventoryItem?.eventInventory?.breeder?.firstName ?? ""
                              } ${a.inventoryItem?.eventInventory?.breeder?.lastName ?? ""}`.trim();
                              return (
                                <Row
                                  key={a.id}
                                  title={b?.band ?? "No band"}
                                  subtitle={
                                    who || a.inventoryItem?.eventInventory?.loft || undefined
                                  }
                                  leading={
                                    <Ionicons
                                      name={b?.rfid ? "radio" : "radio-outline"}
                                      size={14}
                                      color={b?.rfid ? "#059669" : "#cbd5e1"}
                                    />
                                  }
                                />
                              );
                            })}
                          </Rows>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      <Sheet
        open={planning}
        onClose={closePlanner}
        title={plan ? "This is what it would do" : "Fill baskets"}
        subtitle={
          plan
            ? "Nothing has changed yet"
            : phase === "LOFT"
              ? "Birds are grouped by breeder"
              : "Pick the race, then how to fill it"
        }
      >
        {plan ? (
          <View className="mt-2">
            <FigureRow>
              <Figure label="Birds placed" value={plan.summary?.assignedBirds ?? 0} basis="47%" />
              <Figure
                label="Left over"
                value={(plan.summary?.totalBirds ?? 0) - (plan.summary?.assignedBirds ?? 0)}
                tone={
                  (plan.summary?.totalBirds ?? 0) - (plan.summary?.assignedBirds ?? 0) > 0
                    ? "text-amber-600"
                    : "text-slate-900"
                }
                basis="47%"
              />
            </FigureRow>

            {plan.heldBack ? (
              <Notice>
                {plan.heldBack} birds are held back — unpaid, or not fit to fly.
              </Notice>
            ) : null}

            {(plan.unassigned ?? []).length > 0 ? (
              <Notice tone="rose">
                {(plan.unassigned ?? []).length} breeders would get no basket:{" "}
                {(plan.unassigned ?? [])
                  .slice(0, 4)
                  .map((u) => u.label ?? "unnamed")
                  .join(", ")}
                {(plan.unassigned ?? []).length > 4 ? "…" : ""}
              </Notice>
            ) : null}

            <Text className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Baskets that would fill
            </Text>
            <Rows>
              {(plan.assigned ?? []).slice(0, 30).map((a, i) => (
                <Row
                  key={`${a.basketNo}-${i}`}
                  title={a.label ?? "Unnamed breeder"}
                  subtitle={`Basket ${a.basketNo}`}
                  right={`${a.birdCount}`}
                />
              ))}
            </Rows>

            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setPlan(null)} full />
              <Button label="Apply it" onPress={applyPlan} pending={action.pending} full />
            </ButtonRow>
          </View>
        ) : (
          <View className="mt-2">
            {phase === "RACE" ? (
              <>
                <Text className="mb-1 text-xs font-medium text-slate-600">Race</Text>
                <ChoiceList
                  choices={races.map((r) => ({
                    key: r.id,
                    label: raceLabel(r),
                    hint: r.status.toLowerCase(),
                  }))}
                  selected={planRaceId}
                  onPick={(k) => setPlanRaceId(Number(k))}
                  empty="This event has no races yet."
                />
                <View className="h-3" />
              </>
            ) : null}
            <Text className="mb-1 text-xs font-medium text-slate-600">How</Text>
            <ChoiceList choices={MODES} onPick={buildPlan} selected={mode} />
            {action.pending ? (
              <Text className="mt-3 text-center text-xs text-slate-400">Working out the plan…</Text>
            ) : null}
          </View>
        )}
      </Sheet>

      <Sheet
        open={scanning}
        onClose={() => setScanning(false)}
        title="Scan birds into baskets"
        subtitle="Each tag goes to its breeder's basket"
      >
        <View className="mt-2">
          <TextInput
            ref={tagRef}
            value={tag}
            onChangeText={setTag}
            onSubmitEditing={scanIn}
            placeholder="Hold the scanner over a tag"
            placeholderTextColor="#94a3b8"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            className="rounded-lg border-2 border-cyan-600 bg-white px-3 py-3 text-base text-slate-900"
          />
          <ButtonRow>
            <Button
              label="Place it"
              onPress={scanIn}
              pending={action.pending}
              disabled={!tag.trim()}
              full
            />
          </ButtonRow>

          {log.length > 0 ? (
            <View className="mt-4">
              <Text className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Last reads
              </Text>
              {log.map((line) => (
                <Text
                  key={line.key}
                  className={`text-xs ${line.ok ? "text-slate-600" : "text-amber-700"}`}
                  numberOfLines={1}
                >
                  {line.text}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </Sheet>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={phase === "LOFT" ? "New loft basket" : "New race basket"}
      >
        {phase === "RACE" ? (
          <>
            <Text className="mb-1 mt-3 text-xs font-medium text-slate-600">Race</Text>
            <ChoiceList
              choices={races.map((r) => ({ key: r.id, label: raceLabel(r) }))}
              selected={form.raceId}
              onPick={(k) => setForm({ ...form, raceId: Number(k) })}
              empty="This event has no races yet."
            />
          </>
        ) : null}
        <Field
          label="Capacity"
          value={form.capacity}
          onChange={(v) => setForm({ ...form, capacity: v })}
          placeholder="25"
          keyboard="numeric"
        />
        <Field
          label="Label"
          value={form.label}
          onChange={(v) => setForm({ ...form, label: v })}
          placeholder="Optional — the number is used otherwise"
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setCreating(false)} full />
          <Button label="Create" onPress={create} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet open={renaming != null} onClose={() => setRenaming(null)} title="Rename basket">
        <Field
          label="Label"
          value={newLabel}
          onChange={setNewLabel}
          placeholder={`Basket ${renaming?.basketNo ?? ""}`}
          autoFocus
          hint="Leave it empty to go back to the number."
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setRenaming(null)} full />
          <Button label="Save" onPress={rename} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={clearing != null}
        title={`Empty basket ${clearing?.basketNo ?? ""}?`}
        body={`The ${clearing ? filled(clearing) : 0} birds in it go back to unbasketed. The basket itself stays.`}
        confirmLabel="Empty it"
        pending={action.pending}
        onConfirm={clear}
        onCancel={() => setClearing(null)}
      />

      <Confirm
        open={removing != null}
        title={`Delete basket ${removing?.basketNo ?? ""}?`}
        body={
          removing && filled(removing) > 0
            ? `It still holds ${filled(removing)} birds. They go back to unbasketed.`
            : "The basket is removed from this season."
        }
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
