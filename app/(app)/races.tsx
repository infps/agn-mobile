import Header from "@/components/header";
import { RaceRouteMap, RouteLine, RoutePin } from "@/components/RaceRouteMap";
import { useResponsive } from "@/hooks/useResponsive";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** GET /breeder/races — every race this account may see. */
interface Race {
  id: number;
  name: string | null;
  description: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
  distance: number | null;
  location: string | null;
  raceType?: { name?: string | null } | null;
  seasonRel?: { event?: { id?: number; name?: string | null; shortName?: string | null } | null } | null;
}

/** GET /breeder/races/live — races in the air or taking entries, with counts. */
interface LiveRace {
  id: number;
  name: string | null;
  description: string | null;
  location: string | null;
  startTime: string | null;
  distance: number | null;
  status: string;
  arrivedCount: number;
  event: { id: number; name: string | null; shortName: string | null; logoImage: string | null } | null;
  raceType: { id: number; name: string | null } | null;
  _count?: { raceItems?: number };
}

/** GET /breeder/races/live-map */
interface MapRace {
  id: number;
  name: string | null;
  description: string | null;
  distance: number | null;
  startTime: string | null;
  status: string | null;
  station: { name: string | null; lat: number; lng: number };
  loft: { eventId: number; name: string | null; lat: number; lng: number };
}

type RacesView = "live" | "all" | "map";
type SortKey = "recentlyCreated" | "longestRunning" | "mostBirds" | "longestDistance";
type StatusFilter = "ALL" | "STARTED" | "REGISTERING" | "ENDED";

/** The portal's four orderings for the live list, in the portal's words. */
const SORTS: { value: SortKey; label: string }[] = [
  { value: "recentlyCreated", label: "Recently created" },
  { value: "longestRunning", label: "Longest running" },
  { value: "mostBirds", label: "Most birds" },
  { value: "longestDistance", label: "Longest distance" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "STARTED", label: "In the air" },
  { value: "REGISTERING", label: "Taking entries" },
  { value: "ENDED", label: "Finished" },
];

const STATUS_TONE: Record<string, { bg: string; text: string; label: string }> = {
  STARTED: { bg: "bg-emerald-100", text: "text-emerald-700", label: "in the air" },
  REGISTERING: { bg: "bg-blue-100", text: "text-blue-700", label: "taking entries" },
  ENDED: { bg: "bg-gray-200", text: "text-gray-600", label: "finished" },
};

const TABS: { key: RacesView; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "live", label: "Live", icon: "radio-outline" },
  { key: "all", label: "All races", icon: "list-outline" },
  { key: "map", label: "Map", icon: "map-outline" },
];

function elapsedSince(start: string | null, now: number): string {
  if (!start) return "+00:00:00";
  const ms = Math.max(0, now - new Date(start).getTime());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `+${p(h)}:${p(m)}:${p(s)}`;
}

function sortLive(races: LiveRace[], key: SortKey): LiveRace[] {
  const arr = [...races];
  const ts = (d: string | null) => (d ? new Date(d).getTime() : 0);
  switch (key) {
    case "recentlyCreated":
      arr.sort((a, b) => b.id - a.id);
      break;
    case "mostBirds":
      arr.sort((a, b) => (b._count?.raceItems ?? 0) - (a._count?.raceItems ?? 0));
      break;
    case "longestDistance":
      arr.sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0));
      break;
    default:
      arr.sort((a, b) => ts(a.startTime) - ts(b.startTime));
  }
  return arr;
}

/**
 * Races, as a breeder sees them.
 *
 * Three ways in, matching the portal's races page plus the full list the app
 * already had: what is live right now (with how many birds are home), every
 * race you may see (searchable, filterable by state), and a map of the routes
 * being flown.
 */
