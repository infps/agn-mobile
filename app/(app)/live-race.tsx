import BreederExportButton from "@/components/BreederExportButton";
import Header from "@/components/header";
import { RaceRouteMap, RouteLine, RoutePin } from "@/components/RaceRouteMap";
import { RaceTrackMap } from "@/components/RaceTrackMap";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * One race — the portal's /races/[raceId] page.
 *
 * The race itself comes from GET /breeder/races?raceId= and its field from
 * GET /breeder/races/[raceId]/items, which already flattens position and
 * arrival onto each item. Rank, gap to the leader, flight time and speed are
 * worked out here the same way the portal page does: yards flown over minutes
 * in the air. While the race is in the air the field refreshes every 15s.
 */

interface Race {
  id: number;
  name: string | null;
  description: string | null;
  raceNumber: number | null;
  status: string; // REGISTERING | STARTED | ENDED ...
  startTime: string | null;
  endTime: string | null;
  distance: number | null;
  location: string | null;
  temperature: string | null;
  weather: string | null;
  wind: string | null;
  arrivalTemperature: string | null;
  arrivalWeather: string | null;
  arrivalWind: string | null;
  bettingOpen: boolean;
  transportStatus: string | null;
  youtubeUrl: string | null;
  facebookStreamUrl: string | null;
  facebookPageUrl: string | null;
  raceType?: { name?: string | null } | null;
  seasonRel?: { name?: string | null; event?: { id?: number; name?: string | null } | null } | null;
}

interface RaceItem {
  id: number;
  status?: string | null;
  birdPosition: number | null;
  arrivalTime: string | null;
  previousPosition: number | null;
  bird?: {
    id: number;
    band?: string | null;
    band1?: string | null;
    band2?: string | null;
    band3?: string | null;
    band4?: string | null;
    birdName?: string | null;
    color?: string | null;
    sex?: number | null;
    breeder?: {
      firstName?: string | null;
      lastName?: string | null;
      country?: string | null;
      user?: { id: string; loftName?: string | null } | null;
    } | null;
  };
}

interface Row extends RaceItem {
  rank: number | null;
  gapMs: number | null;
  flightTimeMs: number | null;
  ypm: number | null;
  loftName: string;
  band: string;
}

/** GET /api/race/[raceId]/wind-route */
interface WindRoute {
  flightBearing: number;
  release: { lat: number; lon: number; label: string };
  dest: { lat: number; lon: number; label: string };
  samples: {
    lat: number;
    lon: number;
    distMiles: number;
    tempK: number;
    wind: { speedMph: number; kind: "tailwind" | "headwind" | "crosswind"; crossSide?: "left" | "right" };
  }[];
}

/** One line of GET /api/birds/[birdId]/history. */
interface HistoryEntry {
  type: string;
  date: string;
  eventName?: string;
  raceName?: string;
  position?: number;
  distance?: number;
  ypm?: number;
  raceTypeName?: string | null;
}

const REFRESH_INTERVAL = 15_000;
const WIND_COLOR = { tailwind: "#16a34a", headwind: "#dc2626", crosswind: "#d97706" } as const;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const clock = (ms: number) =>
  `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(
    Math.floor((ms % 60000) / 1000)
  )}`;
const arrivalClock = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};
const bandOf = (b: RaceItem["bird"]) =>
  b?.band?.trim() || [b?.band1, b?.band2, b?.band3, b?.band4].filter(Boolean).join("-") || "-";

function Fact({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string }) {
  return (
    <View className="flex-1 border border-gray-200 rounded-lg p-2 items-center">
      <Ionicons name={icon} size={14} color="#189AB4" />
      <Text className="font-bold text-xs mt-1 text-center" numberOfLines={1}>{value}</Text>
      <Text className="text-gray-400 text-[10px]">{label}</Text>
    </View>
  );
}

