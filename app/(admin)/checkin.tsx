import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { EventPicker } from "@/components/admin/EventPicker";
import {
  ChoiceList,
  Confirm,
  Empty,
  Loading,
  NoAccess,
  Notice,
  Screen,
  SearchBar,
  Sheet,
} from "@/components/admin/ui";
import type { StatusData, StatusItem } from "@/components/admin/BasketEntries";
import { personName, Pill, type PillTone, ScanField, shortBand } from "@/components/admin/scan";

interface LoftGroup {
  id: number;
  name: string;
  type: string;
  status: string;
  color: string | null;
  capacity: number | null;
  _count?: { members?: number };
}

/** What scan-loft says after it has placed a bird. */
interface Placed {
  message?: string;
  alreadyAssigned?: boolean;
  groupName?: string | null;
  groupId?: number;
  group?: { id: number; name: string; memberCount: number; capacity: number | null };
  tagColorGroup?: { id: number; name: string } | null;
  capacityWarning?: boolean;
}

interface LogLine {
  key: string;
  text: string;
  detail: string;
  ok: boolean;
}

/** The scan endpoint wants YYYYMMDDHHMMSSsss in UTC. */
function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}` +
    `${p(d.getUTCMilliseconds(), 3)}`
  );
}

/** The status column of the portal's table, in its order of precedence. */
function statusOf(item: StatusItem): { label: string; tone: PillTone } {
  if (item.isLoftBasketed) return { label: "Basketed", tone: "green" };
  if (item.isCheckedIn) return { label: "Checked in", tone: "blue" };
  if (!item.hasPaid) return { label: "Unpaid", tone: "rose" };
  return { label: "Needs RFID", tone: "slate" };
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-slate-600">
          {label}{" "}
          <Text className="font-semibold text-slate-900">
            {done}/{total}
          </Text>
        </Text>
        <Text className="text-xs text-slate-400">{Math.round(pct)}%</Text>
      </View>
      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <View className="h-1.5 rounded-full bg-cyan-600" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

/**
 * The scanning screen — the one thing the phone does better than the desktop.
 *
 * Two jobs share it because in practice one person does both with the same
 * hardware: taking a bird in at the loft, and clocking a bird as it comes home.
 * A raceId in the route means arrivals; otherwise it is intake.
 *
 * Intake is "pick the bird, then read its tag", the portal's arrangement. What
 * the read does depends on what the operator may do, exactly as the portal's
 * two routes divide it: somebody who manages baskets links the tag and files
 * the bird into the open loft section in one step; somebody who only manages
 * check-in links the tag and nothing else. Somebody who can only view sees the
 * list and the progress, and no field to scan into.
 *
 * The input keeps focus and clears itself after every read, so a hardware
 * wedge scanner can fire straight down a basket without anyone touching the
 * screen. The last few reads stay visible because that list is the only way to
 * notice a scanner that has started reading the same tag twice.
 */
export default function AdminCheckin() {
  const params = useLocalSearchParams<{ raceId?: string; eventId?: string }>();
  const { raceId } = params;
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const isArrivals = Boolean(raceId);
  const mayLink = can("checkin.manage");
  // Filing a bird into a section goes through the baskets route.
  const mayPlace = can("baskets.manage");
  const mayGroups = canAny("groups.view", "groups.manage");

  const [eventId, setEventId] = useState<number | null>(
    params.eventId ? Number(params.eventId) : null
  );
  const [query, setQuery] = useState("");
  const [breederId, setBreederId] = useState<number | null>(null);
  const [filtering, setFiltering] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [choosingGroup, setChoosingGroup] = useState(false);
  const [unlinking, setUnlinking] = useState<StatusItem | null>(null);
  const [lastPlaced, setLastPlaced] = useState<{ bird: string; said: Placed } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [sending, setSending] = useState(false);
  const [limit, setLimit] = useState(60);

  const lock = useRef(false);
  const seq = useRef(0);

  const statusReq = useAdminData<StatusData>(
    !isArrivals && eventId != null ? `/admin/event/${eventId}/checkin-status` : null,
    [eventId]
  );
  const groupsReq = useAdminData<{ groups?: LoftGroup[] }>(
    !isArrivals && eventId != null && mayGroups ? `/admin/event/${eventId}/groups` : null,
    [eventId]
  );

  const items = useMemo(() => statusReq.data?.items ?? [], [statusReq.data]);
  const loftGroups = useMemo(
    () => (groupsReq.data?.groups ?? []).filter((g) => g.type === "LOFT"),
    [groupsReq.data]
  );
  const activeGroup = loftGroups.find((g) => g.status === "OPEN") ?? null;
  const targetGroup = loftGroups.find((g) => g.id === (groupId ?? activeGroup?.id)) ?? activeGroup;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const note = (text: string, detail: string, ok: boolean) => {
    seq.current += 1;
    setLog((prev) => [{ key: `${seq.current}`, text, detail, ok }, ...prev].slice(0, 25));
  };

  const refetch = () => {
    statusReq.reload();
    groupsReq.reload();
  };

  /** A read at the finish: timed at the moment it lands. */
  const clockIn = async (value: string) => {
    await api.post(`/admin/race/${raceId}/scan`, { ringNo: value, timestamp: stamp(new Date()) });
    note(value, "clocked in", true);
  };

  /**
   * A read at intake, against the bird that was picked.
   *
   * With the baskets permission this is the portal's one-step scan: link the
   * tag, file the bird into the section, and take whatever the server adds — a
   * tag-colour group, a warning that the section is nearly full. Without it,
   * the tag is linked and that is all.
   */
  const takeIn = async (value: string) => {
    if (!selected) {
      note(value, "pick the bird this tag belongs to first", false);
      toast.info(`Scanned ${value} — pick a bird to give it to.`);
      return;
    }
    const band = shortBand(selected.bird?.band) || selected.bird?.birdName || `Item ${selected.id}`;

    if (mayPlace) {
      if (!targetGroup) {
        note(value, "no open loft section to file it into", false);
        toast.error("No active group. Create a LOFT group in Groups first.");
        return;
      }
      const { data: said } = await api.post<Placed>(`/admin/event/${eventId}/baskets/scan-loft`, {
        eventInventoryItemId: selected.id,
        rfid: value,
        groupId: targetGroup.id,
      });
      if (said?.alreadyAssigned) {
        note(band, `already in group "${said.groupName ?? said.groupId}"`, false);
        toast.info(`Already in group "${said.groupName ?? said.groupId}".`);
        return;
      }
      note(band, `tag ${value} → ${said?.group?.name ?? "group"}`, true);
      setLastPlaced({ bird: band, said: said ?? {} });
      if (said?.capacityWarning && said.group?.capacity) {
        setWarning(
          `${said.group.name} is ${Math.round(
            (said.group.memberCount / said.group.capacity) * 100
          )}% full. Carry on, or close it and open a new section in Groups.`
        );
      }
    } else {
      await api.post(`/admin/event/${eventId}/checkin`, {
        eventInventoryItemId: selected.id,
        rfid: value,
      });
      note(band, `tag ${value} linked`, true);
    }
    setSelectedId(null);
    setGroupId(null);
    refetch();
  };

  const submit = async (raw: string) => {
    const value = raw.trim();
    if (!value || lock.current) return;
    lock.current = true;
    setSending(true);
    try {
      if (isArrivals) await clockIn(value);
      else await takeIn(value);
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "That scan was not accepted.";
      note(value, message, false);
      toast.error(message);
    } finally {
      lock.current = false;
      setSending(false);
    }
  };

  const unlink = async () => {
    if (!unlinking) return;
    const { ok } = await action.run(
      "delete",
      `/admin/event/${eventId}/checkin`,
      { eventInventoryItemId: unlinking.id },
      { success: "RFID unlinked." }
    );
    if (ok) {
      setUnlinking(null);
      setSelectedId(null);
      refetch();
    }
  };

  const breeders = useMemo(() => {
    const seen = new Map<number, string>();
    for (const item of items) {
      if (item.breeder?.id && !seen.has(item.breeder.id)) {
        seen.set(item.breeder.id, personName(item.breeder));
      }
    }
    return [...seen.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [items]);

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (breederId != null && item.breeder?.id !== breederId) return false;
      if (!q) return true;
      return [
        item.bird?.band,
        item.bird?.birdName,
        item.bird?.rfid,
        personName(item.breeder),
        item.loftBasketLabel,
      ].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [items, query, breederId]);

  /* ---------- arrivals ---------- */

  if (isArrivals) {
    if (!mayLink) return <NoAccess what="Scanning" />;
    return (
      <Screen
        title="Clock arrivals"
        subtitle={`Race ${raceId} · every read is timed at the moment it lands`}
        scroll={false}
        header={
          <ScanField
            onRead={submit}
            pending={sending}
            placeholder="Scan or type a band number"
            poll={false}
          />
        }
      >
        <ScrollView className="mt-3 flex-1">
          <Reads log={log} />
          <View style={{ height: 40 }} />
        </ScrollView>
      </Screen>
    );
  }

  /* ---------- intake ---------- */

  if (!canAny("checkin.view", "checkin.manage") || statusReq.forbidden) {
    return <NoAccess what="Check-in" />;
  }

  const total = statusReq.data?.summary?.total ?? items.length;
  const checkedIn = statusReq.data?.summary?.checkedIn ?? items.filter((i) => i.isCheckedIn).length;
  const basketed = items.filter((i) => i.isLoftBasketed).length;
  const mayScan = mayPlace || mayLink;
  const nearlyFull =
    activeGroup?.capacity != null &&
    (activeGroup._count?.members ?? 0) / activeGroup.capacity >= 0.85;

  return (
    <Screen
      title="Check in birds"
      subtitle={
        mayPlace
          ? "Pick a bird, then read its tag — it is linked and filed into the open section"
          : mayLink
            ? "Pick a bird, then read its tag to link it"
            : "Who is checked in, and who is not"
      }
      scroll={false}
      header={
        <>
          <EventPicker
            value={eventId}
            onChange={(id) => {
              setEventId(id);
              setSelectedId(null);
              setGroupId(null);
              setBreederId(null);
              setLastPlaced(null);
              setWarning(null);
            }}
          />
          {mayScan ? (
            <View className="mt-3">
              <ScanField onRead={submit} pending={sending} placeholder="Scan or type a tag" />
            </View>
          ) : null}
        </>
      }
    >
      <ScrollView
        className="mt-3 flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {statusReq.error ? <Notice>{statusReq.error}</Notice> : null}

        {/* The bird the next read goes to. */}
        {selected ? (
          <View className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <View className="flex-row items-start gap-2">
              <Ionicons name="arrow-forward" size={14} color="#2563eb" style={{ marginTop: 3 }} />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-blue-900">
                  Next tag goes to {shortBand(selected.bird?.band) || `item ${selected.id}`}
                  {selected.bird?.birdName ? ` · ${selected.bird.birdName}` : ""}
                </Text>
                <Text className="text-xs text-blue-800">
                  {personName(selected.breeder) || "No breeder"}
                  {selected.bird?.rfid ? ` · tag ${selected.bird.rfid}` : " · no tag yet"}
                </Text>
                {selected.isLoftBasketed ? (
                  <Text className="mt-1 text-xs text-blue-800">
                    Already in loft basket {selected.loftBasketLabel ?? `#${selected.loftBasketNo}`}.
                  </Text>
                ) : null}
                {selected.bird?.note ? (
                  <Text className="mt-1 text-xs italic text-blue-900">{selected.bird.note}</Text>
                ) : null}
              </View>
              {!selected.hasPaid ? <Pill label="Unpaid" tone="rose" /> : null}
              <Pressable onPress={() => setSelectedId(null)} hitSlop={8}>
                <Ionicons name="close" size={16} color="#1e40af" />
              </Pressable>
            </View>

            <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 14 }}>
              {mayPlace ? (
                <Pressable onPress={() => setChoosingGroup(true)} hitSlop={6}>
                  <Text className="text-xs font-medium text-blue-700">
                    Into {targetGroup?.name ?? "no group"} — change
                  </Text>
                </Pressable>
              ) : null}
              {mayLink && selected.hasRfid ? (
                <Pressable onPress={() => setUnlinking(selected)} hitSlop={6}>
                  <Text className="text-xs font-medium text-rose-600">Unlink tag</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* The section scans are filing into. */}
        {mayGroups && !groupsReq.loading ? (
          activeGroup ? (
            <View
              className={`mb-3 flex-row items-center gap-2 rounded-xl border px-3 py-2 ${
                nearlyFull ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"
              }`}
            >
              {nearlyFull ? <Ionicons name="warning-outline" size={15} color="#d97706" /> : null}
              {activeGroup.color ? (
                <View
                  className="h-3 w-3 rounded-full border border-slate-300"
                  style={{ backgroundColor: activeGroup.color }}
                />
              ) : null}
              <Text className="text-sm font-medium text-slate-900">{activeGroup.name}</Text>
              <Pill label="OPEN" tone="green" />
              <Text className="flex-1 text-right text-xs text-slate-600">
                {activeGroup.capacity
                  ? `${activeGroup._count?.members ?? 0} / ${activeGroup.capacity} birds (${Math.round(
                      ((activeGroup._count?.members ?? 0) / activeGroup.capacity) * 100
                    )}%)`
                  : `${activeGroup._count?.members ?? 0} birds`}
              </Text>
            </View>
          ) : (
            <Notice>No active group — open a LOFT group in Groups before scanning.</Notice>
          )
        ) : null}

        {warning ? (
          <Pressable onPress={() => setWarning(null)}>
            <Notice>{warning} Tap to dismiss.</Notice>
          </Pressable>
        ) : null}

        {lastPlaced ? (
          <View className="mb-3 mt-3 flex-row items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
            <Ionicons name="checkmark-circle" size={18} color="#2563eb" />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium text-slate-900">{lastPlaced.bird}</Text>
              <Text className="text-xs text-slate-600">
                Loft: {lastPlaced.said.group?.name ?? "?"}
                {lastPlaced.said.tagColorGroup ? ` · Tag: ${lastPlaced.said.tagColorGroup.name}` : ""}
              </Text>
            </View>
            <Pressable onPress={() => setLastPlaced(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color="#64748b" />
            </Pressable>
          </View>
        ) : null}

        <View className="flex-row" style={{ gap: 14 }}>
          <Progress label="Checked in" done={checkedIn} total={total} />
          <Progress label="Loft basketed" done={basketed} total={total} />
        </View>

        <View className="mt-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Band, bird, tag, breeder or basket" />
        </View>
        <Pressable
          onPress={() => setFiltering(true)}
          className="mt-2 flex-row items-center gap-1 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5"
        >
          <Ionicons name="funnel-outline" size={13} color="#475569" />
          <Text className="text-xs font-medium text-slate-600">
            {breederId != null
              ? (breeders.find(([id]) => id === breederId)?.[1] ?? "Breeder")
              : "All breeders"}
          </Text>
        </Pressable>

        <View className="mt-3">
          {statusReq.loading ? (
            <Loading />
          ) : matching.length === 0 ? (
            <Empty>
              {eventId == null
                ? "Pick an event."
                : items.length === 0
                  ? "Nothing registered for this event yet."
                  : "No bird matches that."}
            </Empty>
          ) : (
            <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {matching.slice(0, limit).map((item, index) => {
                const on = selectedId === item.id;
                const status = statusOf(item);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setSelectedId(on ? null : item.id);
                      setGroupId(null);
                    }}
                    className={`flex-row items-center gap-3 px-4 py-3 ${
                      index > 0 ? "border-t border-slate-100" : ""
                    } ${on ? "bg-blue-50" : ""}`}
                  >
                    <Ionicons
                      name={item.hasRfid ? "radio" : "radio-outline"}
                      size={16}
                      color={item.hasRfid ? "#059669" : "#cbd5e1"}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>
                        {shortBand(item.bird?.band) || "No band"}
                        {item.bird?.birdName ? ` · ${item.bird.birdName}` : ""}
                      </Text>
                      <Text className="text-xs text-slate-500" numberOfLines={1}>
                        {personName(item.breeder) || "Unassigned"}
                        {item.bird?.rfid ? ` · ${item.bird.rfid}` : ""}
                        {item.loftBasketLabel ? ` · ${item.loftBasketLabel}` : ""}
                      </Text>
                    </View>
                    {item.bird?.attention ? <Pill label="!" tone="rose" /> : null}
                    {!item.hasPaid && status.label !== "Unpaid" ? (
                      <Pill label="Unpaid" tone="rose" />
                    ) : null}
                    <Pill label={status.label} tone={status.tone} />
                  </Pressable>
                );
              })}
            </View>
          )}
          {matching.length > limit ? (
            <Pressable onPress={() => setLimit(limit + 120)} className="mt-2">
              <Text className="text-center text-xs font-medium text-cyan-700">
                Showing {limit} of {matching.length} — show more, or search to narrow it down
              </Text>
            </Pressable>
          ) : null}
        </View>

        {mayScan ? (
          <View className="mt-5">
            <Reads log={log} />
          </View>
        ) : null}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Sheet open={filtering} onClose={() => setFiltering(false)} title="Show birds from">
        <ChoiceList
          choices={[
            { key: 0, label: "All breeders" },
            ...breeders.map(([id, label]) => ({ key: id, label: label || `Breeder ${id}` })),
          ]}
          selected={breederId ?? 0}
          onPick={(k) => {
            setBreederId(Number(k) === 0 ? null : Number(k));
            setFiltering(false);
          }}
        />
      </Sheet>

      <Sheet
        open={choosingGroup}
        onClose={() => setChoosingGroup(false)}
        title="Assign to group"
        subtitle="Where the next read files this bird"
      >
        <ChoiceList
          choices={loftGroups.map((g) => ({
            key: g.id,
            label: g.name,
            hint: [
              g.status === "OPEN" ? "open" : "closed",
              g.capacity ? `${g._count?.members ?? 0}/${g.capacity}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
          selected={targetGroup?.id ?? null}
          onPick={(k) => {
            setGroupId(Number(k));
            setChoosingGroup(false);
          }}
          empty={
            mayGroups
              ? "This season has no loft groups yet."
              : "The group list is not part of your access; the open section is used."
          }
        />
      </Sheet>

      <Confirm
        open={unlinking != null}
        title="Unlink RFID from this bird?"
        body={`${
          shortBand(unlinking?.bird?.band) || "The bird"
        } loses tag ${unlinking?.bird?.rfid ?? ""} and goes back to not checked in for races that have not started.`}
        confirmLabel="Unlink"
        pending={action.pending}
        onConfirm={unlink}
        onCancel={() => setUnlinking(null)}
      />
    </Screen>
  );
}

function Reads({ log }: { log: LogLine[] }) {
  return (
    <View>
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Recent reads
      </Text>
      {log.length === 0 ? (
        <Text className="text-xs text-slate-400">Nothing scanned yet.</Text>
      ) : (
        <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {log.map((line, index) => (
            <View
              key={line.key}
              className={`flex-row items-start gap-2 px-3 py-2.5 ${
                index > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <Ionicons
                name={line.ok ? "checkmark-circle" : "alert-circle"}
                size={15}
                color={line.ok ? "#059669" : "#e11d48"}
              />
              <View className="flex-1">
                <Text className="text-xs font-medium text-slate-900">{line.text}</Text>
                <Text className={`text-[11px] ${line.ok ? "text-slate-500" : "text-rose-600"}`}>
                  {line.detail}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
