import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { DimensionValue, TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";

/**
 * The pieces every admin section is built from.
 *
 * The portal has nineteen event sections and a dozen more pages behind them.
 * Written one at a time they would drift — a different empty state here, a
 * search box that looks slightly wrong there — and the drift is what makes an
 * app feel unfinished. So the shapes that repeat live here once: a screen with
 * its title and refresh, a row, a figure, a search box, and the three states
 * every list has (loading, empty, refused).
 *
 * Sections are then mostly a fetch and a row renderer.
 *
 * The pieces for *acting* on what is rendered — buttons, fields, sheets, the
 * confirm step — live in `actions.tsx` and are re-exported below, so a section
 * still imports from one place.
 */

export {
  Button,
  ButtonRow,
  Field,
  Sheet,
  ChoiceList,
  Confirm,
  type Choice,
} from "./actions";

/** Uniform money, with digits that line up in a column. */
export const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/** Digits of equal width, so figures line up down a column. */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

export function Screen({
  title,
  subtitle,
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  header,
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Off when the screen owns its own scrolling list. */
  scroll?: boolean;
  /** Pickers and filters, between the title and the body. */
  header?: ReactNode;
}) {
  const { gutter } = useResponsive();

  const head = (
    <>
      <Text className="text-2xl font-bold text-slate-900">{title}</Text>
      {subtitle ? <Text className="mt-1 text-sm text-slate-500">{subtitle}</Text> : null}
      {header ? <View className="mt-3">{header}</View> : null}
    </>
  );

  if (!scroll) {
    return (
      <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
        {head}
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ paddingHorizontal: gutter, paddingTop: gutter }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {head}
      {children}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View className="mb-2 mt-6 flex-row items-center justify-between">
      <Text className="text-base font-semibold text-slate-900">{children}</Text>
      {action}
    </View>
  );
}

export function Figure({
  label,
  value,
  tone = "text-slate-900",
  basis,
}: {
  label: string;
  value: string | number;
  tone?: string;
  basis?: DimensionValue;
}) {
  const { isWide } = useResponsive();
  return (
    <View
      className="rounded-xl border border-slate-200 bg-white p-4"
      style={{ flexGrow: 1, flexBasis: basis ?? (isWide ? "23%" : "47%") }}
    >
      <Text className={`text-xl font-bold ${tone}`} style={tabular}>
        {value}
      </Text>
      <Text className="mt-0.5 text-xs text-slate-500">{label}</Text>
    </View>
  );
}

export function FigureRow({ children }: { children: ReactNode }) {
  return (
    <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
      {children}
    </View>
  );
}

/** A bordered container that draws hairlines between its children. */
export function Rows({ children }: { children: ReactNode }) {
  const items = React.Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.map((child, index) => (
        <View key={index} className={index > 0 ? "border-t border-slate-100" : ""}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  right,
  rightSub,
  rightTone = "text-slate-600",
  onPress,
  onLongPress,
  leading,
  badge,
}: {
  title: string;
  subtitle?: string | null;
  right?: string | null;
  rightSub?: string | null;
  rightTone?: string;
  onPress?: () => void;
  /** The second, rarer thing a row can do — editing, usually. */
  onLongPress?: () => void;
  leading?: ReactNode;
  badge?: { label: string; bg: string; text: string } | null;
}) {
  const body = (
    <View className="flex-row items-center gap-3 px-4 py-3">
      {leading}
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-slate-500" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View className={`rounded-full px-2 py-0.5 ${badge.bg}`}>
          <Text className={`text-[10px] font-medium ${badge.text}`}>{badge.label}</Text>
        </View>
      ) : null}
      {right != null || rightSub != null ? (
        <View className="items-end">
          {right != null && (
            <Text className={`text-sm font-medium ${rightTone}`} style={tabular}>
              {right}
            </Text>
          )}
          {rightSub != null && <Text className="text-xs text-slate-400">{rightSub}</Text>}
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color="#cbd5e1" /> : null}
    </View>
  );

  if (!onPress && !onLongPress) return body;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400}>
      {body}
    </Pressable>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <View className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
      <Ionicons name="search" size={16} color="#94a3b8" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        autoCorrect={false}
        className="flex-1 py-2.5 text-sm text-slate-900"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange("")} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color="#94a3b8" />
        </Pressable>
      )}
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center py-12">
      <ActivityIndicator size="large" />
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-xl border border-slate-200 bg-white p-8">
      <Text className="text-center text-sm text-slate-500">{children}</Text>
    </View>
  );
}

export function Notice({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "rose" }) {
  const styles =
    tone === "rose"
      ? { box: "border-rose-200 bg-rose-50", text: "text-rose-800" }
      : { box: "border-amber-200 bg-amber-50", text: "text-amber-800" };
  return (
    <View className={`mt-3 rounded-xl border p-3 ${styles.box}`}>
      <Text className={`text-sm ${styles.text}`}>{children}</Text>
    </View>
  );
}

/**
 * What a section shows when the server says no.
 *
 * Stated as a fact about access rather than an error, because being refused is
 * a supported state here, not a fault — somebody simply was not granted this.
 */
export function NoAccess({ what }: { what: string }) {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <Ionicons name="lock-closed-outline" size={28} color="#94a3b8" />
      <Text className="mt-3 text-center text-sm text-slate-500">
        {what} is not part of your access.
      </Text>
    </View>
  );
}

/** Truncation has to be visible, or a partial list reads as the whole list. */
export function Truncated({ shown, total, where = "the portal" }: { shown: number; total: number; where?: string }) {
  if (total <= shown) return null;
  return (
    <Text className="mt-3 text-center text-xs text-slate-400">
      Showing {shown.toLocaleString()} of {total.toLocaleString()} — the rest is in {where}.
    </Text>
  );
}
