import React, { useMemo, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
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
  SearchBar,
  Sheet,
} from "@/components/admin/ui";
import { GroupStats, type GroupStatsData } from "@/components/admin/GroupStats";
import { GroupVaccinations, type Vaccination } from "@/components/admin/GroupVaccinations";
import {
  bandOf,
  Caption,
  personName,
  Pill,
  type PillTone,
  ScanField,
  shortBand,
} from "@/components/admin/scan";

type GroupType = "LOFT" | "TAG_COLOR" | "STATUS" | "DEFAULTER" | "CUSTOM";

interface Member {
  id: number;
  bird: {
    id: number;
    band: string | null;
    band1: string | null;
    band2: string | null;
    band3: string | null;
    band4: string | null;
    color: string | null;
  } | null;
  eventInventory?: {
    breeder?: { id: number; firstName: string | null; lastName: string | null } | null;
  } | null;
  groupHistory?: { fromGroupName: string; movedAt: string }[];
  breederHistory?: { fromBreederName: string; transferredAt: string }[];
}

interface Group {
  id: number;
  name: string;
  type: GroupType;
  status: "OPEN" | "CLOSED";
  hasCapacity: boolean;
  capacity: number | null;
  color: string | null;
  statusCodeId: number | null;
  notes: string | null;
  statusCode?: { id: number; code: number; label: string; color: string | null } | null;
  _count?: { members?: number; vaccinations?: number };
  vaccinations?: Vaccination[];
  members?: Member[];
}

interface StatusCode {
  id: number;
  code: number;
  label: string;
}

/** A bird that could be added: one row of the season's approved entries. */
interface Candidate {
  id: number;
  bird: {
    band: string | null;
    band1: string | null;
    band2: string | null;
    band3: string | null;
    band4: string | null;
    color: string | null;
  } | null;
  eventInventory?: { breeder?: { firstName: string | null; lastName: string | null } | null } | null;
}

interface HistoryEntry {
  id: number;
  action: string;
  detail: string | null;
  createdAt: string;
  performedBy: { name: string | null } | null;
}

interface ScanLine {
  key: string;
  band: string;
  from: string | null;
  to: string;
  at: Date;
  status: "moved" | "already" | "refused";
  said?: string;
}

const TYPES: { key: GroupType; label: string; tone: PillTone; hint: string }[] = [
  { key: "LOFT", label: "Loft", tone: "green", hint: "A physical section birds live in" },
  { key: "TAG_COLOR", label: "Tag colour", tone: "blue", hint: "Birds wearing one colour of tag" },
  { key: "STATUS", label: "Status", tone: "purple", hint: "Tied to a bird status code" },
  { key: "DEFAULTER", label: "Defaulter", tone: "rose", hint: "Birds whose entry went unpaid" },
  { key: "CUSTOM", label: "Custom", tone: "slate", hint: "Anything else" },
];

const typeOf = (t: string) => TYPES.find((x) => x.key === t) ?? TYPES[4];

/** The portal offers a free colour picker; a phone gets the ones worth tapping. */
const SWATCHES = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#475569",
  "#000000",
];

const BLANK = {
  name: "",
  type: "LOFT" as GroupType,
  status: "OPEN" as "OPEN" | "CLOSED",
  hasCapacity: true,
  capacity: "150",
  color: "",
  statusCodeId: null as number | null,
  notes: "",
};

const ACTION_TONE: Record<string, PillTone> = {
  RFID_LINKED: "blue",
  BASKET_ASSIGNED: "amber",
  GROUP_ASSIGNED: "green",
  GROUP_MOVED: "amber",
  GROUP_REMOVED: "rose",
  STATUS_CHANGED: "purple",
  RELEASED: "slate",
  ARRIVED: "green",
};

const countOf = (g: Group) => g._count?.members ?? g.members?.length ?? 0;

/** A group that cannot take another bird, and why — so the row can say so. */
function full(group: Group): string | null {
  if (!group.hasCapacity || group.capacity == null) return null;
  const count = countOf(group);
  return count >= group.capacity ? `Full (${count}/${group.capacity})` : null;
}

