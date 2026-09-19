import React from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  SectionTitle,
  money,
} from "@/components/admin/ui";

interface RaceItem {
  id: number;
  race?: { id: number; name: string | null; raceNumber: number | null; startTime: string | null } | null;
  result?: { birdPosition: number | null; arrivalTime: string | null; prizeValue: number | null } | null;
}

interface InventoryItem {
  id: number;
  eventInventory?: {
    loft: string | null;
    season?: { name: string | null; event?: { name: string | null } | null } | null;
  } | null;
  raceItems?: RaceItem[];
}

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
  isLost: number | null;
  healthStatus: string | null;
  healthNote: string | null;
  note: string | null;
  attention: string | null;
  breeder?: { firstName: string | null; lastName: string | null; city1: string | null; state1: string | null } | null;
  inventoryItems?: InventoryItem[];
}

const SEX = (n: number | null) => (n === 1 ? "Cock" : n === 2 ? "Hen" : n === 0 ? "Unknown" : "—");

/**
 * One bird, and everything that has happened to it.
 *
 * The portal spreads this across a detail page and a history tab. Here the
 * racing record is the page, because that is what the bird is *for* — the
 * identifying details are a short block above it rather than the main event.
 *
 * Read only. Editing a bird from a phone, in a loft, next to a basket, is how
 * the wrong band number gets saved.
 */
export default function AdminBirdDetail() {
  const { birdId } = useLocalSearchParams<{ birdId?: string }>();
  const router = useRouter();

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{ bird?: Bird }>(
    birdId ? `/admin/bird/${birdId}` : null,
    [birdId]
  );

  const bird = data?.bird ?? null;

  if (forbidden) return <NoAccess what="Bird records" />;
  if (loading) return <Loading />;

  if (!bird) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-center text-sm text-slate-500">
          {error ?? "That bird could not be found."}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-sm font-medium text-blue-600">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Flattened across every event the bird has been entered in, newest first.
  const races = (bird.inventoryItems ?? [])
    .flatMap((item) =>
      (item.raceItems ?? []).map((ri) => ({
        ...ri,
        event: item.eventInventory?.season?.event?.name ?? null,
        loft: item.eventInventory?.loft ?? null,
      }))
    )
    .sort(
      (a, b) =>
        new Date(b.race?.startTime ?? 0).getTime() - new Date(a.race?.startTime ?? 0).getTime()
    );

  const flown = races.filter((r) => r.result?.birdPosition != null).length;
  const won = races.reduce((s, r) => s + (r.result?.prizeValue ?? 0), 0);
  const best = races.reduce<number | null>((b, r) => {
    const p = r.result?.birdPosition;
    return p != null && (b == null || p < b) ? p : b;
  }, null);

  const who = `${bird.breeder?.firstName ?? ""} ${bird.breeder?.lastName ?? ""}`.trim();

  return (
    <Screen
      title={bird.band ?? "No band"}
      subtitle={
        [bird.birdName, who || null, [bird.breeder?.city1, bird.breeder?.state1].filter(Boolean).join(", ") || null]
          .filter(Boolean)
          .join(" · ") || null
      }
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <Pressable onPress={() => router.back()} className="mt-3 flex-row items-center gap-1">
        <Ionicons name="chevron-back" size={16} color="#2563eb" />
        <Text className="text-sm font-medium text-blue-600">Back</Text>
      </Pressable>

      {error ? <Notice>{error}</Notice> : null}

      {bird.isLost === 1 && <Notice tone="rose">This bird is recorded as lost.</Notice>}
      {bird.attention ? <Notice>{bird.attention}</Notice> : null}

      <SectionTitle>Bird</SectionTitle>
      <Rows>
        <Row title="Colour" right={bird.color ?? "—"} />
        <Row title="Sex" right={SEX(bird.sex)} />
        <Row
          title="Tag"
          right={bird.rfid ?? "not tagged"}
          rightTone={bird.rfid ? "text-emerald-600" : "text-slate-400"}
        />
        <Row
          title="Health"
          right={(bird.healthStatus ?? "healthy").toLowerCase()}
          rightSub={bird.healthNote ?? undefined}
        />
      </Rows>

      {bird.note ? (
        <View className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Note
          </Text>
          <Text className="mt-1 text-sm text-slate-700">{bird.note}</Text>
        </View>
      ) : null}

      <SectionTitle>Racing record</SectionTitle>
      <Rows>
        <Row title="Races flown" right={String(flown)} />
        <Row title="Best position" right={best != null ? String(best) : "—"} />
        <Row title="Prize money" right={money(won)} rightTone="text-emerald-600" />
      </Rows>

      <SectionTitle>Races</SectionTitle>
      {races.length === 0 ? (
        <Empty>This bird has not been entered in a race.</Empty>
      ) : (
        <Rows>
          {races.slice(0, 60).map((r) => (
            <Row
              key={r.id}
              title={r.race?.name || `Race ${r.race?.raceNumber ?? r.race?.id ?? "—"}`}
              subtitle={
                [r.event, r.race?.startTime ? new Date(r.race.startTime).toLocaleDateString() : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              right={r.result?.birdPosition != null ? `#${r.result.birdPosition}` : "no position"}
              rightSub={
                r.result?.prizeValue != null && r.result.prizeValue > 0
                  ? money(r.result.prizeValue)
                  : undefined
              }
              rightTone={r.result?.birdPosition != null ? "text-slate-900" : "text-slate-400"}
            />
          ))}
        </Rows>
      )}
    </Screen>
  );
}
