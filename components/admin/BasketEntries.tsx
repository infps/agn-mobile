import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ChoiceList,
  Empty,
  Loading,
  Notice,
  SearchBar,
  Sheet,
  tabular,
} from "@/components/admin/ui";
import { Caption, Pill, personName, sexLabel, shortBand } from "@/components/admin/scan";

/** One bird of the season, as `/checkin-status` describes it. */
export interface StatusItem {
  id: number;
  birdId: number | null;
  bird: {
    id: number;
    band: string | null;
    birdName: string | null;
    rfid: string | null;
    color: string | null;
    sex: number | null;
    attention: boolean | null;
    note: string | null;
    isLost?: number | null;
  } | null;
  breeder: { id: number; firstName: string | null; lastName: string | null } | null;
  isCheckedIn: boolean;
  hasRfid: boolean;
  hasPaid: boolean;
  loftBasketLabel: string | null;
  isLoftBasketed: boolean;
  loftBasketNo: number | null;
  raceBasketLabel: string | null;
  raceBasketNo: number | null;
  raceAssignedAt: string | null;
  isRaceBasketed: boolean;
  isLost: boolean;
  isIgnored: boolean;
}

export interface StatusData {
  items?: StatusItem[];
  summary?: {
    total: number;
    checkedIn: number;
    notCheckedIn: number;
    loftBasketed: number;
    raceBasketed: number;
  };
}

interface EntryRow {
  id: number;
  birdId: number | null;
  ignored: boolean;
  breeder: string;
  band: string;
  rfid: string;
  color: string;
  sex: string;
  lost: boolean;
  loftBasket: string;
  loftBasketed: boolean;
  raceBasket: string;
  raceAssignedAt: string;
  attention: boolean;
  note: string;
}

type SortKey =
  | "breeder"
  | "band"
  | "rfid"
  | "color"
  | "lost"
  | "loftBasket"
  | "loftBasketed"
  | "raceBasket"
  | "raceAssignedAt"
  | "sex";

/** The portal's columns, in the portal's order — also the CSV's header row. */
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "breeder", label: "Breeder" },
  { key: "band", label: "Band" },
  { key: "rfid", label: "EID" },
  { key: "color", label: "Color" },
  { key: "lost", label: "Lost" },
  { key: "loftBasket", label: "Loft basket" },
  { key: "loftBasketed", label: "Loft basketed" },
  { key: "raceBasket", label: "Race basket" },
  { key: "raceAssignedAt", label: "Race basket time" },
  { key: "sex", label: "Sex" },
];

const yesNo = (v: boolean) => (v ? "Yes" : "No");
const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : "");

function toRows(items: StatusItem[]): EntryRow[] {
  return items.map((item) => ({
    id: item.id,
    birdId: item.bird?.id ?? null,
    ignored: item.isIgnored ?? false,
    breeder: [item.breeder?.lastName?.toUpperCase(), item.breeder?.firstName]
      .filter(Boolean)
      .join(", "),
    band: item.bird?.band ?? "",
    rfid: item.bird?.rfid ?? "",
    color: item.bird?.color ?? "",
    sex: sexLabel(item.bird?.sex),
    lost: item.isLost ?? false,
    loftBasket: item.isLoftBasketed
      ? item.loftBasketLabel || `Basket #${item.loftBasketNo ?? "?"}`
      : "",
    loftBasketed: item.isLoftBasketed ?? false,
    raceBasket: item.isRaceBasketed
      ? item.raceBasketLabel || `Basket #${item.raceBasketNo ?? "?"}`
      : "",
    raceAssignedAt: item.raceAssignedAt ?? "",
    attention: item.bird?.attention ?? false,
    note: item.bird?.note ?? "",
  }));
}

/** The text of a cell — shared by the list, the sort and the export. */
function cell(row: EntryRow, key: SortKey): string {
  const v = row[key];
  if (typeof v === "boolean") return yesNo(v);
  return key === "raceAssignedAt" ? when(v) : v;
}

const PAGE = 60;

/**
 * Entries — every bird of the season, and where it sits for the chosen race.
 *
 * This is the basket tab's other half: the baskets say what is in each one,
 * this says where each bird is, basketed or not. The portal draws it as a
 * ten-column grid. Ten columns do not fit a phone, so a row carries the three
 * things looked for (who, which bird, which basket) and the rest opens on a
 * tap, together with the three things the grid's end column can do.
 *
 * Printing has no meaning on a handset. The export hands the same rows, in the
 * same column order, to the share sheet — from where they can be printed, if
 * that is what is wanted.
 */