function CapacityBar({ count, capacity }: { count: number; capacity: number }) {
  const pct = Math.min((count / capacity) * 100, 100);
  return (
    <View className="mt-1.5 flex-row items-center gap-2">
      <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <View
          className={`h-1.5 rounded-full ${pct >= 85 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </View>
      <Text className="text-xs text-slate-500">
        {count}/{capacity} ({Math.round(pct)}%)
      </Text>
    </View>
  );
}

/**
 * Loft sections, and what has been done to the birds in them.
 *
 * Groups matter mostly as an answer to "where is this bird and has it had its
 * shots", so each one opens in place to show its vaccination record and its
 * members rather than pushing to another screen. Expanding beats navigating
 * when you are comparing two sections.
 *
 * Moving birds is the reason this screen exists on a phone rather than only in
 * the portal: it is done standing at the loft with the birds in front of you.
 * Three ways in, because all three happen — pick a bird off a section's list
 * and choose where it goes, add one that is in no section yet, or hold a
 * scanner over the tags and let each read move one.
 *
 * Everything a row can do sits behind one tap on the bird. The portal spreads
 * the same five things along the row as icons; five icons a thumb-width apart
 * is how the wrong bird gets removed.
 */
export default function EventGroups() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const action = useAdminAction();

  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState<number | null>(null);

  const base = eventId ? `/admin/event/${eventId}/groups` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    groups?: Group[];
  }>(base, [eventId]);

  const mayManage = can("groups.manage");

  // The statistics route is stricter than the list: it wants groups.view itself.
  const statsReq = useAdminData<GroupStatsData>(
    eventId && can("groups.view") ? `/admin/event/${eventId}/group-stats` : null,
    [eventId]
  );

  // Status codes are only needed by the form, and only for STATUS groups.
  const codesReq = useAdminData<{ codes?: StatusCode[] }>(
    mayManage ? "/admin/bird-status-codes" : null,
    []
  );

  // Birds that could be added. The portal reads the season's entries for this,
  // under the breeders permission, so the picker is offered on the same terms.
  const mayPick = mayManage && canAny("breeders.view", "breeders.manage");
  const entriesReq = useAdminData<{ eventInventoryItems?: Candidate[] }>(
    eventId && mayPick ? `/admin/event/${eventId}/event-inventory-items` : null,
    [eventId]
  );

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const codes = codesReq.data?.codes ?? [];

  /* --- One bird, picked off a member list --- */
  const [picked, setPicked] = useState<{ item: Member; group: Group } | null>(null);
  const [moving, setMoving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyNote, setHistoryNote] = useState<string | null>(null);

  /* --- Adding a bird that is not in this section --- */
  const [addingTo, setAddingTo] = useState<Group | null>(null);
  const [addQuery, setAddQuery] = useState("");

  /* --- Moving by tag --- */
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<number | null>(null);
  const [scanLog, setScanLog] = useState<ScanLine[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const scanLock = useRef(false);
  const seq = useRef(0);

  /* --- Creating and editing a section --- */
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [removing, setRemoving] = useState<Group | null>(null);
  const [dropping, setDropping] = useState<{ item: Member; group: Group } | null>(null);

  const done = () => {
    reload();
    statsReq.reload();
  };

  const closePicked = () => {
    setPicked(null);
    setMoving(false);
    setHistory(null);
    setHistoryNote(null);
  };

  const moveTargets: Choice[] = useMemo(() => {
    if (!picked) return [];
    return groups
      .filter((g) => g.id !== picked.group.id)
      .map((g) => {
        const why = full(g);
        return {
          key: g.id,
          label: g.name,
          hint: `${typeOf(g.type).label} · ${countOf(g)} birds${
            g.hasCapacity && g.capacity ? ` of ${g.capacity}` : ""
          }`,
          disabled: why != null,
          disabledReason: why,
        };
      });
  }, [groups, picked]);

  const move = async (toGroupId: string | number) => {
    if (!picked) return;
    const band = shortBand(bandOf(picked.item.bird)) || "That bird";
    const { ok } = await action.run("post", `${base}/move`, {
      eventInventoryItemId: picked.item.id,
      toGroupId: Number(toGroupId),
    });
    if (ok) {
      toast.success(`${band} moved.`);
      closePicked();
      done();
    }
  };

  const drop = async () => {
    if (!dropping) return;
    const { ok } = await action.run(
      "delete",
      `${base}/${dropping.group.id}/members`,
      { eventInventoryItemId: dropping.item.id },
      { success: "Bird removed from the section." }
    );
    if (ok) {
      setDropping(null);
      done();
    }
  };

  /** The bird's full event trail. A different permission from the screen's. */
  const loadHistory = async () => {
    if (!picked || !eventId) return;
    setHistoryNote("Loading…");
    try {
      const res = await api.get(`/admin/event/${eventId}/bird-history?itemId=${picked.item.id}`);
      setHistory(res.data?.history ?? []);
      setHistoryNote(null);
    } catch (err: any) {
      const status = err?.response?.status;
      setHistoryNote(
        status === 401 || status === 403
          ? "The event trail is not part of your access."
          : (err?.response?.data?.message ?? "Could not load the trail just now.")
      );
    }
  };

  const candidates = useMemo(() => {
    if (!addingTo) return [];
    const inside = new Set((addingTo.members ?? []).map((m) => m.id));
    const q = addQuery.trim().toLowerCase();
    return (entriesReq.data?.eventInventoryItems ?? [])
      .filter((c) => !inside.has(c.id))
      .filter((c) => {
        if (!q) return true;
        return (
          bandOf(c.bird).toLowerCase().includes(q) ||
          personName(c.eventInventory?.breeder).toLowerCase().includes(q)
        );
      });
  }, [addingTo, addQuery, entriesReq.data]);

  const addBird = async (itemId: string | number) => {
    if (!addingTo) return;
    const { ok } = await action.run(
      "post",
      `${base}/${addingTo.id}/members`,
      { eventInventoryItemIds: [Number(itemId)] },
      { success: `Added to ${addingTo.name}.` }
    );
    if (ok) {
      setAddingTo(null);
      setAddQuery("");
      done();
    }
  };

  /**
   * One tag, one move.
   *
   * The call is made directly rather than through the action hook because the
   * refusals belong in the running list, not in a toast that has gone by the
   * time the next bird is in hand. A bird already in the target is a fact, not
   * an error: re-reading a tag you have just read is the normal way to lose
   * your place.
   */
  const scanMove = async (rfid: string) => {
    const target = groups.find((g) => g.id === scanTarget);
    if (!target || scanLock.current) return;
    scanLock.current = true;
    setScanBusy(true);

    const line = (extra: Omit<ScanLine, "key" | "at" | "to">) => {
      seq.current += 1;
      setScanLog((prev) =>
        [{ key: String(seq.current), at: new Date(), to: target.name, ...extra }, ...prev].slice(0, 60)
      );
    };

    try {
      const res = await api.post(`${base}/scan-move`, { rfid, targetGroupId: target.id });
      const said = res.data ?? {};
      if (said.alreadyInGroup) {
        line({ band: said.band ?? rfid, from: target.name, status: "already" });
      } else {
        line({ band: said.band ?? rfid, from: said.fromGroup ?? null, status: "moved" });
        done();
      }
    } catch (err: any) {
      line({
        band: rfid,
        from: null,
        status: "refused",
        said: err?.response?.data?.message ?? "Not accepted",
      });
    } finally {
      scanLock.current = false;
      setScanBusy(false);
    }
  };

  const startNew = () => {
    setForm(BLANK);
    setEditing("new");
  };

  const startEdit = (g: Group) => {
    setForm({
      name: g.name,
      type: g.type,
      status: g.status,
      hasCapacity: g.hasCapacity,
      capacity: g.capacity ? String(g.capacity) : "150",
      color: g.color ?? "",
      statusCodeId: g.statusCodeId,
      notes: g.notes ?? "",
    });
    setEditing(g);
  };

  const saveGroup = async () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      toast.error("Give the section a name.");
      return;
    }
    const capacity = parseInt(form.capacity.trim(), 10);
    if (form.hasCapacity && (isNaN(capacity) || capacity <= 0)) {
      toast.error("Capacity has to be a whole number above zero.");
      return;
    }
    const color = form.color.trim();
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      toast.error("A colour is written like #2563eb.");
      return;
    }

    const body = {
      name: trimmed,
      type: form.type,
      hasCapacity: form.hasCapacity,
      capacity: form.hasCapacity ? capacity : null,
      color: color || null,
      statusCodeId: form.type === "STATUS" ? form.statusCodeId : null,
      notes: form.notes.trim() || null,
    };

    const { ok } =
      editing === "new"
        ? await action.run("post", base!, body, { success: `"${trimmed}" created.` })
        : await action.run(
            "patch",
            `${base}/${(editing as Group).id}`,
            { ...body, status: form.status },
            { success: "Section updated." }
          );

    if (ok) {
      setEditing(null);
      done();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}/${removing.id}`, undefined, {
      success: `"${removing.name}" deleted.`,
    });
    if (ok) {
      setRemoving(null);
      done();
    }
  };

  if (forbidden) return <NoAccess what="Groups" />;

  const members = groups.reduce((s, g) => s + countOf(g), 0);
  const shots = groups.reduce(
    (s, g) => s + (g._count?.vaccinations ?? g.vaccinations?.length ?? 0),
    0
  );
  const target = groups.find((g) => g.id === scanTarget) ?? null;

  return (
    <Screen
      title="Groups"
      subtitle={name ? `${name} · ${groups.length} groups` : `${groups.length} groups`}
      onRefresh={() => {
        refresh();
        statsReq.reload();
      }}
      refreshing={refreshing}
      header={
        mayManage ? (
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Button label="New group" icon="add" onPress={startNew} />
            <Button
              label="Scan"
              tone="secondary"
              icon="scan-outline"
              disabled={groups.length === 0}
              onPress={() => {
                setScanLog([]);
                setScanOpen(true);
              }}
            />
          </View>
        ) : null
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Groups" value={groups.length} basis="31%" />
            <Figure label="Birds placed" value={members} basis="31%" />
            <Figure label="Vaccinations" value={shots} basis="31%" />
          </FigureRow>

          <GroupStats req={statsReq} />

          <View className="mt-4" style={{ gap: 10 }}>
            {groups.length === 0 ? (
              <Empty>No groups yet. Create one to start organising birds.</Empty>
            ) : (
              groups.map((group) => {
                const count = countOf(group);
                const isOpen = open === group.id;
                const type = typeOf(group.type);
                const list = group.members ?? [];
                const shown = showAll === group.id ? list : list.slice(0, 40);
                const vacs = group.vaccinations ?? [];
                const vacCount = group._count?.vaccinations ?? vacs.length;
                return (
                  <View
                    key={group.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : group.id)}
                      className="px-4 py-3"
                    >
                      <View className="flex-row items-center gap-2">
                        {group.color ? (
                          <View
                            className="h-3.5 w-3.5 rounded-full border border-slate-300"
                            style={{ backgroundColor: group.color }}
                          />
                        ) : null}
                        <Text className="min-w-0 flex-1 font-medium text-slate-900" numberOfLines={1}>
                          {group.name}
                        </Text>
                        <Ionicons
                          name={isOpen ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#94a3b8"
                        />
                      </View>
                      <View className="mt-1.5 flex-row flex-wrap items-center" style={{ gap: 6 }}>
                        <Pill label={type.label} tone={type.tone} />
                        <Pill
                          label={group.status}
                          tone={group.status === "OPEN" ? "green" : "slate"}
                        />
                        {group.statusCode?.label ? <Pill label={group.statusCode.label} /> : null}
                        {vacCount > 0 ? (
                          <Pill
                            label={`${vacCount} vaccination${vacCount === 1 ? "" : "s"}`}
                            tone="cyan"
                          />
                        ) : null}
                        {!group.hasCapacity || group.capacity == null ? (
                          <Text className="text-xs text-slate-500">{count} birds</Text>
                        ) : null}
                      </View>
                      {group.hasCapacity && group.capacity != null ? (
                        <CapacityBar count={count} capacity={group.capacity} />
                      ) : null}
                    </Pressable>

                    {isOpen && (
                      <View className="border-t border-slate-100 px-4 py-3">
                        {group.notes ? (
                          <Text className="mb-3 text-sm text-slate-600">{group.notes}</Text>
                        ) : null}

                        {mayManage ? (
                          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                            <Button
                              label="Scan birds in"
                              icon="scan-outline"
                              onPress={() => {
                                setScanTarget(group.id);
                                setScanLog([]);
                                setScanOpen(true);
                              }}
                            />
                            {mayPick ? (
                              <Button
                                label="Add bird"
                                tone="secondary"
                                icon="add"
                                onPress={() => {
                                  setAddQuery("");
                                  setAddingTo(group);
                                }}
                              />
                            ) : null}
                            <Button
                              label="Edit"
                              tone="secondary"
                              icon="create-outline"
                              onPress={() => startEdit(group)}
                            />
                            <Button
                              label="Delete"
                              tone="secondary"
                              icon="trash-outline"
                              onPress={() => setRemoving(group)}
                            />
                          </View>
                        ) : null}

                        <Caption>Birds ({count})</Caption>
                        {list.length === 0 ? (
                          <Text className="text-xs text-slate-500">No birds yet.</Text>
                        ) : (
                          <Rows>
                            {shown.map((m) => {
                              const moved =
                                (m.groupHistory?.length ?? 0) + (m.breederHistory?.length ?? 0) > 0;
                              return (
                                <Row
                                  key={m.id}
                                  title={shortBand(bandOf(m.bird)) || "No band"}
                                  subtitle={
                                    [m.bird?.color, personName(m.eventInventory?.breeder)]
                                      .filter(Boolean)
                                      .join(" · ") || undefined
                                  }
                                  badge={
                                    moved
                                      ? { label: "moved", bg: "bg-amber-100", text: "text-amber-700" }
                                      : null
                                  }
                                  onPress={() => setPicked({ item: m, group })}
                                />
                              );
                            })}
                          </Rows>
                        )}
                        {list.length > 40 && showAll !== group.id ? (
                          <Pressable onPress={() => setShowAll(group.id)} className="mt-2">
                            <Text className="text-xs font-medium text-cyan-700">
                              Showing 40 of {list.length} — show all
                            </Text>
                          </Pressable>
                        ) : null}

                        {/* The portal shows the record on loft groups, and on any
                            other group that already has one. */}
                        {group.type === "LOFT" || vacs.length > 0 ? (
                          <GroupVaccinations
                            base={base!}
                            groupId={group.id}
                            groupName={group.name}
                            vaccinations={vacs}
                            mayManage={mayManage}
                            onChanged={done}
                          />
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      {/* One bird: where it has been, and what can be done with it. */}
      <Sheet
        open={picked != null}
        onClose={closePicked}
        title={shortBand(bandOf(picked?.item.bird)) || "Bird"}
        subtitle={
          [
            picked?.group.name,
            picked?.item.bird?.color,
            personName(picked?.item.eventInventory?.breeder),
          ]
            .filter(Boolean)
            .join(" · ") || null
        }
      >
        {moving ? (
          <>
            <Caption>Move to</Caption>
            <ChoiceList
              choices={moveTargets}
              onPick={move}
              empty="There is nowhere else to put it."
            />
            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setMoving(false)} full />
            </ButtonRow>
          </>
        ) : (
          <>
            <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
              {mayManage ? (
                <>
                  <Button
                    label="Move"
                    icon="swap-horizontal-outline"
                    onPress={() => setMoving(true)}
                  />
                  <Button
                    label="Remove"
                    tone="secondary"
                    icon="remove-circle-outline"
                    onPress={() => {
                      const p = picked;
                      closePicked();
                      if (p) setDropping(p);
                    }}
                  />
                </>
              ) : null}
              {picked?.item.bird?.id && canAny("birds.view", "birds.manage") ? (
                <Button
                  label="Open bird"
                  tone="secondary"
                  icon="open-outline"
                  onPress={() => {
                    const id = picked.item.bird!.id;
                    closePicked();
                    router.push(`/(admin)/bird-detail?birdId=${id}` as never);
                  }}
                />
              ) : null}
            </View>

            {(picked?.item.groupHistory?.length ?? 0) +
              (picked?.item.breederHistory?.length ?? 0) >
            0 ? (
              <>
                <Caption>Where it came from</Caption>
                {(picked?.item.groupHistory ?? []).map((h, i) => (
                  <Text key={`g${i}`} className="text-xs text-slate-600">
                    Group: {h.fromGroupName} → here ({new Date(h.movedAt).toLocaleDateString()})
                  </Text>
                ))}
                {(picked?.item.breederHistory ?? []).map((h, i) => (
                  <Text key={`b${i}`} className="text-xs text-slate-600">
                    Breeder: {h.fromBreederName} ({new Date(h.transferredAt).toLocaleDateString()})
                  </Text>
                ))}
              </>
            ) : null}

            <Caption>Event trail</Caption>
            {history == null ? (
              historyNote ? (
                <Text className="text-xs text-slate-500">{historyNote}</Text>
              ) : (
                <Button
                  label="Show what has happened to it"
                  tone="secondary"
                  icon="time-outline"
                  onPress={loadHistory}
                />
              )
            ) : history.length === 0 ? (
              <Text className="text-xs text-slate-500">No history yet.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {history.map((e) => (
                  <View key={e.id}>
                    <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
                      <Pill
                        label={e.action.replace(/_/g, " ")}
                        tone={ACTION_TONE[e.action] ?? "slate"}
                      />
                      <Text className="text-xs text-slate-400">
                        {new Date(e.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    {e.detail ? (
                      <Text className="mt-0.5 text-sm text-slate-800">{e.detail}</Text>
                    ) : null}
                    {e.performedBy?.name ? (
                      <Text className="text-xs text-slate-500">{e.performedBy.name}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </Sheet>

      <Sheet
        open={addingTo != null}
        onClose={() => setAddingTo(null)}
        title={`Add a bird to ${addingTo?.name ?? "the section"}`}
        subtitle="Any approved entry of this season that is not already here"
      >
        <View className="mt-3">
          <SearchBar value={addQuery} onChange={setAddQuery} placeholder="Band or breeder" />
        </View>
        {entriesReq.loading ? (
          <Loading />
        ) : entriesReq.forbidden ? (
          <Notice>The list of entries is not part of your access. Scan the bird in instead.</Notice>
        ) : (
          <>
            <ChoiceList
              choices={candidates.slice(0, 40).map((c) => ({
                key: c.id,
                label: shortBand(bandOf(c.bird)) || "No band",
                hint:
                  [c.bird?.color, personName(c.eventInventory?.breeder)].filter(Boolean).join(" · ") ||
                  null,
              }))}
              onPick={addBird}
              empty={addQuery.trim() ? "No entry matches that search." : "Every entry is already here."}
            />
            {candidates.length > 40 ? (
              <Text className="mt-2 text-center text-xs text-slate-400">
                Showing 40 of {candidates.length} — search to narrow it down.
              </Text>
            ) : null}
          </>
        )}
      </Sheet>

      <Sheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Scan birds into a group"
        subtitle={target ? `Every read moves that bird to ${target.name}` : "Pick the group first"}
      >
        {target ? (
          <View className="mt-3">
            <Pressable
              onPress={() => setScanTarget(null)}
              className="mb-2 flex-row items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2"
            >
              <Ionicons name="arrow-forward" size={14} color="#059669" />
              <Text className="flex-1 text-sm text-emerald-900">
                Into {target.name} ({typeOf(target.type).label})
              </Text>
              <Text className="text-xs font-medium text-emerald-700">Change</Text>
            </Pressable>
            {/* Mounted only while the sheet is open, so closing it stops the
                network reader as well. */}
            {scanOpen ? <ScanField onRead={scanMove} pending={scanBusy} /> : null}

            {scanLog.length > 0 ? (
              <>
                <Caption>
                  {scanLog.filter((l) => l.status === "moved").length} moved ·{" "}
                  {scanLog.filter((l) => l.status === "already").length} already here ·{" "}
                  {scanLog.filter((l) => l.status === "refused").length} refused
                </Caption>
                <Rows>
                  {scanLog.map((l) => (
                    <Row
                      key={l.key}
                      title={shortBand(l.band)}
                      subtitle={
                        l.status === "refused"
                          ? l.said
                          : `${l.from ?? "—"} → ${l.to} · ${l.at.toLocaleTimeString()}`
                      }
                      right={
                        l.status === "moved"
                          ? "Moved"
                          : l.status === "already"
                            ? "Already here"
                            : "Refused"
                      }
                      rightTone={
                        l.status === "moved"
                          ? "text-emerald-600"
                          : l.status === "already"
                            ? "text-slate-400"
                            : "text-rose-600"
                      }
                    />
                  ))}
                </Rows>
              </>
            ) : (
              <Text className="mt-4 text-center text-xs text-slate-400">Nothing scanned yet.</Text>
            )}
          </View>
        ) : (
          <ChoiceList
            choices={groups.map((g) => ({
              key: g.id,
              label: g.name,
              hint: `${typeOf(g.type).label} · ${countOf(g)} birds`,
            }))}
            onPick={(k) => {
              setScanTarget(Number(k));
              setScanLog([]);
            }}
            empty="There are no groups to scan into."
          />
        )}
      </Sheet>

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New group" : "Edit group"}
      >
        <Field
          label="Name *"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="e.g. Loft A, Red Tag, Hospital"
        />

        <Caption>Type</Caption>
        <ChoiceList
          choices={TYPES.map((t) => ({ key: t.key, label: t.label, hint: t.hint }))}
          selected={form.type}
          onPick={(k) => setForm({ ...form, type: k as GroupType, statusCodeId: null })}
        />

        {form.type === "STATUS" ? (
          <>
            <Caption>Status code</Caption>
            <ChoiceList
              choices={codes.map((c) => ({ key: c.id, label: `${c.label} (${c.code})` }))}
              selected={form.statusCodeId}
              onPick={(k) => setForm({ ...form, statusCodeId: Number(k) })}
              empty="No status codes have been set up."
            />
          </>
        ) : null}

        {editing !== "new" ? (
          <>
            <Caption>Status</Caption>
            <ChoiceList
              choices={[
                { key: "OPEN", label: "Open", hint: "Scans at check-in file birds here" },
                { key: "CLOSED", label: "Closed", hint: "Kept, but no longer filled by scanning" },
              ]}
              selected={form.status}
              onPick={(k) => setForm({ ...form, status: k as "OPEN" | "CLOSED" })}
            />
          </>
        ) : null}

        <View className="mt-4 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-medium text-slate-800">Has a capacity limit</Text>
            <Text className="text-xs text-slate-500">
              A group with a limit refuses birds once it is full.
            </Text>
          </View>
          <Switch
            value={form.hasCapacity}
            onValueChange={(v) => setForm({ ...form, hasCapacity: v })}
          />
        </View>
        {form.hasCapacity ? (
          <Field
            label="Capacity"
            value={form.capacity}
            onChange={(v) => setForm({ ...form, capacity: v })}
            keyboard="numeric"
          />
        ) : null}

        <Caption>Colour (optional)</Caption>
        <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
          {SWATCHES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setForm({ ...form, color: c })}
              className={`h-8 w-8 rounded-full border-2 ${
                form.color.toLowerCase() === c ? "border-slate-900" : "border-white"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <Pressable onPress={() => setForm({ ...form, color: "" })} hitSlop={6}>
            <Text className="text-xs font-medium text-slate-600">Clear</Text>
          </Pressable>
        </View>
        <Field
          label="Or a hex value"
          value={form.color}
          onChange={(v) => setForm({ ...form, color: v })}
          placeholder="#2563eb"
        />

        <Field
          label="Notes"
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
          multiline
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button
            label={editing === "new" ? "Create" : "Save"}
            onPress={saveGroup}
            pending={action.pending}
            full
          />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={dropping != null}
        title={`Remove ${shortBand(bandOf(dropping?.item.bird)) || "this bird"}?`}
        body={`It leaves ${dropping?.group.name ?? "the section"} and sits in no group until it is placed again. The bird stays entered in the event.`}
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={drop}
        onCancel={() => setDropping(null)}
      />

      <Confirm
        open={removing != null}
        title={`Delete ${removing?.name ?? "this group"}?`}
        body={
          removing && countOf(removing) > 0
            ? `Its ${countOf(removing)} birds will be ungrouped, and its vaccination records go with it.`
            : "The group and its vaccination records are removed from this season."
        }
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