const LiveRace = () => {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  const { user } = useAuth();
  const toast = useToast();

  const [race, setRace] = useState<Race | null>(null);
  const [raceItems, setRaceItems] = useState<RaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"arrivals" | "all">("arrivals");
  const [myTeamOnly, setMyTeamOnly] = useState(false);
  const [loftFilter, setLoftFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [wind, setWind] = useState<WindRoute | null>(null);
  const [windOpen, setWindOpen] = useState(false);
  const [windLoading, setWindLoading] = useState(false);

  const [birdPopup, setBirdPopup] = useState<{ id: number; band: string } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRaceItems = useCallback(async () => {
    try {
      const res = await api.get(`/breeder/races/${raceId}/items`);
      setRaceItems(res.data.raceItems || []);
    } catch {
      // silent refresh failure
    }
  }, [raceId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [raceRes, itemsRes] = await Promise.all([
          api.get("/breeder/races", { params: { raceId } }),
          api.get(`/breeder/races/${raceId}/items`),
        ]);
        setRace(raceRes.data.race);
        setRaceItems(itemsRes.data.raceItems || []);
      } catch (err: any) {
        setError(err?.response?.data?.message || "Failed to load race");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [raceId]);

  const isLive = race?.status === "STARTED";

  // Only a race in the air changes, so only that one is polled.
  useEffect(() => {
    if (!isLive) return;
    intervalRef.current = setInterval(fetchRaceItems, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRaceItems, isLive]);

  const rows: Row[] = useMemo(() => {
    const startMs = race?.startTime ? new Date(race.startTime).getTime() : null;
    const distanceYards = (race?.distance ?? 0) * 1760;
    const arrived = raceItems
      .filter((it) => it.birdPosition != null)
      .sort((a, b) => (a.birdPosition ?? 0) - (b.birdPosition ?? 0));
    const leaderMs = arrived[0]?.arrivalTime ? new Date(arrived[0].arrivalTime).getTime() : null;

    return raceItems.map((it) => {
      const arrivalMs = it.arrivalTime ? new Date(it.arrivalTime).getTime() : null;
      let ypm: number | null = null;
      let flightTimeMs: number | null = null;
      if (arrivalMs != null && startMs != null && arrivalMs > startMs) {
        flightTimeMs = arrivalMs - startMs;
        const minutes = flightTimeMs / 60000;
        if (minutes > 0 && distanceYards > 0) ypm = distanceYards / minutes;
      }
      const breeder = it.bird?.breeder;
      const loftName =
        breeder?.user?.loftName?.trim() ||
        `${breeder?.firstName ?? ""} ${breeder?.lastName ?? ""}`.trim() ||
        "-";
      return {
        ...it,
        rank: it.birdPosition,
        gapMs: arrivalMs != null && leaderMs != null ? arrivalMs - leaderMs : null,
        flightTimeMs,
        ypm,
        loftName,
        band: bandOf(it.bird),
      };
    });
  }, [raceItems, race?.startTime, race?.distance]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (tab === "arrivals" ? r.rank != null : true))
      .filter((r) => (myTeamOnly && user?.id ? r.bird?.breeder?.user?.id === user.id : true))
      .filter((r) => (loftFilter ? r.loftName === loftFilter : true))
      .filter(
        (r) =>
          !q ||
          r.band.toLowerCase().includes(q) ||
          r.loftName.toLowerCase().includes(q) ||
          String(r.bird?.birdName ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999));
  }, [rows, tab, myTeamOnly, loftFilter, search, user?.id]);

  const arrivedCount = rows.filter((r) => r.rank != null).length;
  const raceVelocity = rows.find((r) => r.rank === 1)?.ypm ?? null;

  const openWind = async () => {
    setWindOpen(true);
    if (wind || windLoading) return;
    setWindLoading(true);
    try {
      const res = await api.get(`/race/${raceId}/wind-route`, { timeout: 60000 });
      setWind(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not load the wind along the route");
      setWindOpen(false);
    } finally {
      setWindLoading(false);
    }
  };

  const windMap = useMemo(() => {
    if (!wind) return { lines: [] as RouteLine[], pins: [] as RoutePin[] };
    const lines: RouteLine[] = [
      {
        id: "route",
        color: "#189AB4",
        width: 3,
        points: [
          { latitude: wind.release.lat, longitude: wind.release.lon },
          ...wind.samples.map((s) => ({ latitude: s.lat, longitude: s.lon })),
          { latitude: wind.dest.lat, longitude: wind.dest.lon },
        ],
      },
    ];
    const pins: RoutePin[] = [
      { id: "release", latitude: wind.release.lat, longitude: wind.release.lon, title: wind.release.label, description: "Release", color: "#dc2626" },
      { id: "dest", latitude: wind.dest.lat, longitude: wind.dest.lon, title: wind.dest.label, description: "Loft", color: "#16a34a" },
      ...wind.samples.map((s, i) => ({
        id: `s${i}`,
        latitude: s.lat,
        longitude: s.lon,
        title: `${Math.round(s.distMiles)} mi · ${s.wind.kind}`,
        description: `${s.wind.speedMph.toFixed(1)} mph · ${(s.tempK - 273.15).toFixed(0)}°C`,
        color: WIND_COLOR[s.wind.kind] ?? "#6b7280",
        dot: true,
      })),
    ];
    return { lines, pins };
  }, [wind]);

  const openBird = (id: number, band: string) => {
    setBirdPopup({ id, band });
    setHistory(null);
    api
      .get(`/birds/${id}/history`)
      .then((r) => setHistory(r.data?.entries ?? []))
      .catch(() => setHistory([]));
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (error || !race) {
    return (
      <SafeAreaView className="flex-1">
        <Header title="Race" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-red-500">{error || "Race not found"}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const title = race.name?.trim() || race.description?.trim() || `Race ${race.raceNumber ?? race.id}`;
  const eventId = race.seasonRel?.event?.id;
  const statusBadge =
    race.status === "STARTED"
      ? { text: "LIVE", bg: "#ef4444" }
      : race.status === "ENDED"
        ? { text: "FINISHED", bg: "#6b7280" }
        : { text: race.status === "REGISTERING" ? "REGISTERING" : race.status, bg: "#189AB4" };
  const hasStream = !!(race.youtubeUrl || race.facebookStreamUrl || race.facebookPageUrl);
  const arrivedHistory = (history ?? []).filter((e) => e.type === "ARRIVED");

  const header = (
    <View>
      <View className="bg-white mx-3 mt-3 rounded-lg p-4" style={{ shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}>
        <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
          <Text className="text-xl font-bold flex-shrink">{title}</Text>
          <View style={{ backgroundColor: statusBadge.bg }} className="px-2 py-1 rounded-full flex-row items-center">
            {isLive ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", marginRight: 4 }} /> : null}
            <Text className="text-white text-xs font-bold">{statusBadge.text}</Text>
          </View>
        </View>
        <TouchableOpacity
          disabled={!eventId}
          onPress={() => eventId && router.push({ pathname: "/event-detail", params: { id: String(eventId) } } as any)}
        >
          <Text className="text-gray-600 text-sm mt-1">
            {race.seasonRel?.event?.name ?? ""}
            {race.raceType?.name ? ` • ${race.raceType.name}` : ""}
          </Text>
        </TouchableOpacity>
        {race.location ? (
          <Text className="text-blue-600 text-sm mt-1">
            Release Station: <Text className="font-medium">{race.location}</Text>
          </Text>
        ) : null}

        <View className="flex-row mt-3" style={{ gap: 6 }}>
          <Fact icon="time-outline" label="Release" value={race.startTime ? format(new Date(race.startTime), "MMM dd, HH:mm") : "-"} />
          <Fact icon="navigate-outline" label="Miles" value={race.distance != null ? String(race.distance) : "-"} />
          <Fact icon="checkmark-done-outline" label="Arrived" value={`${arrivedCount}/${rows.length}`} />
          <Fact icon="speedometer-outline" label="Winner YPM" value={raceVelocity != null ? raceVelocity.toFixed(2) : "-"} />
        </View>

        {/* Weather at release and at the loft, as recorded for the race */}
        {race.weather || race.temperature || race.wind || race.arrivalWeather || race.arrivalTemperature || race.arrivalWind ? (
          <View className="mt-3 pt-3 border-t border-gray-100">
            <Text className="text-xs text-gray-600">
              <Text className="font-semibold">Release: </Text>
              {[race.weather, race.temperature, race.wind].filter(Boolean).join(" · ") || "-"}
            </Text>
            <Text className="text-xs text-gray-600 mt-0.5">
              <Text className="font-semibold">Arrival: </Text>
              {[race.arrivalWeather, race.arrivalTemperature, race.arrivalWind].filter(Boolean).join(" · ") || "-"}
            </Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
          <TouchableOpacity onPress={openWind} className="flex-row items-center border border-primary rounded-lg px-3 py-2">
            <Ionicons name="flag-outline" size={15} color="#189AB4" />
            <Text className="text-primary text-xs font-semibold ml-1">Wind route</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/race-betting", params: { raceId: String(raceId) } } as any)}
            className="flex-row items-center border border-primary rounded-lg px-3 py-2"
          >
            <Ionicons name="cash-outline" size={15} color="#189AB4" />
            <Text className="text-primary text-xs font-semibold ml-1">
              Betting{race.bettingOpen ? " (open)" : ""}
            </Text>
          </TouchableOpacity>
          <BreederExportButton kind="results" raceId={raceId} label="My results" />
        </View>

        {hasStream ? (
          <View className="flex-row flex-wrap mt-2" style={{ gap: 8 }}>
            {race.youtubeUrl ? (
              <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(race.youtubeUrl as string)} className="flex-row items-center">
                <Ionicons name="logo-youtube" size={16} color="#ef4444" />
                <Text className="text-xs font-semibold text-gray-700 ml-1">YouTube stream</Text>
              </TouchableOpacity>
            ) : null}
            {race.facebookStreamUrl || race.facebookPageUrl ? (
              <TouchableOpacity
                onPress={() => WebBrowser.openBrowserAsync((race.facebookPageUrl || race.facebookStreamUrl) as string)}
                className="flex-row items-center"
              >
                <Ionicons name="logo-facebook" size={16} color="#1877f2" />
                <Text className="text-xs font-semibold text-gray-700 ml-1">Watch on Facebook</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Where the transport is. Only before the finish — once the race is
          over the convoy stops being the question. */}
      {race.status !== "ENDED" && (
        <View className="mx-3 mt-3">
          <RaceTrackMap raceId={Number(raceId)} height={220} live />
        </View>
      )}

      {/* Tabs and filters */}
      <View className="flex-row mx-3 mt-4 items-center">
        {([
          ["arrivals", `Arrivals (${arrivedCount})`],
          ["all", `All birds (${rows.length})`],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            className={`px-3 py-2 rounded-lg mr-2 ${tab === key ? "bg-primary" : "bg-white"}`}
          >
            <Text className={`text-xs font-semibold ${tab === key ? "text-white" : "text-gray-700"}`}>{label}</Text>
          </TouchableOpacity>
        ))}
        <View className="flex-1" />
        <TouchableOpacity
          onPress={() => setMyTeamOnly((v) => !v)}
          className={`px-3 py-2 rounded-lg ${myTeamOnly ? "bg-purple-600" : "bg-white"}`}
        >
          <Text className={`text-xs font-semibold ${myTeamOnly ? "text-white" : "text-gray-700"}`}>
            {myTeamOnly ? "Show All" : "My Team"}
          </Text>
        </TouchableOpacity>
      </View>
      <View className="flex-row items-center bg-white rounded-lg px-3 mx-3 mt-2 border border-gray-200">
        <Ionicons name="search" size={16} color="#9ca3af" />
        <TextInput
          className="flex-1 py-2 ml-2 text-sm text-black"
          placeholder="Search band, bird or loft"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>
      {loftFilter ? (
        <TouchableOpacity onPress={() => setLoftFilter(null)} className="flex-row items-center mx-3 mt-2">
          <Text className="text-xs text-gray-700">
            Showing loft: <Text className="font-bold">{loftFilter}</Text>
          </Text>
          <Ionicons name="close-circle" size={16} color="#9ca3af" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      ) : null}
      <View style={{ height: 8 }} />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title={isLive ? "Live Race" : "Race"} />

      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const pos = item.rank;
          return (
            <View className="flex-row mx-3 px-3 py-3 border-b border-gray-200 bg-white items-center">
              <View className="w-9">
                {pos ? (
                  <View
                    style={{
                      backgroundColor: pos === 1 ? "#F59E0B" : pos === 2 ? "#9CA3AF" : pos === 3 ? "#CD7F32" : "#189AB4",
                      minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 4,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Text className="text-white text-xs font-bold">{pos}</Text>
                  </View>
                ) : (
                  <Text className="text-gray-400">-</Text>
                )}
              </View>
              <View className="flex-1 ml-1">
                <TouchableOpacity onPress={() => setLoftFilter(item.loftName)}>
                  <Text className="text-xs font-semibold text-gray-800" numberOfLines={1}>{item.loftName}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!item.bird?.id}
                  onPress={() => item.bird?.id && openBird(item.bird.id, item.band)}
                >
                  <Text className="text-xs text-primary" numberOfLines={1}>
                    {item.band}
                    {item.bird?.birdName ? ` · ${item.bird.birdName}` : ""}
                  </Text>
                </TouchableOpacity>
                {item.previousPosition != null ? (
                  <Text className="text-[10px] text-gray-400">Previous race: #{item.previousPosition}</Text>
                ) : null}
              </View>
              <View className="items-end">
                {item.arrivalTime ? (
                  <>
                    <Text className="text-xs text-gray-800">{arrivalClock(item.arrivalTime)}</Text>
                    {pos === 1 ? (
                      <Text className="text-[10px] font-bold text-green-600">LEADER</Text>
                    ) : item.gapMs != null ? (
                      <Text className="text-[10px] font-semibold text-red-600">+{clock(item.gapMs)}</Text>
                    ) : null}
                    {item.flightTimeMs != null ? (
                      <Text className="text-[10px] text-gray-500">Flight {clock(item.flightTimeMs)}</Text>
                    ) : null}
                    {item.ypm != null ? (
                      <Text className="text-[10px] font-semibold text-blue-600">{item.ypm.toFixed(4)} YPM</Text>
                    ) : null}
                  </>
                ) : (
                  <Text className="text-[10px] text-gray-400">{item.status ? item.status.replace(/_/g, " ").toLowerCase() : "-"}</Text>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="py-8 mx-3 items-center bg-white">
            <Text className="text-gray-500">
              {tab === "arrivals" ? "No arrivals yet" : "No birds entered"}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Wind along the route */}
      <Modal visible={windOpen} animationType="slide" onRequestClose={() => setWindOpen(false)}>
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
            <Text className="text-lg font-bold">Wind along the route</Text>
            <TouchableOpacity onPress={() => setWindOpen(false)}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          {windLoading || !wind ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#189AB4" />
              <Text className="text-xs text-gray-500 mt-3">Sampling the forecast along the flight line…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
              <RaceRouteMap lines={windMap.lines} pins={windMap.pins} height={300} />
              <Text className="text-xs text-gray-500 mt-2">
                {wind.release.label} → {wind.dest.label} · flight bearing {Math.round(wind.flightBearing)}°
              </Text>
              <View className="flex-row mt-2" style={{ gap: 12 }}>
                {(["tailwind", "crosswind", "headwind"] as const).map((k) => (
                  <View key={k} className="flex-row items-center">
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: WIND_COLOR[k], marginRight: 4 }} />
                    <Text className="text-xs text-gray-700 capitalize">{k}</Text>
                  </View>
                ))}
              </View>
              <View className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                {wind.samples.map((s, i) => (
                  <View key={i} className={`flex-row px-3 py-2 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                    <Text className="text-xs text-gray-600 w-16">{Math.round(s.distMiles)} mi</Text>
                    <Text style={{ color: WIND_COLOR[s.wind.kind] }} className="text-xs font-semibold flex-1 capitalize">
                      {s.wind.kind}
                      {s.wind.kind === "crosswind" && s.wind.crossSide ? ` (${s.wind.crossSide})` : ""}
                    </Text>
                    <Text className="text-xs text-gray-800 w-20 text-right">{s.wind.speedMph.toFixed(1)} mph</Text>
                    <Text className="text-xs text-gray-500 w-12 text-right">{(s.tempK - 273.15).toFixed(0)}°C</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* A bird's record */}
      <Modal visible={!!birdPopup} animationType="slide" onRequestClose={() => setBirdPopup(null)}>
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
            <Text className="text-lg font-bold">{birdPopup?.band}</Text>
            <TouchableOpacity onPress={() => setBirdPopup(null)}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          {history == null ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#189AB4" />
            </View>
          ) : arrivedHistory.length === 0 ? (
            <Text className="text-center text-gray-500 mt-10">No race results recorded for this bird.</Text>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
              {arrivedHistory.map((e, i) => (
                <View key={i} className="py-2 border-b border-gray-100">
                  <View className="flex-row justify-between">
                    <Text className="text-sm font-semibold text-gray-900 flex-1" numberOfLines={1}>
                      {e.raceName ?? "Race"}
                      {e.raceTypeName ? ` (${e.raceTypeName})` : ""}
                    </Text>
                    <Text className="text-sm font-bold text-primary">{e.position != null ? `#${e.position}` : "-"}</Text>
                  </View>
                  <Text className="text-xs text-gray-500">
                    {e.eventName ?? ""} · {format(new Date(e.date), "MMM d, yyyy")}
                    {e.distance != null ? ` · ${e.distance} mi` : ""}
                    {e.ypm != null ? ` · ${e.ypm.toFixed(2)} YPM` : ""}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

export default LiveRace;
