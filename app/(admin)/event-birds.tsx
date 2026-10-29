import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { CsvImportSheet } from "@/components/admin/CsvImportSheet";
import { EventBirdAddSheet } from "@/components/admin/EventBirdAddSheet";
import {
  BreederTransferSheet,
  EventBirdEditSheet,
  EventBirdSubstituteSheet,
} from "@/components/admin/EventBirdEntrySheets";
import { downloadAndShare } from "@/service/download.service";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  Sheet,
  Truncated,
  money,
} from "@/components/admin/ui";
import { Chips, Label, fullName, sexLabel } from "@/components/admin/birdParts";

interface Item {
  id: number;
  birdNo: number | null;
  deletedAt: string | null;
  entryFeeValue: number | null;
  perchFeeValue: number | null;
  raceFeeValue: number | null;
  hotSpotFeeValue: number | null;
  birdId: number | null;
  bird: {
    id: number;
    band: string | null;
    band1: string | null;
    band2: string | null;
    band3: string | null;
    band4: string | null;
    birdName: string | null;
    color: string | null;
    sex: number | null;
    rfid: string | null;
    isActive: number | null;
    isLost: number | null;
    lostDate: string | null;
    note: string | null;
    _count?: { lostHistory?: number };
  } | null;
  raceClassEntries?: { raceClass: { id: number; code: string } }[];
  eventInventory?: {
    id: number;
    breederId: number | null;
    loft: string | null;
    breeder?: { id: number; firstName: string | null; lastName: string | null; email: string | null } | null;
  } | null;
}

type Filter = "all" | "tagged" | "untagged" | "lost" | "deleted";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tagged", label: "Tagged" },
  { key: "untagged", label: "No tag" },
  { key: "lost", label: "Lost" },
  { key: "deleted", label: "Deleted" },
];

/** The columns the export route will write, in the portal's order and words. */
const EXPORT_FIELDS: { key: string; label: string }[] = [
  { key: "breeder_name", label: "Breeder name" },
  { key: "breeder_email", label: "Breeder email" },
  { key: "bird_name", label: "Bird name" },
  { key: "band", label: "Band (full)" },
  { key: "band1", label: "Federation" },
  { key: "band2", label: "Year" },
  { key: "band3", label: "Letters" },
  { key: "band4", label: "Number" },
  { key: "color", label: "Colour" },
  { key: "sex", label: "Sex" },
  { key: "rfid", label: "RFID" },
  { key: "attention", label: "Attention" },
  { key: "is_backup", label: "Backup" },
];

/** Lost history = any recorded loss, or the bird is flagged lost right now. */
const hasLostHistory = (i: Item) => (i.bird?._count?.lostHistory ?? 0) > 0 || i.bird?.isLost === 1;

type Doing = "edit" | "substitute" | "transfer" | "return" | "delete" | "restore";

/**
 * Every bird in this event's loft, and everything that can be done to one.
 *
 * Filters rather than columns: the questions asked here are which birds still
 * need a tag, which have gone missing before, and which were taken out — each a
 * yes-or-no that a table column answers badly on a narrow screen. The search
 * box reads the name, the band, the tag, the breeder and the note at once, so
 * the portal's separate name and notes boxes are one box here.
 *
 * A row opens the entry rather than the bird, because what is done from this
 * list is done to the *entry*: it is edited, swapped for a reserve, sent home,
 * or removed from the event. Removing is soft — the bird, its past results and
 * any bets on it stay — which is why removed entries have their own filter and
 * a way back.
 *
 * Three different permissions meet on this screen, and each control follows the
 * route it calls rather than the screen it sits on: adding and importing birds
 * is event management; editing, swapping, returning and removing an entry is
 * breeder management; moving it to another breeder is bird management.
 */