export function BasketEntries({
  eventId,
  raceId,
  capacity,
  occupancy,
  refreshKey = 0,
}: {
  eventId: string;
  raceId: number | null;
  /** Passed by the loft and race panels, which know their baskets. */
  capacity?: number;
  occupancy?: number;
  /** Bumped when the baskets change, so the two halves stay in step. */
  refreshKey?: number;
}) {
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const action = useAdminAction();

  const { data, loading, forbidden, error, reload } = useAdminData<StatusData>(
    `/admin/event/${eventId}/checkin-status${raceId != null ? `?raceId=${raceId}` : ""}`,
    [eventId, raceId, refreshKey]
  );

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("breeder");
  const [ascending, setAscending] = useState(true);
  const [sorting, setSorting] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const all = useMemo(() => toRows(data?.items ?? []), [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) => [r.breeder, r.band, r.rfid].some((v) => v.toLowerCase().includes(q)))
      : all;
    return [...filtered].sort((a, b) => {
      const av = sortKey === "raceAssignedAt" ? a.raceAssignedAt : cell(a, sortKey);
      const bv = sortKey === "raceAssignedAt" ? b.raceAssignedAt : cell(b, sortKey);
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return ascending ? cmp : -cmp;
    });
  }, [all, query, sortKey, ascending]);

  const current = openId != null ? (all.find((r) => r.id === openId) ?? null) : null;

  const toggleMark = async (row: EntryRow) => {
    if (!row.birdId) return;
    const { ok } = await action.run(
      "patch",
      `/admin/bird/${row.birdId}`,
      { attention: !row.attention },
      { success: row.attention ? "Mark cleared." : "Bird marked." }
    );
    if (ok) reload();
  };

  const toggleIgnore = async (row: EntryRow) => {
    if (raceId == null) return;
    const { ok, data: said } = row.ignored
      ? await action.run<{ message?: string }>(
          "delete",
          `/admin/race/${raceId}/ignore-birds?inventoryItemId=${row.id}`
        )
      : await action.run<{ message?: string }>("post", `/admin/race/${raceId}/ignore-birds`, {
          inventoryItemId: row.id,
        });
    if (ok) {
      // The server's sentence says a recalculation is needed, which matters.
      toast.success(said?.message ?? (row.ignored ? "Bird re-included." : "Bird ignored."));
      reload();
    }
  };

  const exportCsv = async () => {
    if (rows.length === 0) {
      toast.info("Nothing to export.");
      return;
    }
    setExporting(true);
    try {
      const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const lines = [
        [...COLUMNS.map((c) => c.label), "Flags"],
        ...rows.map((r) => [
          ...COLUMNS.map((c) => cell(r, c.key)),
          [r.attention ? "Marked" : "", r.ignored ? "Ignored" : "", r.note]
            .filter(Boolean)
            .join(" - "),
        ]),
      ];
      const csv = lines.map((l) => l.map(escape).join(",")).join("\r\n");

      const folder = new Directory(Paths.cache, "exports");
      try {
        folder.create({ intermediates: true });
      } catch {
        // already exists
      }
      const file = new File(
        folder,
        `entries-race-${raceId ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv`
      );
      file.create({ overwrite: true });
      // The byte-order mark is what makes a spreadsheet read accents correctly.
      file.write(`﻿${csv}`);

      if (!(await Sharing.isAvailableAsync())) {
        toast.error("This device cannot share files, so there is nowhere to send it.");
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
    } catch {
      toast.error("The export could not be written.");
    } finally {
      setExporting(false);
    }
  };

  if (forbidden) {
    return (
      <Notice>
        The entries list comes from check-in, which is not part of your access. The baskets view
        still shows what is in each basket.
      </Notice>
    );
  }
  if (loading) return <Loading />;

  const totals: { label: string; value: number }[] = [
    { label: "Race basketed", value: all.filter((r) => r.raceBasket !== "").length },
    { label: "Loft basketed", value: all.filter((r) => r.loftBasketed).length },
    { label: "Total birds", value: all.length },
  ];
  if (capacity != null) totals.push({ label: "Capacity", value: capacity });
  if (occupancy != null) totals.push({ label: "Occupancy", value: occupancy });

  const sortLabel = COLUMNS.find((c) => c.key === sortKey)?.label ?? "Breeder";

  return (
    <View>
      {error ? <Notice>{error}</Notice> : null}

      <SearchBar value={query} onChange={setQuery} placeholder="Search breeder, band or EID" />

      <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <Pressable
          onPress={() => setSorting(true)}
          className="flex-row items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5"
        >
          <Ionicons name="swap-vertical" size={13} color="#475569" />
          <Text className="text-xs font-medium text-slate-600">{sortLabel}</Text>
        </Pressable>
        <Pressable
          onPress={() => setAscending(!ascending)}
          className="flex-row items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5"
        >
          <Ionicons name={ascending ? "arrow-up" : "arrow-down"} size={13} color="#475569" />
          <Text className="text-xs font-medium text-slate-600">{ascending ? "A → Z" : "Z → A"}</Text>
        </Pressable>
        <View className="flex-1" />
        <Button
          label="Export CSV"
          tone="secondary"
          icon="download-outline"
          onPress={exportCsv}
          pending={exporting}
        />
      </View>

      {query.trim() ? (
        <Text className="mt-2 text-xs text-slate-500">
          Showing {rows.length} of {all.length}
        </Text>
      ) : null}

      <View className="mt-3">
        {rows.length === 0 ? (
          <Empty>
            {all.length === 0
              ? "No birds registered for this season."
              : "No birds match the search."}
          </Empty>
        ) : (
          <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {rows.slice(0, limit).map((r, index) => (
              <Pressable
                key={r.id}
                onPress={() => setOpenId(r.id)}
                className={`flex-row items-center gap-3 px-4 py-2.5 ${
                  index > 0 ? "border-t border-slate-100" : ""
                } ${r.attention ? "bg-rose-50" : ""} ${r.ignored ? "opacity-50" : ""}`}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>
                    {shortBand(r.band) || "No band"}
                  </Text>
                  <Text className="text-xs text-slate-500" numberOfLines={1}>
                    {r.breeder || "—"}
                    {r.note ? ` · ${r.note}` : ""}
                  </Text>
                </View>
                {r.attention ? <Pill label="!" tone="rose" /> : null}
                {r.lost ? <Pill label="lost" tone="rose" /> : null}
                {r.ignored ? <Pill label="ignored" /> : null}
                <View className="items-end">
                  <Text className="text-xs font-medium text-slate-700" numberOfLines={1}>
                    {r.loftBasket || "—"}
                  </Text>
                  <Text className="text-[11px] text-slate-400" numberOfLines={1}>
                    {r.raceBasket ? `race ${r.raceBasket}` : "no race basket"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        {rows.length > limit ? (
          <Pressable onPress={() => setLimit(limit + PAGE * 2)} className="mt-2">
            <Text className="text-center text-xs font-medium text-cyan-700">
              Showing {limit} of {rows.length} — show more
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        className="mt-3 flex-row flex-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
        style={{ columnGap: 16, rowGap: 4 }}
      >
        {totals.map((t) => (
          <Text key={t.label} className="text-xs text-slate-500">
            {t.label}:{" "}
            <Text className="font-semibold text-slate-900" style={tabular}>
              {t.value}
            </Text>
          </Text>
        ))}
      </View>

      <Sheet open={sorting} onClose={() => setSorting(false)} title="Sort entries by">
        <ChoiceList
          choices={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
          selected={sortKey}
          onPick={(k) => {
            setSortKey(k as SortKey);
            setAscending(true);
            setSorting(false);
          }}
        />
      </Sheet>

      <Sheet
        open={current != null}
        onClose={() => setOpenId(null)}
        title={shortBand(current?.band) || "Bird"}
        subtitle={current?.breeder || null}
      >
        {current ? (
          <>
            <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 6 }}>
              {current.attention ? <Pill label="Marked" tone="rose" /> : null}
              {current.lost ? <Pill label="Lost" tone="rose" /> : null}
              {current.ignored ? <Pill label="Ignored for this race" /> : null}
            </View>
            <View className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {COLUMNS.filter((c) => c.key !== "breeder" && c.key !== "band").map((c, index) => (
                <View
                  key={c.key}
                  className={`flex-row justify-between px-4 py-2 ${
                    index > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <Text className="text-xs text-slate-500">{c.label}</Text>
                  <Text className="text-xs font-medium text-slate-900">
                    {cell(current, c.key) || "—"}
                  </Text>
                </View>
              ))}
            </View>
            {current.note ? (
              <>
                <Caption>Note</Caption>
                <Text className="text-sm text-slate-800">{current.note}</Text>
              </>
            ) : null}

            <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
              {current.birdId && canAny("birds.view", "birds.manage") ? (
                <Button
                  label={can("birds.manage") ? "Edit bird" : "Open bird"}
                  tone="secondary"
                  icon="create-outline"
                  onPress={() => {
                    const id = current.birdId;
                    setOpenId(null);
                    router.push(`/(admin)/bird-detail?birdId=${id}` as never);
                  }}
                />
              ) : null}
              {current.birdId && can("birds.manage") ? (
                <Button
                  label={current.attention ? "Clear mark" : "Mark bird"}
                  tone="secondary"
                  icon={current.attention ? "flag" : "flag-outline"}
                  onPress={() => toggleMark(current)}
                  pending={action.pending}
                />
              ) : null}
              {can("races.manage") ? (
                <Button
                  label={current.ignored ? "Re-include in race" : "Ignore for this race"}
                  tone="secondary"
                  icon="ban-outline"
                  onPress={() => toggleIgnore(current)}
                  disabled={raceId == null}
                  pending={action.pending}
                />
              ) : null}
            </View>
            {can("races.manage") && raceId == null ? (
              <Text className="mt-2 text-xs text-slate-400">Select a race to ignore birds.</Text>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
