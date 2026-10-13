import { deleteBirdPhoto, pickBirdPhoto, uploadBirdPhoto } from "@/components/BirdPhoto";
import Header from "@/components/header";
import { useToast } from "@/context";
import { useResponsive } from "@/hooks/useResponsive";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal as RNModal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Relative {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
}

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
  isLost: number | null;
  isPublic: number | null;
  attention?: boolean | null;
  image: string | null;
  note: string | null;
  healthStatus: string | null;
  breeder?: { firstName: string | null; lastName: string | null } | null;
  father?: Relative | null;
  mother?: Relative | null;
  childrenAsFather?: Relative[];
  childrenAsMother?: Relative[];
  siblings?: Relative[];
}

/** One line of `GET /api/birds/[birdId]/history`. */
interface HistoryEntry {
  type: "REGISTERED" | "BASKETED" | "RELEASED" | "ARRIVED" | "FOREIGN_BIRD" | "LOST";
  date: string;
  eventId?: number;
  eventName?: string;
  raceId?: number;
  raceName?: string;
  basketLabel?: string;
  phase?: "LOFT" | "RACE";
  position?: number;
  prizeValue?: number;
  distance?: number;
  ypm?: number;
  gapMs?: number;
  raceTypeName?: string | null;
  flightTimeMs?: number;
}

/** `GET /api/birds/[birdId]/location` — a status in words; the portal keeps no coordinates for a bird. */
interface BirdLocation {
  status: "LOST" | "ARRIVED" | "BASKETED" | "HELD";
  label: string;
  eventName?: string;
  raceName?: string;
  basketLabel?: string;
  phase?: "LOFT" | "RACE";
  since?: string;
}

interface SeasonImage {
  id: number;
  type: string;
  url: string;
  takenAt: string | null;
}
type SeasonImages = { ARRIVAL: SeasonImage[]; RACE: SeasonImage[]; FINAL: SeasonImage[] };

const SEX = (n: number | null) => (n === 1 ? "Cock" : n === 2 ? "Hen" : "Unknown");