const Races = () => {
  const { columns, gutter } = useResponsive();
  const router = useRouter();

  const [view, setView] = useState<RacesView>("live");
  const [sort, setSort] = useState<SortKey>("recentlyCreated");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");

  const [races, setRaces] = useState<Race[]>([]);
  const [live, setLive] = useState<LiveRace[]>([]);
  const [mapRaces, setMapRaces] = useState<MapRace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError(null);
    const [all, liveRes] = await Promise.allSettled([
      api.get("/breeder/races"),
      api.get("/breeder/races/live"),
    ]);
    if (all.status === "fulfilled") setRaces(all.value.data?.races ?? []);
    else {
      setError("Could not load races just now.");
      setRaces([]);
    }
    if (liveRes.status === "fulfilled") {
      setLive(((liveRes.value.data?.races ?? []) as LiveRace[]).filter((r) => r.event));
    } else setLive([]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The live cards carry a running clock.
  useEffect(() => {
    if (view !== "live") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [view]);

  // The map is only fetched once somebody asks for it, then kept fresh every
  // 30s while it is on screen — the same cadence the portal uses.
  useEffect(() => {
    if (view !== "map") return;
    let cancelled = false;
    const fetchMap = async () => {
      try {
        const { data } = await api.get("/breeder/races/live-map");
        if (!cancelled) setMapRaces(data?.races ?? []);
      } catch {
        if (!cancelled) setMapRaces((prev) => prev ?? []);
      }
    };
    fetchMap();
    const t = setInterval(fetchMap, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [view]);

  const openRace = useCallback(
    (id: number) => router.push({ pathname: "/live-race", params: { raceId: String(id) } }),
    [router]
  );

  const sortedLive = useMemo(() => sortLive(live, sort), [live, sort]);

  const filtered = useMemo(() => {
    const rank = (r: Race) => (r.status === "STARTED" ? 0 : r.status === "REGISTERING" ? 1 : 2);
    const q = query.trim().toLowerCase();
    return races
      .filter((r) => status === "ALL" || r.status === status)
      .filter((r) => {
        if (!q) return true;
        return [
          r.name,
          r.description,
          r.location,
          r.seasonRel?.event?.name,
          r.seasonRel?.event?.shortName,
          r.raceType?.name,
        ].some((v) => (v ?? "").toLowerCase().includes(q));
      })
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime()
      );
  }, [races, status, query]);

  const { lines, pins } = useMemo(() => {
    const ls: RouteLine[] = [];
    const ps: RoutePin[] = [];
    (mapRaces ?? []).forEach((r) => {
      const isLive = r.status === "STARTED";
      const title = `${r.description || r.name || "Race"} · ${isLive ? "LIVE" : "UPCOMING"}`;
      const dist = r.distance != null ? ` · ${r.distance} mi` : "";
      ls.push({
        id: `l-${r.id}`,
        points: [
          { latitude: r.station.lat, longitude: r.station.lng },
          { latitude: r.loft.lat, longitude: r.loft.lng },
        ],
        color: isLive ? "#dc2626" : "#94a3b8",
        width: isLive ? 3 : 2,
        dashed: !isLive,
      });
      ps.push({
        id: `s-${r.id}`,
        latitude: r.station.lat,
        longitude: r.station.lng,
        color: "#2563eb",
        faded: !isLive,
        title,
        description: `Release: ${r.station.name || "-"}${dist} — tap to view race`,
        onCalloutPress: () => openRace(r.id),
      });
      ps.push({
        id: `f-${r.id}`,
        latitude: r.loft.lat,
        longitude: r.loft.lng,
        color: "#dc2626",
        faded: !isLive,
        title,
        description: `Loft: ${r.loft.name || "-"}${dist} — tap to view race`,
        onCalloutPress: () => openRace(r.id),
      });
    });
    return { lines: ls, pins: ps };
  }, [mapRaces, openRace]);

  const inAir = races.filter((r) => r.status === "STARTED").length;

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Races" />

      <View className="flex-row items-center border-b border-gray-200 px-4 py-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-emerald-600">{inAir}</Text>
          <Text className="text-xs text-gray-500">In the air</Text>
        </View>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900">{races.length}</Text>
          <Text className="text-xs text-gray-500">Races in total</Text>
        </View>
        <Pressable
          onPress={() => router.push("/race-calendar" as any)}
          className="mr-2 flex-row items-center gap-1 rounded-lg border border-gray-200 px-3 py-2"
        >
          <Ionicons name="calendar-outline" size={14} color="#189AB4" />
          <Text className="text-xs font-medium text-primary">Calendar</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/result" as any)}
          className="flex-row items-center gap-1 rounded-lg border border-gray-200 px-3 py-2"
        >
          <Ionicons name="trophy-outline" size={14} color="#189AB4" />
          <Text className="text-xs font-medium text-primary">Results</Text>
        </Pressable>
      </View>

      {/* Live / All / Map */}
      <View className="mx-4 mt-3 flex-row overflow-hidden rounded-lg border border-gray-200">
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setView(t.key)}
            className={`flex-1 flex-row items-center justify-center gap-1 py-2 ${
              view === t.key ? "bg-primary" : "bg-white"
            }`}
          >
            <Ionicons name={t.icon} size={14} color={view === t.key ? "#fff" : "#4b5563"} />
            <Text className={`text-xs font-semibold ${view === t.key ? "text-white" : "text-gray-600"}`}>
              {t.key === "live" ? `Live (${live.length})` : t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : view === "map" ? (
        <ScrollView contentContainerStyle={{ padding: gutter }}>
          <View className="mb-2 flex-row items-center gap-4">
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 16, height: 2, backgroundColor: "#dc2626" }} />
              <Text className="text-xs text-gray-500">Live route</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 16, borderTopWidth: 2, borderStyle: "dashed", borderColor: "#94a3b8" }} />
              <Text className="text-xs text-gray-500">Upcoming</Text>
            </View>
          </View>
          {mapRaces == null ? (
            <View className="h-80 items-center justify-center rounded-xl border border-gray-200">
              <ActivityIndicator />
            </View>
          ) : (
            <RaceRouteMap lines={lines} pins={pins} height={460} emptyText="No races to map right now." />
          )}
          {(mapRaces ?? []).map((r) => (
            <Pressable
              key={r.id}
              onPress={() => openRace(r.id)}
              className="mt-2 flex-row items-center justify-between rounded-xl border border-gray-200 px-4 py-3"
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-900">
                  {r.description || r.name || "Race"}
                </Text>
                <Text className="text-xs text-gray-500">
                  {r.station.name || "-"} → {r.loft.name || "-"}
                  {r.distance != null ? ` · ${r.distance} mi` : ""}
                </Text>
              </View>
              <Text
                className={`text-[10px] font-bold ${
                  r.status === "STARTED" ? "text-red-600" : "text-gray-500"
                }`}
              >
                {r.status === "STARTED" ? "LIVE" : "UPCOMING"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : view === "live" ? (
        <FlatList
          data={sortedLive}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: gutter, gap: 12 }}
          refreshing={refreshing}
          onRefresh={refresh}
          ListHeaderComponent={
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {SORTS.map((s) => (
                  <Pressable
                    key={s.value}
                    onPress={() => setSort(s.value)}
                    className={`rounded-full border px-3 py-1.5 ${
                      sort === s.value ? "border-primary bg-primary" : "border-gray-200 bg-white"
                    }`}
                  >
                    <Text className={`text-xs ${sort === s.value ? "text-white" : "text-gray-600"}`}>
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          }
          ListEmptyComponent={
            <View className="items-center rounded-xl border border-gray-200 p-8">
              <Ionicons name="radio-outline" size={36} color="#9ca3af" />
              <Text className="mt-2 text-center text-sm text-gray-500">No live races right now.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const total = item._count?.raceItems ?? 0;
            const arrived = item.arrivedCount ?? 0;
            const pct = total > 0 ? Math.min(100, (arrived / total) * 100) : 0;
            const started = item.status === "STARTED";
            return (
              <Pressable
                onPress={() => openRace(item.id)}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <View className="flex-row items-center gap-3 p-4">
                  {item.event?.logoImage ? (
                    <Image
                      source={{ uri: item.event.logoImage }}
                      style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: "#ef4444" }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      className="items-center justify-center bg-amber-700"
                      style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: "#ef4444" }}
                    >
                      <Text className="text-base font-bold text-white">
                        {(item.event?.name ?? "").substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
                      {item.event?.name}
                    </Text>
                    <Text className="text-sm text-gray-500" numberOfLines={1}>
                      {item.name || item.description}
                      {item.raceType?.name ? ` · ${item.raceType.name}` : ""}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-3">
                      {item.location ? (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="location-outline" size={12} color="#6b7280" />
                          <Text className="text-xs text-gray-500" numberOfLines={1}>
                            {item.location}
                          </Text>
                        </View>
                      ) : null}
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="time-outline" size={12} color="#ef4444" />
                        <Text
                          className="text-xs font-medium text-red-500"
                          style={{ fontVariant: ["tabular-nums"] }}
                        >
                          {started ? elapsedSince(item.startTime, now) : "taking entries"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="flex-row items-center border-t border-gray-100 px-4 py-2">
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-900">
                      {item.distance ? `${item.distance} MI` : "—"}
                    </Text>
                    <Text className="text-[10px] uppercase text-gray-500">Distance</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-900">
                      {arrived}/{total}
                    </Text>
                    <Text className="text-[10px] uppercase text-gray-500">Returned</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: started ? "#ef4444" : "#3b82f6",
                      }}
                    />
                    <Text className={`text-xs font-medium ${started ? "text-red-500" : "text-blue-600"}`}>
                      {started ? "In progress" : "Registering"}
                    </Text>
                  </View>
                </View>
                <View className="h-1 w-full bg-gray-100">
                  <View className="h-1 bg-red-500" style={{ width: `${pct}%` }} />
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          // React Native refuses to change numColumns on an existing list, so
          // the key forces a fresh one when the device is rotated.
          key={`cols-${columns}`}
          data={filtered}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
          contentContainerStyle={{ padding: gutter, gap: 12 }}
          keyExtractor={(item) => String(item.id)}
          refreshing={refreshing}
          onRefresh={refresh}
          ListHeaderComponent={
            <View>
              <View className="mb-2 flex-row items-center gap-2 rounded-xl border border-gray-200 px-3">
                <Ionicons name="search" size={16} color="#94a3b8" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Race, event or release point"
                  placeholderTextColor="#94a3b8"
                  className="flex-1 py-2.5 text-sm text-gray-900"
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color="#94a3b8" />
                  </Pressable>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {STATUS_FILTERS.map((f) => (
                    <Pressable
                      key={f.value}
                      onPress={() => setStatus(f.value)}
                      className={`rounded-full border px-3 py-1.5 ${
                        status === f.value ? "border-primary bg-primary" : "border-gray-200 bg-white"
                      }`}
                    >
                      <Text className={`text-xs ${status === f.value ? "text-white" : "text-gray-600"}`}>
                        {f.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <View className="rounded-xl border border-gray-200 p-8">
              <Text className="text-center text-sm text-gray-500">
                {error ??
                  (races.length === 0
                    ? "No races have been scheduled yet."
                    : "No race matches that.")}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const tone = STATUS_TONE[item.status] ?? STATUS_TONE.ENDED;
            return (
              <Pressable
                onPress={() => openRace(item.id)}
                className="rounded-xl border border-gray-200 bg-white p-4"
                style={{ flex: 1 }}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 font-semibold text-gray-900">
                    {item.name || item.description || `Race ${item.raceNumber ?? item.id}`}
                  </Text>
                  <View className={`rounded-full px-2 py-0.5 ${tone.bg}`}>
                    <Text className={`text-[10px] font-medium ${tone.text}`}>{tone.label}</Text>
                  </View>
                </View>

                <Text className="mt-1 text-xs text-gray-500">
                  {item.seasonRel?.event?.shortName ?? item.seasonRel?.event?.name ?? "Event"}
                  {item.raceType?.name ? ` · ${item.raceType.name}` : ""}
                  {item.distance ? ` · ${item.distance} mi` : ""}
                </Text>
                <Text className="mt-2 text-xs text-gray-500">
                  {item.startTime ? new Date(item.startTime).toLocaleString() : "Not scheduled"}
                  {item.location ? ` · ${item.location}` : ""}
                </Text>

                <View className="mt-3 flex-row items-center gap-1">
                  <Text className="text-sm font-medium text-primary">
                    {item.status === "STARTED"
                      ? "Watch live"
                      : item.status === "ENDED"
                      ? "View result"
                      : "View race"}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#189AB4" />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default Races;
