import React, { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * Small pieces the money screens share.
 *
 * Accounting, defaulters, betting, the Calcutta and the store all need the same
 * three things `ui.tsx` does not have: a segmented switch between views, a row
 * of pills to pick one of a few fixed values, and the small capital heading
 * that separates one list from the next. They live here rather than in `ui.tsx`
 * because only the money screens use them.
 *
 * The payment method and type lists are here too, and are not free text on
 * purpose. The portal stores both as small integers and maps them from exactly
 * these codes — anything else is silently saved as "no method", which is how a
 * cash payment ends up unlabelled in the ledger.
 */

export interface Option<T extends string | number> {
  key: T;
  label: string;
}

/** One of a few views of the same screen. */
export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className={`flex-1 rounded-lg px-1 py-2 ${active ? "bg-blue-600" : ""}`}
          >
            <Text
              numberOfLines={1}
              className={`text-center text-xs font-medium ${
                active ? "text-white" : "text-slate-600"
              }`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One of a few fixed values, inside a form. */
export function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Option<T>[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <View className="mt-3">
      {label ? <Text className="mb-1 text-xs font-medium text-slate-600">{label}</Text> : null}
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              className={`rounded-full border px-3 py-1.5 ${
                active ? "border-cyan-600 bg-cyan-600" : "border-slate-200 bg-white"
              }`}
            >
              <Text className={`text-xs font-medium ${active ? "text-white" : "text-slate-600"}`}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The small capital heading between one list and the next. */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </Text>
  );
}

/** A label and a figure on one line, for a breakdown that is read, not tapped. */
export function Line({
  label,
  value,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-2.5">
      <Text className="text-sm text-slate-600">{label}</Text>
      <Text className={`text-sm font-medium ${tone}`} style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

export type PaymentMethodCode = "CASH" | "CREDIT_CARD" | "PAYPAL" | "BANK_TRANSFER";
export type PaymentTypeCode = "PERCH_FEE" | "BIRD_FEE" | "RACES_FEE" | "PAYOUTS" | "OTHER";

/** In the order the portal stores them: the index is the stored integer. */
export const PAYMENT_METHODS: Option<PaymentMethodCode>[] = [
  { key: "CASH", label: "Cash" },
  { key: "CREDIT_CARD", label: "Credit card" },
  { key: "PAYPAL", label: "PayPal" },
  { key: "BANK_TRANSFER", label: "Bank transfer" },
];

/** Type 3 is sent as PAYOUTS and read back as a refund, exactly as the portal labels it. */
export const PAYMENT_TYPES: Option<PaymentTypeCode>[] = [
  { key: "PERCH_FEE", label: "Perch fee" },
  { key: "BIRD_FEE", label: "Per bird fee" },
  { key: "RACES_FEE", label: "Races fee" },
  { key: "PAYOUTS", label: "Refund" },
  { key: "OTHER", label: "Other" },
];

export const methodLabel = (stored: number | null | undefined) =>
  stored == null ? null : (PAYMENT_METHODS[stored]?.label ?? `Method ${stored}`);

export const typeLabel = (stored: number | null | undefined) =>
  stored == null ? null : (PAYMENT_TYPES[stored]?.label ?? `Type ${stored}`);

/** A typed amount, or null when it is not a number at all. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** "First Last", falling back through whatever else identifies the person. */
export function fullName(
  person: { firstName?: string | null; lastName?: string | null } | null | undefined,
  fallback = "Unnamed"
) {
  return `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim() || fallback;
}
