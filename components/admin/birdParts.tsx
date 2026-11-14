import React, { type ReactNode } from "react";
import { Pressable, Switch, Text, View } from "react-native";

/**
 * The vocabulary the bird screens share.
 *
 * A bird is described the same way everywhere it is typed in — a four-part
 * band, a colour code from a fixed list, a sex, and up to seventeen betting
 * classes — and the portal keeps those lists in one file for the same reason
 * they are kept in one file here: a colour code that exists on one form and not
 * another produces a bird that cannot be filtered for later.
 *
 * The lists are copied from the portal's `src/lib/bird-constants.ts`. They are
 * not fetched because the portal does not serve them; if a federation or a
 * colour is added there, it has to be added here too.
 */

export const FEDERATIONS = ["AU", "IF", "NPA", "CU", "BB", "ARPU", "IPB"];

export const COLORS = [
  "BB", "BC", "BBWF", "BBPD", "BCWF", "BCPD", "SPLA", "CHOC", "RC", "SIL",
  "RCSP", "RR", "BLK", "OPAL", "SLAT", "PENC", "WHIT", "GRIZ", "DC", "DCWF",
];

/** 0 unknown, 1 cock, 2 hen — the numbering the bird table stores. */
export const SEXES: { key: string; label: string }[] = [
  { key: "0", label: "Unknown" },
  { key: "1", label: "Cock" },
  { key: "2", label: "Hen" },
];

export const sexLabel = (n: number | null | undefined) =>
  n === 1 ? "Cock" : n === 2 ? "Hen" : "Unknown";

/**
 * The betting classes an entry can be in.
 *
 * `scheme` is the field on the event's betting scheme that carries the class's
 * price, so a form can say what ticking it costs.
 */
export const BET_CLASSES: { title: string; classes: { key: string; label: string; scheme: string }[] }[] = [
  {
    title: "Belgian show",
    classes: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      key: `belgianShowBet${n}`,
      label: `B${n}`,
      scheme: `belgianShow${n}`,
    })),
  },
  {
    title: "Standard show",
    classes: [1, 2, 3, 4, 5].map((n) => ({
      key: `standardShowBet${n}`,
      label: `S${n}`,
      scheme: `standardShow${n}`,
    })),
  },
  {
    title: "Winner takes all",
    classes: [1, 2, 3, 4, 5].map((n) => ({
      key: `wtaBet${n}`,
      label: `W${n}`,
      scheme: `wta${n}`,
    })),
  },
];

export const ALL_BET_KEYS = BET_CLASSES.flatMap((g) => g.classes.map((c) => c.key));

/** A date the server sent, as the YYYY-MM-DD somebody can type back. */
export const toDay = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** Loose on purpose — the server parses it again; this only catches typos. */
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

export const when = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

export const fullName = (p?: { firstName?: string | null; lastName?: string | null } | null) =>
  `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim();

export function Label({ children }: { children: ReactNode }) {
  return <Text className="mb-1 mt-3 text-xs font-medium text-slate-600">{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </Text>
  );
}

/** A yes-or-no, with what yes means written next to it. */
export function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string | null;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="mt-3 flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-slate-900">{label}</Text>
        {hint ? <Text className="text-xs text-slate-400">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

/**
 * Pick one — or several — from a short fixed list.
 *
 * Chips rather than a picker wheel: every option is visible at once, and the
 * lists here (seven federations, twenty colours, three sexes) are short enough
 * that scrolling a wheel to find one is slower than seeing it.
 */
export function Chips({
  options,
  selected,
  onPick,
}: {
  options: { key: string; label: string; hint?: string | null }[];
  selected: string | string[] | null;
  onPick: (key: string) => void;
}) {
  const isOn = (key: string) =>
    Array.isArray(selected) ? selected.includes(key) : selected === key;

  return (
    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
      {options.map((o) => {
        const on = isOn(o.key);
        return (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            className={`rounded-lg border px-3 py-1.5 ${
              on ? "border-cyan-600 bg-cyan-600" : "border-slate-200 bg-white"
            }`}
          >
            <Text className={`text-xs font-medium ${on ? "text-white" : "text-slate-700"}`}>
              {o.label}
            </Text>
            {o.hint ? (
              <Text className={`text-[10px] ${on ? "text-cyan-100" : "text-slate-400"}`}>{o.hint}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
