import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AdminData } from "@/hooks/useAdminData";
import { tabular } from "@/components/admin/ui";
import { Pill } from "@/components/admin/scan";

export interface GroupStat {
  groupId: number;
  name: string;
  type: string;
  status: string;
  capacity: number | null;
  total: number;
  active: number;
  lost: number;
  foreign: number;
  stray: number;
  ignored: number;
  medical: number;
  backup: number;
  unpaid: number;
}

export interface GroupStatsData {
  stats?: GroupStat[];
  totals?: Omit<GroupStat, "groupId" | "name" | "type" | "status" | "capacity"> | null;
}

/** The eight counts the portal's table has a column for, in its order. */
const COLUMNS: { key: keyof GroupStat; label: string; warn?: boolean }[] = [
  { key: "active", label: "Active" },
  { key: "lost", label: "Lost" },
  { key: "foreign", label: "Foreign" },
  { key: "stray", label: "Stray" },
  { key: "ignored", label: "Ignored" },
  { key: "medical", label: "Medical", warn: true },
  { key: "backup", label: "Backup" },
  { key: "unpaid", label: "Unpaid" },
];

/**
 * Section statistics — the state of every group at a glance.
 *
 * The portal lays this out as an eleven-column table, which a phone cannot
 * show without scrolling sideways through numbers that are mostly zero. So
 * each group gets a line with its bird count, and its other figures appear
 * only where they are not zero: a section with three lost birds says so, and
 * a section with none says nothing. Same numbers, read the way a narrow
 * screen reads.
 *
 * Collapsed by default below the season line, because the line answers the
 * usual question and the breakdown is for when it does not.
 */
export function GroupStats({ req }: { req: AdminData<GroupStatsData> }) {
  const [open, setOpen] = useState(false);
  const stats = req.data?.stats ?? [];
  const totals = req.data?.totals ?? null;

  // The route wants groups.view exactly; somebody holding only groups.manage
  // is refused here while the rest of the screen works. Nothing to show them.
  if (req.forbidden || req.loading) return null;

  return (
    <View className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <Pressable onPress={() => setOpen(!open)} className="flex-row items-center gap-3 px-4 py-3">
        <Ionicons name="bar-chart-outline" size={16} color="#475569" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-slate-900">Section statistics</Text>
          <Text className="text-xs text-slate-500">
            {totals
              ? `${totals.total} birds across ${stats.length} group${stats.length === 1 ? "" : "s"} · ${
                  totals.active
                } active · ${totals.lost} lost · ${totals.medical} medical · ${totals.unpaid} unpaid`
              : (req.error ?? "No figures yet.")}
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#94a3b8" />
      </Pressable>

      {open ? (
        <View className="border-t border-slate-100">
          {stats.length === 0 ? (
            <Text className="px-4 py-3 text-xs text-slate-500">
              No groups in this season yet. Create a loft group to see its figures here.
            </Text>
          ) : (
            stats.map((s, index) => (
              <View
                key={s.groupId}
                className={`px-4 py-2.5 ${index > 0 ? "border-t border-slate-100" : ""}`}
              >
                <View className="flex-row items-center gap-2">
                  <Text className="min-w-0 flex-1 text-sm font-medium text-slate-900" numberOfLines={1}>
                    {s.name}
                  </Text>
                  {s.status === "OPEN" ? <Pill label="open" tone="green" /> : null}
                  <Text className="text-xs text-slate-400">{s.type.toLowerCase()}</Text>
                  <Text className="text-sm font-semibold text-slate-900" style={tabular}>
                    {s.total}
                    {s.capacity ? <Text className="text-slate-400">/{s.capacity}</Text> : null}
                  </Text>
                </View>
                <View className="mt-1 flex-row flex-wrap" style={{ gap: 10 }}>
                  {COLUMNS.filter((c) => c.key === "active" || Number(s[c.key]) > 0).map((c) => (
                    <Text
                      key={c.key}
                      className={`text-xs ${
                        c.warn && Number(s[c.key]) > 0 ? "text-amber-600" : "text-slate-500"
                      }`}
                      style={tabular}
                    >
                      {c.label} {String(s[c.key])}
                    </Text>
                  ))}
                </View>
              </View>
            ))
          )}
          {totals && stats.length > 0 ? (
            <View className="flex-row flex-wrap border-t border-slate-200 bg-slate-50 px-4 py-2.5" style={{ gap: 10 }}>
              <Text className="text-xs font-semibold text-slate-700" style={tabular}>
                All {totals.total}
              </Text>
              {COLUMNS.map((c) => (
                <Text key={c.key} className="text-xs text-slate-500" style={tabular}>
                  {c.label} {String(totals[c.key as keyof typeof totals] ?? 0)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
