import React, { type ReactNode } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Field } from "@/components/admin/actions";

/**
 * The form pieces the setup screens share.
 *
 * Events, seasons and the reference tables are all the same kind of form — a
 * few text fields, a yes/no or two, a colour, and a pick from a short list —
 * and the shared vocabulary in `actions.tsx` stops at the text field. These are
 * the remaining four, kept here so the setup screens agree with each other
 * about what a switch or a picker looks like.
 */

/** The small caps heading that splits a long form into its parts. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </Text>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string | null;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="mt-3 flex-row items-center gap-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-slate-900">{label}</Text>
        {hint ? <Text className="mt-0.5 text-xs text-slate-500">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

/** A field that is filled by choosing rather than typing. */
export function PickRow({
  label,
  value,
  placeholder = "None",
  onPress,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  onPress: () => void;
}) {
  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs font-medium text-slate-600">{label}</Text>
      <Pressable
        onPress={onPress}
        className="flex-row items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5"
      >
        <Text className={"text-sm " + (value ? "text-slate-900" : "text-slate-400")} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#94a3b8" />
      </Pressable>
    </View>
  );
}

/** Two or three exclusive choices, all visible at once. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label?: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  hint?: string | null;
}) {
  return (
    <View className="mt-3">
      {label ? <Text className="mb-1 text-xs font-medium text-slate-600">{label}</Text> : null}
      <View className="flex-row rounded-lg border border-slate-200 bg-white p-1" style={{ gap: 4 }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={String(o.key)}
              onPress={() => onChange(o.key)}
              className={"flex-1 items-center rounded-md px-2 py-2 " + (on ? "bg-cyan-600" : "")}
            >
              <Text className={"text-sm font-medium " + (on ? "text-white" : "text-slate-600")}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text className="mt-1 text-xs text-slate-400">{hint}</Text> : null}
    </View>
  );
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const SWATCHES = [
  "#1d4ed8", "#3b82f6", "#0891b2", "#22c55e", "#f59e0b",
  "#f97316", "#ef4444", "#a855f7", "#94a3b8", "#6b7280",
];

/**
 * A colour, typed as hex or tapped from a short palette.
 *
 * The portal uses the browser's colour well, which a phone does not have. A
 * palette covers what these colours are for — telling a few statuses or race
 * types apart at a glance — and the hex field is there for the exact match.
 */
export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string | null;
}) {
  return (
    <View>
      <Field label={label} value={value} onChange={onChange} placeholder="#1d4ed8" hint={hint} />
      <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
        {SWATCHES.map((c) => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            hitSlop={4}
            className={"h-7 w-7 rounded-full border-2 " + (value.toLowerCase() === c ? "border-slate-900" : "border-white")}
            style={{ backgroundColor: c }}
          />
        ))}
      </View>
    </View>
  );
}

/** The dot a coloured thing is listed with. */
export function Dot({ color }: { color?: string | null }) {
  return (
    <View
      className="h-3.5 w-3.5 rounded-full border border-slate-200"
      style={{ backgroundColor: color && HEX_COLOR.test(color) ? color : "#e2e8f0" }}
    />
  );
}

/** One label-and-value line of a read-only card. */
export function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View className="flex-row items-start justify-between gap-4 px-4 py-2.5">
      <Text className="text-sm text-slate-500">{label}</Text>
      <Text className="flex-1 text-right text-sm font-medium text-slate-900" style={{ fontVariant: ["tabular-nums"] }}>
        {value == null || value === "" ? "—" : value}
      </Text>
    </View>
  );
}

/** The date half of an ISO timestamp, which is what the date fields hold. */
export const ymd = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

/** A real calendar date written YYYY-MM-DD. */
export const isYmd = (raw: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) && !isNaN(new Date(raw.trim()).getTime());

export const showDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;

/**
 * Who the portal's role checks let through.
 *
 * Several of the setup routes check the account's role as well as, or instead
 * of, a permission, and they answer 401 when it fails. The app treats a 401 as
 * a dead session and signs the person out — so a control shown to the wrong
 * role is not a harmless refusal here, it is a logout. These two are how the
 * setup screens keep such controls hidden.
 */
export const isSuper = (role: string | null) => role === "SUPERADMIN";
export const isStaff = (role: string | null) => role === "ADMIN" || role === "SUPERADMIN";