export default function EventBirds() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const router = useRouter();
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [classCode, setClassCode] = useState("");

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFields, setExportFields] = useState<string[]>(EXPORT_FIELDS.map((f) => f.key));
  const [exporting, setExporting] = useState(false);

  const [open, setOpen] = useState<Item | null>(null);
  const [doing, setDoing] = useState<{ what: Doing; item: Item } | null>(null);

  const deleted = filter === "deleted";
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    eventInventoryItems?: Item[];
  }>(
    eventId ? `/admin/event/${eventId}/event-inventory-items${deleted ? "?deleted=1" : ""}` : null,
    [eventId, deleted]
  );

  const items = useMemo(() => data?.eventInventoryItems ?? [], [data]);

  const tagged = items.filter((i) => i.bird?.rfid).length;
  const lost = items.filter(hasLostHistory).length;

  const classCodes = useMemo(
    () =>
      Array.from(
        new Set(items.flatMap((i) => (i.raceClassEntries ?? []).map((e) => e.raceClass.code)))
      ).sort(),
    [items]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "tagged" && !i.bird?.rfid) return false;
      if (filter === "untagged" && i.bird?.rfid) return false;
      if (filter === "lost" && !hasLostHistory(i)) return false;
      if (classCode && !(i.raceClassEntries ?? []).some((e) => e.raceClass.code === classCode)) {
        return false;
      }
      if (!q) return true;
      return [
        i.bird?.band,
        i.bird?.birdName,
        i.bird?.rfid,
        i.bird?.color,
        i.bird?.note,
        i.eventInventory?.loft,
        fullName(i.eventInventory?.breeder),
      ].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [items, query, filter, classCode]);

  if (forbidden || !canAny("breeders.view", "breeders.manage")) return <NoAccess what="Birds" />;

  const mayAdd = can("events.manage");
  const mayEdit = can("breeders.manage");
  const mayTransfer = can("birds.manage");

  const begin = (what: Doing, item: Item) => {
    setOpen(null);
    // iOS will not present one modal while another is still sliding away.
    setTimeout(() => setDoing({ what, item }), 350);
  };
  const done = () => setDoing(null);
  const is = (what: Doing) => doing?.what === what;
  const target = doing?.item ?? null;
  const targetBand = target?.bird?.band || "this bird";

  /** The server's own sentence is the confirmation; these routes all send one. */
  const act = async (method: "post" | "delete", path: string, fallback: string) => {
    const { ok, data: said } = await action.run<{ message?: string }>(method, path);
    if (ok) {
      toast.success(said?.message || fallback);
      done();
      reload();
    }
  };

  const exportNow = async () => {
    if (exportFields.length === 0) {
      toast.error("Pick at least one column.");
      return;
    }
    setExporting(true);
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await downloadAndShare(
      `/admin/event/${eventId}/export-birds?fields=${exportFields.join(",")}`,
      `birds-${eventId}-${stamp}.csv`
    );
    setExporting(false);
    if (res.ok) setExportOpen(false);
    else if (res.problem) toast.error(res.problem);
  };

  const classesOf = (i: Item) => (i.raceClassEntries ?? []).map((e) => e.raceClass.code).join(", ");
  const feesOf = (i: Item) =>
    (i.entryFeeValue ?? 0) + (i.perchFeeValue ?? 0) + (i.raceFeeValue ?? 0) + (i.hotSpotFeeValue ?? 0);

  return (
    <Screen
      title="Birds"
      subtitle={
        [name, `${items.length} ${deleted ? "removed" : "in the loft"}`].filter(Boolean).join(" · ")
      }
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Band, name, tag, breeder or note" />
          {mayAdd ? (
            <ButtonRow>
              <Button label="Add" icon="add" onPress={() => setAdding(true)} full />
              <Button
                label="Import"
                tone="secondary"
                icon="cloud-upload-outline"
                onPress={() => setImporting(true)}
                full
              />
              <Button
                label="Export"
                tone="secondary"
                icon="download-outline"
                onPress={() => setExportOpen(true)}
                full
              />
            </ButtonRow>
          ) : null}
          <View className="mt-2 flex-row rounded-xl border border-slate-200 bg-white p-1">
            {FILTERS.map((f) => {
              const active = f.key === filter;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  className={`flex-1 rounded-lg py-1.5 ${active ? "bg-blue-600" : ""}`}
                >
                  <Text
                    className={`text-center text-xs font-medium ${
                      active ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {classCodes.length > 0 ? (
            <View className="mt-2">
              <Chips
                options={[
                  { key: "", label: "All classes" },
                  ...classCodes.map((c) => ({ key: c, label: c })),
                ]}
                selected={classCode}
                onPick={setClassCode}
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

          {deleted ? (
            <Notice>
              These were removed from this event. The birds themselves, their past results and any
              bets on them were kept, and an entry can be put back.
            </Notice>
          ) : (
            <FigureRow>
              <Figure label="Birds" value={items.length} basis="31%" />
              <Figure label="Tagged" value={tagged} tone="text-emerald-600" basis="31%" />
              <Figure label="Lost history" value={lost} tone="text-amber-600" basis="31%" />
            </FigureRow>
          )}

          <View className="mt-4">
            {results.length === 0 ? (
              <Empty>
                {items.length > 0
                  ? "No bird matches that filter."
                  : deleted
                    ? "Nothing has been removed from this event."
                    : "No birds registered to this event yet."}
              </Empty>
            ) : (
              <Rows>
                {results.slice(0, 200).map((item) => {
                  const who =
                    fullName(item.eventInventory?.breeder) || item.eventInventory?.loft || "Unassigned";
                  const classes = classesOf(item);
                  return (
                    <Row
                      key={item.id}
                      title={`${item.bird?.band ?? "No band"}${
                        item.bird?.birdName ? ` · ${item.bird.birdName}` : ""
                      }`}
                      subtitle={[who, item.bird?.color, classes].filter(Boolean).join(" · ")}
                      leading={
                        <Ionicons
                          name={item.bird?.rfid ? "radio" : "radio-outline"}
                          size={16}
                          color={item.bird?.rfid ? "#059669" : "#cbd5e1"}
                        />
                      }
                      badge={
                        item.deletedAt
                          ? { label: "removed", bg: "bg-slate-100", text: "text-slate-600" }
                          : item.bird?.isLost === 1
                            ? { label: "lost", bg: "bg-rose-100", text: "text-rose-700" }
                            : item.bird?.isActive === 1
                              ? null
                              : { label: "inactive", bg: "bg-slate-100", text: "text-slate-600" }
                      }
                      right={item.birdNo != null ? `#${item.birdNo}` : undefined}
                      rightTone="text-slate-400"
                      onPress={() => setOpen(item)}
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated shown={Math.min(results.length, 200)} total={results.length} where="the search" />
          </View>
        </>
      )}

      {/* One entry: what it is, then what can be done to it. */}
      <Sheet
        open={open != null}
        onClose={() => setOpen(null)}
        title={open?.bird?.band ?? "No band"}
        subtitle={
          [open?.bird?.birdName, fullName(open?.eventInventory?.breeder) || open?.eventInventory?.loft]
            .filter(Boolean)
            .join(" · ") || null
        }
      >
        {open ? (
          <>
            <View className="mt-3">
              <Rows>
                <Row title="Bird number" right={open.birdNo != null ? String(open.birdNo) : "—"} />
                <Row title="Colour" right={open.bird?.color ?? "—"} />
                <Row title="Sex" right={sexLabel(open.bird?.sex)} />
                <Row
                  title="RFID"
                  right={open.bird?.rfid ?? "not tagged"}
                  rightTone={open.bird?.rfid ? "text-emerald-600" : "text-slate-400"}
                />
                <Row title="Active" right={open.bird?.isActive === 1 ? "yes" : "no"} />
                <Row
                  title="Lost"
                  right={open.bird?.isLost === 1 ? "yes" : "no"}
                  rightSub={
                    open.bird?.lostDate ? new Date(open.bird.lostDate).toLocaleDateString() : undefined
                  }
                  rightTone={open.bird?.isLost === 1 ? "text-rose-600" : "text-slate-600"}
                />
                <Row
                  title="Lost history"
                  right={
                    hasLostHistory(open)
                      ? `yes${open.bird?._count?.lostHistory ? ` (${open.bird._count.lostHistory})` : ""}`
                      : "no"
                  }
                />
                <Row title="Classes" right={classesOf(open) || "—"} />
                <Row title="Fees on this entry" right={money(feesOf(open))} />
              </Rows>
            </View>

            {open.bird?.note ? (
              <View className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Note
                </Text>
                <Text className="mt-1 text-sm text-slate-700">{open.bird.note}</Text>
              </View>
            ) : null}

            {open.deletedAt ? (
              mayEdit ? (
                <ButtonRow>
                  <Button
                    label="Restore to this event"
                    icon="arrow-undo-outline"
                    onPress={() => begin("restore", open)}
                    full
                  />
                </ButtonRow>
              ) : null
            ) : (
              <>
                {open.bird?.id ? (
                  <ButtonRow>
                    <Button
                      label="Open bird — history, pictures, notes"
                      tone="secondary"
                      icon="open-outline"
                      onPress={() => {
                        const id = open.bird!.id;
                        setOpen(null);
                        router.push(`/(admin)/bird-detail?birdId=${id}&eventId=${eventId}` as never);
                      }}
                      full
                    />
                  </ButtonRow>
                ) : null}

                {mayEdit ? (
                  <>
                    <ButtonRow>
                      <Button
                        label="Edit bird"
                        icon="create-outline"
                        onPress={() => begin("edit", open)}
                        full
                      />
                      <Button
                        label="Backup swap"
                        tone="secondary"
                        icon="repeat-outline"
                        onPress={() => begin("substitute", open)}
                        full
                      />
                    </ButtonRow>
                    <ButtonRow>
                      <Button
                        label="Return bird"
                        tone="secondary"
                        icon="home-outline"
                        onPress={() => begin("return", open)}
                        full
                      />
                      <Button
                        label="Delete from event"
                        tone="danger"
                        icon="trash-outline"
                        onPress={() => begin("delete", open)}
                        full
                      />
                    </ButtonRow>
                  </>
                ) : null}

                {mayTransfer ? (
                  <ButtonRow>
                    <Button
                      label="Transfer breeder"
                      tone="secondary"
                      icon="swap-horizontal-outline"
                      onPress={() => begin("transfer", open)}
                      full
                    />
                  </ButtonRow>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </Sheet>

      <EventBirdEditSheet
        open={is("edit")}
        onClose={done}
        onSaved={reload}
        entry={is("edit") ? target : null}
        eventId={eventId}
      />

      <EventBirdSubstituteSheet
        open={is("substitute")}
        onClose={done}
        onDone={reload}
        entry={is("substitute") ? target : null}
      />

      <BreederTransferSheet
        open={is("transfer")}
        onClose={done}
        onDone={reload}
        entryId={is("transfer") ? (target?.id ?? null) : null}
        currently={fullName(target?.eventInventory?.breeder)}
        what={target?.bird?.band}
      />

      <Confirm
        open={is("delete")}
        title={`Remove ${targetBand} from this event?`}
        body="Its fees are removed; bets on it are not cancelled. The bird and its past results are kept, and the entry can be restored from the Deleted filter."
        confirmLabel="Remove"
        pending={action.pending}
        onCancel={done}
        onConfirm={() =>
          act("post", `/admin/event-inventory-item/${target?.id}/delete`, "Bird removed from the event.")
        }
      />

      <Confirm
        open={is("restore")}
        title={`Restore ${targetBand}?`}
        body="The entry goes back into this event's bird list."
        confirmLabel="Restore"
        tone="primary"
        pending={action.pending}
        onCancel={done}
        onConfirm={() =>
          act("delete", `/admin/event-inventory-item/${target?.id}/delete`, "Bird restored to the event.")
        }
      />

      <Confirm
        open={is("return")}
        title={`Send ${targetBand} home?`}
        body="Today is stamped as its departure date and its RFID tag is released for another bird to use."
        confirmLabel="Mark returned"
        tone="primary"
        pending={action.pending}
        onCancel={done}
        onConfirm={() =>
          act("post", `/admin/event-inventory-item/${target?.id}/return`, "Bird marked as returned.")
        }
      />

      <Sheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export birds"
        subtitle="A CSV of this event's active season"
      >
        <Label>Columns</Label>
        <Chips
          options={EXPORT_FIELDS}
          selected={exportFields}
          onPick={(k) =>
            setExportFields(
              exportFields.includes(k)
                ? exportFields.filter((f) => f !== k)
                : // Kept in the portal's column order whatever order they were tapped in.
                  EXPORT_FIELDS.map((f) => f.key).filter((f) => f === k || exportFields.includes(f))
            )
          }
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setExportOpen(false)} full />
          <Button label="Export" icon="download-outline" onPress={exportNow} pending={exporting} full />
        </ButtonRow>
      </Sheet>

      <EventBirdAddSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={reload}
        eventId={eventId}
        existing={items}
      />

      <CsvImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        onImported={reload}
        title="Import birds"
        previewPath={`/admin/event/${eventId}/import-birds/preview`}
        commitPath={`/admin/event/${eventId}/import-birds/commit`}
        describe={(row) => ({
          title: (row.band as string) || (row.birdName as string) || "No band",
          subtitle:
            [
              row.birdName as string,
              row.color as string,
              row.breederName as string,
              row.breederAction === "create"
                ? "new breeder"
                : row.breederAction === "existing_email"
                  ? "matched by email"
                  : row.breederAction === "existing_name"
                    ? "matched by name"
                    : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
        })}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
