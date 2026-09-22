import Header from "@/components/header";
import api from "@/service/api.service";
import SecureStorageService from "@/service/secureStorage.service";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";
import { format } from "date-fns";
import * as Location from "expo-location";
import { useLocalSearchParams } from "expo-router";
import * as TaskManager from "expo-task-manager";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ------------------------------------------------------------------ *
 * Constants / storage keys
 * ------------------------------------------------------------------ */
const TASK_NAME = "liberation-location-task";
// Active raceId persisted so the background task knows where to POST.
const ACTIVE_RACE_KEY = "pigeon_plus_liberation_active_race";
// Offline buffer of unsent pings.
const PING_QUEUE_KEY = "pigeon_plus_liberation_ping_queue";
// Counter of successfully-sent pings (for UI).
const SENT_COUNT_KEY = "pigeon_plus_liberation_sent_count";
// Timestamp of last fix processed (for UI).
const LAST_FIX_KEY = "pigeon_plus_liberation_last_fix";

interface QueuedPing {
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  recordedAt: string;
}

/* ------------------------------------------------------------------ *
 * Resolve the API base URL the SAME way api.service.ts does. The
 * background task runs outside React, so axios defaults/interceptors
 * set elsewhere are not guaranteed; we build a standalone client.
 * ------------------------------------------------------------------ */
const PRODUCTION_API_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://pigeon-pulse.vercel.app/api";
const inProduction = process.env.EXPO_PUBLIC_NODE_ENV === "production";

const resolveApiUrl = (): string => {
  if (inProduction) return PRODUCTION_API_URL;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const localIp = hostUri.split(":")[0];
    return `http://${localIp}:3000/api`;
  }
  return "http://localhost:3000/api";
};

/* ------------------------------------------------------------------ *
 * Queue helpers (AsyncStorage-backed, safe for background context)
 * ------------------------------------------------------------------ */
