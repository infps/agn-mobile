import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
} from "@/components/admin/ui";

interface Race {
  id: number;
  name: string | null;
  description: string | null;
  location: string | null;
  startTime: string | null;
  distance: number | null;
  season: string | null;
  status: string | null;
  raceType: { id: number; name: string | null } | null;
}

/** The season label the portal shows: the race's own, or YB + the year it flew. */
const seasonOf = (r: Race) => {
  if (r.season && r.season.trim()) return r.season.trim();
  if (r.startTime) return `YB${String(new Date(r.startTime).getFullYear()).slice(2)}`;
  return "Unknown";
};

const liberation = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
};

/**
 * The event's archived races, grouped by the year they were flown.
 *
 * This is the portal's History tab: the list of every race the event has run,
 * oldest first within its year, each one a way into its results. It is the
 * record of the *event* — what was flown, from where, how far.
 *
 * What happened to an individual bird is a different record and lives with the
 * bird: open one from the Birds section and its activity log is on its page.
 * The portal draws a month calendar above this list from the same races; the
 * liberation time on each row carries the same information here.
 */
export default function EventHistory() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    races?: Race[];
  }>(eventId ? `/breeder/event/${eventId}/history` : null, [eventId]);

  const races = useMemo(() => data?.races ?? [], [data]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Race[]>();
    for (const r of races) {
      if (
        q &&
        ![r.name, r.description, r.location, r.raceType?.name, seasonOf(r)].some((v) =>
          (v ?? "").toLowerCase().includes(q)
        )
      ) {
        continue;
      }
      const key = seasonOf(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime()
      );
    }
    return Array.from(map.entries());
  }, [races, query]);

  if (forbidden) return <NoAccess what="Race history" />;

  return (
    <Screen
      title="History"
      subtitle={[name, `${races.length} race${races.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
      onRefresh={refresh}
      refreshing={refreshing}
      header={<SearchBar value={query} onChange={setQuery} placeholder="Race, station or type" />}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          {grouped.length === 0 ? (
            <View className="mt-4">
              <Empty>
                {races.length === 0
                  ? "No races recorded yet for this event."
                  : "No race matches that search."}
              </Empty>
            </View>
          ) : (
            grouped.map(([season, list]) => (
              <View key={season}>
                <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Year: {season}
                </Text>
                <Rows>
                  {list.map((r, index) => (
                    <Row
                      key={r.id}
                      title={`${index + 1}. ${r.description ?? r.name ?? "Race"}`}
                      subtitle={
                        [liberation(r.startTime), r.location, r.raceType?.name]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      right={r.distance != null ? String(r.distance) : "—"}
                      rightSub={r.status ? r.status.toLowerCase() : undefined}
                      onPress={() => router.push(`/(admin)/race-detail?raceId=${r.id}` as never)}
                    />
                  ))}
                </Rows>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
