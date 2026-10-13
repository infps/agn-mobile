import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * The shapes and small pieces the race screens share.
 *
 * A race is looked at from five places — the list, the race itself, the result,
 * and the sheets that correct it — and each of them was starting to keep its
 * own idea of what a race row contains. The types here are read off the
 * portal's route handlers (`/api/admin/race`, `/api/admin/race-item`), so a
 * field that is missing here is missing from the server, not forgotten.
 */

export interface AdminRace {
  id: number;
  name: string | null;
  description: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
  endTime: string | null;
  sunrise: string | null;
  sunset: string | null;
  distance: number | null;
  location: string | null;
  weather: string | null;
  wind: string | null;
  temperature: string | null;
  arrivalWeather: string | null;
  arrivalWind: string | null;
  arrivalTemperature: string | null;
  isClosed: number | null;
  isPrivate: boolean;
  season: string | null;
  raceTypeId: number | null;
  raceStationId: number | null;
  transportStatus: string | null;
  transportStartedAt?: string | null;
  transportEndedAt?: string | null;
  bettingOpen: boolean;
  isLive: boolean;
  raceType?: { id?: number; name?: string | null } | null;
  /** Only on the single-race read. */
  raceStation?: {
    id: number;
    name: string | null;
    latitude: number | null;
    longitude: number | null;
    miles: number | null;
  } | null;
  seasonRel?: { event?: { id: number; name: string | null } | null } | null;
  /** Only on the list read. */
  activeBirds?: number;
  lostBirds?: number;
  foreignBirds?: number;
}

export interface AdminRaceItem {
  id: number;
  inventoryItemId: number | null;
  status: string;
  /** PENDING / PARTIAL mean the registration behind the bird still owes. */
  paymentStatus: string | null;
  birdPosition: number | null;
  birdPositionHotSpot: number | null;
  prizeValue: number | null;
  birdDrop: number | null;
  arrivalTime: string | null;
  groupId: number | null;
  loftBasketLabel: string | null;
  raceBasketLabel: string | null;
  displayStatusId?: number | null;
  bird?: {
    id?: number;
    band?: string | null;
    band1?: string | null;
    band2?: string | null;
    band3?: string | null;
    band4?: string | null;
    birdName?: string | null;
    rfid?: string | null;
    breeder?: { firstName?: string | null; lastName?: string | null } | null;
  };
  eventInventoryItem?: { eventInventory?: { loft?: string | null } | null };
}

export const raceLabel = (r: { id: number; name?: string | null; raceNumber?: number | null }) =>
  r.name || `Race ${r.raceNumber ?? r.id}`;

/** The portal's list form of a band: country-year-first four letters-number. */
export function shortBand(band: string | null | undefined): string {
  if (!band) return "";
  const parts = band.split("-");
  if (parts.length < 4) return band;
  const letters = parts.slice(2, -1).join("-").slice(0, 4);
  return [parts[0], parts[1], letters, parts[parts.length - 1]].join("-");
}

export const bandOf = (item: AdminRaceItem | null | undefined): string => {
  const b = item?.bird;
  if (!b) return "No band";
  return (
    shortBand(b.band) || [b.band1, b.band2, b.band3, b.band4].filter(Boolean).join("-") || "No band"
  );
};

export const breederOf = (item: AdminRaceItem | null | undefined): string =>
  `${item?.bird?.breeder?.firstName ?? ""} ${item?.bird?.breeder?.lastName ?? ""}`.trim();

export const isUnpaid = (item: AdminRaceItem) =>
  item.paymentStatus === "PENDING" || item.paymentStatus === "PARTIAL";

export const RACE_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  STARTED: { bg: "bg-emerald-100", text: "text-emerald-700", label: "in the air" },
  REGISTERING: { bg: "bg-blue-100", text: "text-blue-700", label: "taking entries" },
  ENDED: { bg: "bg-slate-200", text: "text-slate-600", label: "ended" },
};

export const ITEM_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  REGISTERED: { bg: "bg-slate-100", text: "text-slate-600", label: "registered" },
  CHECKED_IN: { bg: "bg-slate-200", text: "text-slate-700", label: "checked in" },
  LOFT_BASKETED: { bg: "bg-purple-100", text: "text-purple-700", label: "loft" },
  RELEASED: { bg: "bg-green-100", text: "text-green-700", label: "released" },
  ARRIVED: { bg: "bg-emerald-100", text: "text-emerald-700", label: "arrived" },
  FOREIGN_BIRD: { bg: "bg-rose-100", text: "text-rose-700", label: "foreign" },
  STRAY: { bg: "bg-amber-100", text: "text-amber-700", label: "stray" },
  IGNORED: { bg: "bg-slate-200", text: "text-slate-600", label: "did not fly" },
  LOST: { bg: "bg-rose-100", text: "text-rose-700", label: "lost" },
};

export const itemStatus = (status: string) =>
  ITEM_STATUS[status] ?? {
    bg: "bg-slate-100",
    text: "text-slate-600",
    label: status.toLowerCase().replace(/_/g, " "),
  };

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The scan routes want YYYYMMDDHHMMSSsss, read as UTC. */
export function scanStamp(at: Date = new Date()): string {
  return (
    at.getUTCFullYear() +
    pad(at.getUTCMonth() + 1) +
    pad(at.getUTCDate()) +
    pad(at.getUTCHours()) +
    pad(at.getUTCMinutes()) +
    pad(at.getUTCSeconds()) +
    pad(at.getUTCMilliseconds(), 3)
  );
}

export const clock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * A choice that is on or off, drawn as a row with a box.
 *
 * At module scope for the usual reason: declared inside a sheet it would be a
 * new component type on every keystroke in the field above it, and React would
 * rebuild it under the thumb that is about to press it.
 */
export function CheckRow({
  on,
  label,
  hint,
  onPress,
  disabled = false,
}: {
  on: boolean;
  label: string;
  hint?: string | null;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-3 py-2.5 ${disabled ? "opacity-50" : ""}`}
    >
      <Ionicons
        name={on ? "checkbox" : "square-outline"}
        size={22}
        color={on ? "#0891b2" : "#94a3b8"}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-slate-900">{label}</Text>
        {hint ? <Text className="text-xs text-slate-500">{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export interface Pill {
  key: string | number;
  label: string;
  /** A count or an order number, shown ahead of the label. */
  lead?: string | number | null;
}

/** A strip of pills to pick one of, or several — filters and small enums. */
export function Pills({
  pills,
  isOn,
  onPress,
  wrap = false,
}: {
  pills: Pill[];
  isOn: (key: string | number) => boolean;
  onPress: (key: string | number) => void;
  /** Wrapped inside a sheet, scrolled sideways on a screen. */
  wrap?: boolean;
}) {
  const body = pills.map((p) => {
    const active = isOn(p.key);
    return (
      <Pressable
        key={p.key}
        onPress={() => onPress(p.key)}
        className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 ${
          active ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
        }`}
      >
        {p.lead != null ? (
          <Text className={`text-xs font-bold ${active ? "text-white" : "text-slate-900"}`}>
            {p.lead}
          </Text>
        ) : null}
        <Text className={`text-xs font-medium ${active ? "text-white" : "text-slate-600"}`}>
          {p.label}
        </Text>
      </Pressable>
    );
  });

  if (wrap) {
    return (
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {body}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {body}
    </ScrollView>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text className="mb-1 mt-4 text-xs font-medium text-slate-600">{children}</Text>;
}