const readQueue = async (): Promise<QueuedPing[]> => {
  try {
    const raw = await AsyncStorage.getItem(PING_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedPing[]) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (pings: QueuedPing[]) => {
  try {
    await AsyncStorage.setItem(PING_QUEUE_KEY, JSON.stringify(pings));
  } catch {
    // ignore
  }
};

const bumpSentCount = async (n: number) => {
  try {
    const raw = await AsyncStorage.getItem(SENT_COUNT_KEY);
    const prev = raw ? parseInt(raw, 10) || 0 : 0;
    await AsyncStorage.setItem(SENT_COUNT_KEY, String(prev + n));
  } catch {
    // ignore
  }
};

/**
 * Flush the queued pings to the backend in a single batch. Reads the
 * auth token directly from the SAME secure storage api.service uses
 * (key: pigeon_plus_access_token via SecureStorageService) and attaches
 * the Bearer header manually, because this runs outside React / outside
 * the axios instance whose interceptor adds the token.
 *
 * On any failure (network / auth) the queue is kept intact so it is
 * retried on the next location update (offline resilience).
 */
const flushQueue = async (raceId: string): Promise<void> => {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const token = await SecureStorageService.getAccessToken();
  if (!token) return; // can't auth — keep queue for later

  try {
    const baseURL = resolveApiUrl();
    await axios.post(
      `${baseURL}/admin/race/${raceId}/ping`,
      { pings: queue },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    // Success: remove exactly what we sent. Anything appended meanwhile
    // (a new fix racing with this flush) is preserved.
    const current = await readQueue();
    const remaining = current.slice(queue.length);
    await writeQueue(remaining);
    await bumpSentCount(queue.length);
  } catch {
    // Keep queue intact; will retry on next fix / next flush.
  }
};

/* ------------------------------------------------------------------ *
 * Background task definition — MUST be at module top-level so it is
 * registered when the JS bundle loads (incl. background relaunches).
 * ------------------------------------------------------------------ */
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn("Liberation task error:", error.message);
    return;
  }
  const raceId = await AsyncStorage.getItem(ACTIVE_RACE_KEY);
  if (!raceId) return; // not tracking — ignore stray updates

  const locations: Location.LocationObject[] =
    (data as any)?.locations ?? [];
  if (locations.length === 0) {
    // Still attempt to flush any backlog.
    await flushQueue(raceId);
    return;
  }

  const newPings: QueuedPing[] = locations.map((loc) => ({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speed: loc.coords.speed ?? null,
    heading: loc.coords.heading ?? null,
    accuracy: loc.coords.accuracy ?? null,
    recordedAt: new Date(loc.timestamp).toISOString(),
  }));

  const queue = await readQueue();
  await writeQueue([...queue, ...newPings]);

  // Record last fix time for UI.
  const last = locations[locations.length - 1];
  await AsyncStorage.setItem(
    LAST_FIX_KEY,
    new Date(last.timestamp).toISOString()
  );

  await flushQueue(raceId);
});

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */
const Liberation = () => {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ raceId?: string }>();

  const [raceIdInput, setRaceIdInput] = useState(params.raceId ?? "");
  const [activeRaceId, setActiveRaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [queued, setQueued] = useState(0);
  const [lastFix, setLastFix] = useState<string | null>(null);

  const role = user?.role?.toUpperCase();
  const isAdmin = role === "ADMIN" || role === "SUPERADMIN";

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refresh UI stats from storage (the background task updates storage).
  const refreshStats = useCallback(async () => {
    try {
      const [active, sentRaw, q, fix] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_RACE_KEY),
        AsyncStorage.getItem(SENT_COUNT_KEY),
        readQueue(),
        AsyncStorage.getItem(LAST_FIX_KEY),
      ]);
      setActiveRaceId(active);
      setSentCount(sentRaw ? parseInt(sentRaw, 10) || 0 : 0);
      setQueued(q.length);
      setLastFix(fix);
    } catch {
      // ignore
    }
  }, []);

  // On mount: sync with any tracking already in progress, start polling
  // UI stats, and re-poll when app returns to foreground.
  useEffect(() => {
    refreshStats();
    pollRef.current = setInterval(refreshStats, 5000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refreshStats();
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      sub.remove();
    };
  }, [refreshStats]);

  const start = useCallback(async () => {
    const raceId = (params.raceId ?? raceIdInput).trim();
    if (!raceId) {
      Alert.alert("Race required", "Enter a race ID to broadcast.");
      return;
    }
    setBusy(true);
    try {
      // 1. Permissions — foreground then background.
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Location permission is required to broadcast the truck position."
        );
        return;
      }
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== "granted") {
        Alert.alert(
          "Background permission needed",
          "Allow location 'Always' so tracking continues while the screen is off."
        );
        return;
      }

      // 2. Tell backend transit has started.
      await api.post(`/admin/race/${raceId}/transport/start`);

      // 3. Reset counters + persist active race for the background task.
      await AsyncStorage.multiSet([
        [ACTIVE_RACE_KEY, raceId],
        [SENT_COUNT_KEY, "0"],
        [PING_QUEUE_KEY, "[]"],
      ]);
      await AsyncStorage.removeItem(LAST_FIX_KEY);

      // 4. Start background location updates.
      const already = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
      if (already) {
        await Location.stopLocationUpdatesAsync(TASK_NAME);
      }
      await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 15000,
        distanceInterval: 50,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: "Liberation tracking",
          notificationBody: "Broadcasting truck location",
        },
      });

      await refreshStats();
    } catch (e: any) {
      // Roll back active flag if backend/start failed.
      await AsyncStorage.removeItem(ACTIVE_RACE_KEY);
      Alert.alert(
        "Could not start",
        e?.response?.data?.message || e?.message || "Failed to start tracking."
      );
    } finally {
      setBusy(false);
    }
  }, [params.raceId, raceIdInput, refreshStats]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      const raceId = activeRaceId;

      const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
      if (started) {
        await Location.stopLocationUpdatesAsync(TASK_NAME);
      }

      if (raceId) {
        // Final flush of anything still queued.
        await flushQueue(raceId);
        try {
          await api.post(`/admin/race/${raceId}/transport/stop`);
        } catch {
          // best-effort
        }
      }

      await AsyncStorage.removeItem(ACTIVE_RACE_KEY);
      await refreshStats();
    } catch (e: any) {
      Alert.alert(
        "Could not stop cleanly",
        e?.message || "Tracking stopped but cleanup had an issue."
      );
    } finally {
      setBusy(false);
    }
  }, [activeRaceId, refreshStats]);

  /* ---------------------------------------------------------------- */
  if (!isAdmin) {
    return (
      <SafeAreaView className="flex-1 bg-[#f5f5f5]">
        <Header title="Liberation" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-red-500 text-center text-base font-semibold">
            Not authorized — admins only
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const broadcasting = !!activeRaceId;

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Liberation" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Status card */}
        <View
          className="bg-white rounded-lg p-4 mb-4"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          <View className="flex-row items-center gap-2 mb-3">
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: broadcasting ? "#16a34a" : "#9ca3af",
              }}
            />
            <Text className="text-lg font-bold">
              {broadcasting ? "Broadcasting" : "Idle"}
            </Text>
          </View>

          {broadcasting && (
            <Text className="text-gray-600 text-sm mb-3">
              Race ID: <Text className="font-semibold">{activeRaceId}</Text>
            </Text>
          )}

          <View className="flex-row gap-2">
            <View className="flex-1 border border-gray-200 rounded-lg p-3 items-center">
              <Text className="text-2xl font-bold">{sentCount}</Text>
              <Text className="text-gray-500 text-xs mt-1">Points sent</Text>
            </View>
            <View className="flex-1 border border-gray-200 rounded-lg p-3 items-center">
              <Text className="text-2xl font-bold">{queued}</Text>
              <Text className="text-gray-500 text-xs mt-1">Queued</Text>
            </View>
          </View>

          <Text className="text-gray-500 text-xs mt-3 text-center">
            Last fix:{" "}
            {lastFix ? format(new Date(lastFix), "hh:mm:ss a") : "—"}
          </Text>
        </View>

        {/* Race selector (only when idle and no param raceId) */}
        {!broadcasting && (
          <View
            className="bg-white rounded-lg p-4 mb-4"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <Text className="text-sm font-semibold mb-2">Race ID</Text>
            <TextInput
              value={raceIdInput}
              onChangeText={setRaceIdInput}
              editable={!params.raceId}
              keyboardType="number-pad"
              placeholder="Enter race ID"
              className="border border-gray-300 rounded-lg px-3 py-2 text-base"
            />
            {!!params.raceId && (
              <Text className="text-gray-400 text-xs mt-1">
                Provided by link
              </Text>
            )}
          </View>
        )}

        {/* Actions */}
        {broadcasting ? (
          <TouchableOpacity
            disabled={busy}
            onPress={stop}
            className="bg-red-500 rounded-lg py-4 items-center"
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-base">
                Stop Broadcasting
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            disabled={busy}
            onPress={start}
            className="bg-primary rounded-lg py-4 items-center"
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-base">
                Start Broadcasting
              </Text>
            )}
          </TouchableOpacity>
        )}

        <Text className="text-gray-400 text-xs mt-4 text-center px-4">
          Tracking continues in the background while broadcasting. Keep the app
          installed and location set to &quot;Always&quot;.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Liberation;