function formatMs(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatGap(ms: number) {
  if (ms === 0) return "Leader";
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `+${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `+${m}:${String(s).padStart(2, "0")}`;
}

const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const LOCATION_TONE: Record<BirdLocation["status"], { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }> = {
  LOST: { icon: "alert-circle-outline", color: "#e11d48" },
  ARRIVED: { icon: "home-outline", color: "#16a34a" },
  BASKETED: { icon: "basket-outline", color: "#d97706" },
  HELD: { icon: "person-outline", color: "#189AB4" },
};

const ACTIVITY_LABEL: Record<HistoryEntry["type"], string> = {
  REGISTERED: "Registered",
  BASKETED: "Basketed",
  RELEASED: "Released",
  ARRIVED: "Arrived",
  FOREIGN_BIRD: "Foreign bird",
  LOST: "Lost",
};

/**
 * Pieces the bird page repeats, at module scope: components declared during
 * render are a new type each time and would be rebuilt on every render.
 */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 py-2 pr-3">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900">{value}</Text>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View className="w-1/2 p-1">
      <View className="items-center rounded-xl border border-gray-200 py-3">
        <Text className="text-[10px] uppercase text-gray-500">{label}</Text>
        <Text className="text-xl font-bold text-gray-900">{value}</Text>
        {unit ? <Text className="text-[10px] text-gray-500">{unit}</Text> : null}
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="mb-2 mr-2 flex-row items-center rounded-full border border-gray-300 bg-white px-3 py-2"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Ionicons name={icon} size={14} color="#189AB4" />
      <Text className="ml-1 text-xs font-medium text-gray-800">{label}</Text>
    </TouchableOpacity>
  );
}

function Relatives({
  title,
  list,
  router,
}: {
  title: string;
  list: Relative[];
  router: ReturnType<typeof useRouter>;
}) {
  if (list.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-gray-900">{title}</Text>
      <View className="overflow-hidden rounded-xl border border-gray-200">
        {list.map((r, index) => (
          <Pressable
            key={r.id}
            onPress={() =>
              router.push({ pathname: "/bird-detail", params: { birdId: String(r.id) } })
            }
            className={`flex-row items-center gap-3 px-4 py-3 ${
              index > 0 ? "border-t border-gray-100" : ""
            }`}
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900">
                {r.band ?? "No band"}
                {r.birdName ? ` · ${r.birdName}` : ""}
              </Text>
              {r.color ? <Text className="text-xs text-gray-500">{r.color}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const PAGE = 10;

function RaceTable({
  label,
  entries,
  router,
}: {
  label: string;
  entries: HistoryEntry[];
  router: ReturnType<typeof useRouter>;
}) {
  const [shown, setShown] = useState(PAGE);
  if (entries.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold uppercase text-gray-900">
        {label} <Text className="text-xs font-normal text-gray-500">({entries.length})</Text>
      </Text>
      <View className="overflow-hidden rounded-xl border border-gray-200">
        {entries.slice(0, shown).map((e, i) => (
          <Pressable
            key={`${e.raceId}-${e.date}-${i}`}
            disabled={!e.raceId}
            onPress={() =>
              router.push({ pathname: "/result-detail", params: { raceId: String(e.raceId) } })
            }
            className={`flex-row items-center px-3 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
          >
            <Text
              className="w-10 text-base font-bold"
              style={{
                color: e.position === 1 ? "#eab308" : e.position != null && e.position <= 3 ? "#189AB4" : "#111827",
              }}
            >
              {e.position != null ? `#${e.position}` : "—"}
            </Text>
            <View className="flex-1 pr-2">
              <Text className="text-sm font-medium text-gray-900">{e.raceName ?? "—"}</Text>
              <Text className="text-xs text-gray-500">{when(e.date)}</Text>
              <Text className="text-xs text-gray-500">
                {e.distance != null ? `${e.distance.toFixed(2)} mi` : "— mi"} ·{" "}
                {e.ypm != null ? `${e.ypm.toFixed(4)} YPM` : "— YPM"}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-gray-900">
                {e.flightTimeMs != null ? formatMs(e.flightTimeMs) : "—"}
              </Text>
              <Text
                className="text-xs font-medium"
                style={{ color: e.gapMs === 0 ? "#16a34a" : "#ef4444" }}
              >
                {e.gapMs != null ? formatGap(e.gapMs) : "—"}
              </Text>
              {e.prizeValue ? (
                <Text className="text-xs text-emerald-700">${e.prizeValue.toFixed(2)}</Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
      {shown < entries.length && (
        <TouchableOpacity className="items-center py-2" onPress={() => setShown((n) => n + PAGE)}>
          <Text className="text-xs font-semibold text-primary">
            Show more ({entries.length - shown} left)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * One bird: its photo, where it is, how it has flown, and its family.
 *
 * This is the portal's bird profile. The owner can edit it, change or remove
 * its photo and switch it between public and private; anyone who can see it
 * can share it. The race tables and stat tiles are worked out from the same
 * history feed the portal uses, split the same way into competition and
 * training.
 */
export default function BirdDetail() {
  const { birdId, id } = useLocalSearchParams<{ birdId?: string; id?: string }>();
  const { gutter } = useResponsive();
  const router = useRouter();
  const toast = useToast();

  const key = birdId ?? id;

  const [bird, setBird] = useState<Bird | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loftName, setLoftName] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [location, setLocation] = useState<BirdLocation | null>(null);

  const [busy, setBusy] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [seasonImages, setSeasonImages] = useState<SeasonImages | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!key) {
      setLoading(false);
      return;
    }
    setError(null);
    let owner = false;
    try {
      const { data } = await api.get(`/breeder/birds/${key}`);
      setBird(data?.bird ?? null);
      owner = Boolean(data?.isOwner);
      setIsOwner(owner);
    } catch (err: any) {
      setError(
        err?.response?.status === 403
          ? "This bird's owner keeps it private."
          : err?.response?.status === 404
            ? "That bird could not be found."
            : "Could not load this bird just now."
      );
      setBird(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoading(false);
    setRefreshing(false);

    // History is open to anyone who can see the bird; location is the owner's.
    api
      .get(`/birds/${key}/history`)
      .then(({ data }) => {
        setHistory(data?.entries ?? []);
        setLoftName(data?.birdInfo?.loftName ?? null);
      })
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));

    if (owner) {
      api
        .get(`/birds/${key}/location`)
        .then(({ data }) => setLocation(data ?? null))
        .catch(() => setLocation(null));
    } else {
      setLocation(null);
    }
  }, [key]);

  // On focus, so returning from the edit screen shows what was saved.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const arrived = useMemo(() => history.filter((e) => e.type === "ARRIVED"), [history]);
  const isTraining = (e: HistoryEntry) => !!e.raceTypeName?.toLowerCase().includes("training");
  const competition = useMemo(() => arrived.filter((e) => !isTraining(e)), [arrived]);
  const training = useMemo(() => arrived.filter(isTraining), [arrived]);

  const stats = useMemo(() => {
    const positions = arrived.map((e) => e.position).filter((p): p is number => p != null);
    const distances = arrived.map((e) => e.distance).filter((d): d is number => d != null);
    const ypms = arrived.map((e) => e.ypm).filter((y): y is number => y != null);
    const flights = arrived.map((e) => e.flightTimeMs).filter((f): f is number => f != null);
    return {
      bestRank: positions.length ? Math.min(...positions) : null,
      totalDist: distances.reduce((s, d) => s + d, 0),
      bestFlightMs: flights.length ? Math.min(...flights) : null,
      avgYpm: ypms.length ? ypms.reduce((s, y) => s + y, 0) / ypms.length : null,
    };
  }, [arrived]);

  /**
   * The seasons this bird has pictures filed under.
   *
   * The history feed is the only place a breeder's app learns season ids: for
   * race and basket entries its `eventId` field carries the season id (see the
   * history route — `race.seasonId` and `eventBasket.season.id`). REGISTERED
   * entries carry the event id instead, so they are left out.
   */
  const seasons = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of history) {
      if (e.eventId == null || e.type === "REGISTERED" || e.type === "LOST") continue;
      if (!map.has(e.eventId)) map.set(e.eventId, e.eventName ?? `Season ${e.eventId}`);
    }
    return Array.from(map, ([sid, name]) => ({ id: sid, name }));
  }, [history]);

  useEffect(() => {
    if (seasonId == null && seasons.length > 0) setSeasonId(seasons[0].id);
  }, [seasons, seasonId]);

  useEffect(() => {
    if (!isOwner || seasonId == null || !key) return;
    let alive = true;
    setSeasonLoading(true);
    api
      .get(`/breeder/birds/${key}/season-images`, { params: { seasonId } })
      .then(({ data }) => alive && setSeasonImages(data ?? null))
      .catch(() => alive && setSeasonImages(null))
      .finally(() => alive && setSeasonLoading(false));
    return () => {
      alive = false;
    };
  }, [isOwner, seasonId, key]);

  const togglePublic = async () => {
    if (!bird) return;
    setBusy(true);
    try {
      const next = bird.isPublic === 1 ? 0 : 1;
      await api.patch(`/breeder/birds/${bird.id}`, { isPublic: next });
      setBird({ ...bird, isPublic: next });
      toast.success(next === 1 ? "This bird is now public" : "This bird is now private");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Could not change that.");
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = () => {
    if (!bird) return;
    const run = async (from: "camera" | "library") => {
      try {
        const picked = await pickBirdPhoto(from);
        if (!picked) return;
        setBusy(true);
        const url = await uploadBirdPhoto(bird.id, picked);
        setBird((b) => (b ? { ...b, image: url ?? picked.uri } : b));
        toast.success("Photo updated");
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? err?.message ?? "Could not upload the photo.");
      } finally {
        setBusy(false);
      }
    };
    const remove = async () => {
      setBusy(true);
      try {
        await deleteBirdPhoto(bird.id);
        setBird((b) => (b ? { ...b, image: null } : b));
        toast.success("Photo removed");
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? "Could not remove the photo.");
      } finally {
        setBusy(false);
      }
    };
    Alert.alert("Bird photo", undefined, [
      { text: "Take photo", onPress: () => run("camera") },
      { text: "Choose from library", onPress: () => run("library") },
      ...(bird.image
        ? [{ text: "Remove photo", style: "destructive" as const, onPress: remove }]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const share = async () => {
    if (!bird) return;
    // The portal's own page for this bird: the API root minus its /api suffix.
    const site = (api.defaults.baseURL ?? "").replace(/\/api\/?$/, "");
    try {
      await Share.share({ message: `Check out this pigeon: ${site}/birds/${bird.id}` });
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Bird" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!bird) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Bird" />
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-center text-sm text-gray-500">
            {error ?? "That bird could not be found."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const owner = `${bird.breeder?.firstName ?? ""} ${bird.breeder?.lastName ?? ""}`.trim();
  const isPublic = bird.isPublic === 1;
  const children = [...(bird.childrenAsFather ?? []), ...(bird.childrenAsMother ?? [])];
  const tone = location ? LOCATION_TONE[location.status] : null;
  const imageGroups: { key: keyof SeasonImages; label: string }[] = [
    { key: "ARRIVAL", label: "Arrival" },
    { key: "RACE", label: "Race" },
    { key: "FINAL", label: "Final" },
  ];
  const seasonImageCount = seasonImages
    ? seasonImages.ARRIVAL.length + seasonImages.RACE.length + seasonImages.FINAL.length
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={bird.band ?? "Bird"} />

      <ScrollView
        style={{ paddingHorizontal: gutter }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View className="flex-row items-center gap-4 border-b border-gray-200 py-4">
          <Pressable
            onPress={() => (bird.image ? setViewing(bird.image) : isOwner ? changePhoto() : undefined)}
          >
            <Image
              source={bird.image ? { uri: bird.image } : require("../../assets/profile.png")}
              className="h-24 w-24 rounded-xl bg-gray-100"
            />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900">
              {bird.birdName || "Unnamed Bird"}
            </Text>
            <Text className="text-sm text-gray-500">{bird.band ?? "No band"}</Text>
            {loftName || owner ? (
              <Text className="text-xs text-gray-400">{loftName || owner}</Text>
            ) : null}
            <View className="mt-1 flex-row flex-wrap gap-1">
              {isPublic ? (
                <View className="rounded-full bg-green-100 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-green-700">PUBLIC</Text>
                </View>
              ) : isOwner ? (
                <View className="rounded-full bg-gray-100 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-gray-600">PRIVATE</Text>
                </View>
              ) : null}
              {bird.attention ? (
                <View className="rounded-full bg-amber-100 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-amber-700">ATTENTION</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View className="mt-3 flex-row flex-wrap">
          {isOwner && (
            <>
              <ActionButton
                icon="pencil"
                label="Edit"
                onPress={() =>
                  router.push({ pathname: "/bird-new", params: { birdId: String(bird.id) } })
                }
              />
              <ActionButton icon="camera-outline" label="Photo" onPress={changePhoto} disabled={busy} />
              <ActionButton
                icon={isPublic ? "eye-off-outline" : "globe-outline"}
                label={isPublic ? "Make private" : "Make public"}
                onPress={togglePublic}
                disabled={busy}
              />
            </>
          )}
          {(isOwner || isPublic) && (
            <ActionButton icon="share-social-outline" label="Share" onPress={share} />
          )}
          {busy ? <ActivityIndicator size="small" color="#189AB4" /> : null}
        </View>

        {bird.isLost === 1 && (
          <View className="mt-1 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <Text className="text-sm text-rose-800">This bird is recorded as lost.</Text>
          </View>
        )}

        {location && tone && (
          <View className="mt-3 flex-row items-center rounded-xl border border-gray-200 p-3">
            <Ionicons name={tone.icon} size={22} color={tone.color} />
            <View className="ml-3 flex-1">
              <Text className="text-xs text-gray-500">Where it is now</Text>
              <Text className="text-sm font-semibold text-gray-900">{location.label}</Text>
              <Text className="text-xs text-gray-500">
                {[
                  location.eventName,
                  location.phase ? `${location.phase.toLowerCase()} basket` : null,
                  location.since ? `since ${when(location.since)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </View>
        )}

        <View className="-mx-1 mt-3 flex-row flex-wrap">
          <Stat label="Best rank" value={stats.bestRank != null ? `#${stats.bestRank}` : "—"} />
          <Stat
            label="Total distance"
            value={stats.totalDist > 0 ? stats.totalDist.toFixed(1) : "—"}
            unit={stats.totalDist > 0 ? "mi" : undefined}
          />
          <Stat
            label="Best flight time"
            value={stats.bestFlightMs != null ? formatMs(stats.bestFlightMs) : "—"}
          />
          <Stat
            label="Avg speed"
            value={stats.avgYpm != null ? stats.avgYpm.toFixed(2) : "—"}
            unit={stats.avgYpm != null ? "YPM" : undefined}
          />
        </View>

        <View className="mt-2 flex-row flex-wrap">
          <Fact label="Colour" value={bird.color ?? "—"} />
          <Fact label="Sex" value={SEX(bird.sex)} />
          <Fact label="Tag" value={bird.rfid ?? "not tagged"} />
          <Fact label="Health" value={(bird.healthStatus ?? "healthy").toLowerCase()} />
        </View>

        {bird.note ? (
          <View className="mt-2 rounded-xl border border-gray-200 p-4">
            <Text className="text-xs text-gray-500">Note</Text>
            <Text className="mt-1 text-sm text-gray-700">{bird.note}</Text>
          </View>
        ) : null}

        {historyLoading ? (
          <ActivityIndicator className="mt-6" color="#189AB4" />
        ) : arrived.length === 0 ? (
          <View className="mt-4 rounded-xl border border-gray-200 p-6">
            <Text className="text-center text-sm text-gray-500">No race results yet.</Text>
          </View>
        ) : (
          <>
            <RaceTable label="Competition" entries={competition} router={router} />
            <RaceTable label="Training" entries={training} router={router} />
          </>
        )}

        {history.length > 0 && (
          <View className="mt-4">
            <TouchableOpacity
              className="flex-row items-center justify-between"
              onPress={() => setShowActivity((v) => !v)}
            >
              <Text className="text-sm font-semibold text-gray-900">
                Activity <Text className="text-xs font-normal text-gray-500">({history.length})</Text>
              </Text>
              <Ionicons name={showActivity ? "chevron-up" : "chevron-down"} size={16} color="#6b7280" />
            </TouchableOpacity>
            {showActivity && (
              <View className="mt-2 overflow-hidden rounded-xl border border-gray-200">
                {history.map((e, i) => (
                  <View
                    key={`${e.type}-${e.date}-${i}`}
                    className={`px-3 py-2 ${i > 0 ? "border-t border-gray-100" : ""}`}
                  >
                    <Text className="text-sm font-medium text-gray-900">
                      {ACTIVITY_LABEL[e.type] ?? e.type}
                      {e.type === "ARRIVED" && e.position != null ? ` · #${e.position}` : ""}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {[e.raceName, e.basketLabel, e.eventName, when(e.date)]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {isOwner && seasons.length > 0 && (
          <View className="mt-4">
            <Text className="mb-2 text-sm font-semibold text-gray-900">Season photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {seasons.map((s) => {
                const on = s.id === seasonId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setSeasonId(s.id)}
                    className={`mr-2 rounded-full border px-3 py-1.5 ${
                      on ? "bg-primary border-primary" : "bg-white border-gray-300"
                    }`}
                  >
                    <Text className={on ? "text-white text-xs font-semibold" : "text-gray-700 text-xs"}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {seasonLoading ? (
              <ActivityIndicator className="mt-3" color="#189AB4" />
            ) : seasonImageCount === 0 ? (
              <Text className="mt-3 text-xs text-gray-500">
                The organiser has not filed any photos of this bird for that season.
              </Text>
            ) : (
              imageGroups.map((g) =>
                seasonImages && seasonImages[g.key].length > 0 ? (
                  <View key={g.key} className="mt-3">
                    <Text className="mb-1 text-xs uppercase text-gray-500">{g.label}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {seasonImages[g.key].map((img) => (
                        <Pressable key={img.id} onPress={() => setViewing(img.url)} className="mr-2">
                          <Image source={{ uri: img.url }} className="h-24 w-24 rounded-lg bg-gray-100" />
                          {img.takenAt ? (
                            <Text className="mt-0.5 text-[10px] text-gray-500">
                              {new Date(img.takenAt).toLocaleDateString()}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null
              )
            )}
          </View>
        )}

        <Relatives
          router={router}
          title="Parents"
          list={[bird.father, bird.mother].filter(Boolean) as Relative[]}
        />
        <Relatives router={router} title="Siblings" list={bird.siblings ?? []} />
        <Relatives router={router} title="Offspring" list={children} />

        <View style={{ height: 40 }} />
      </ScrollView>

      <RNModal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          onPress={() => setViewing(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}
        >
          {viewing ? (
            <Image source={{ uri: viewing }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />
          ) : null}
        </Pressable>
      </RNModal>
    </SafeAreaView>
  );
}
