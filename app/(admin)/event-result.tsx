import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Empty,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  Truncated,
  money,
} from "@/components/admin/ui";

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
}

interface ResultRow {
  id: number;
  birdPosition: number | null;
  birdPositionHotSpot: number | null;
  prizeValue: number | null;
  arrivalTime: string | null;
  birdDrop: number | null;
  bird?: {
    band: string | null;
    birdName: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  };
  eventInventoryItem?: { eventInventory?: { loft: string | null } | null };
}

/**
 * Finishing order and prize money, one race at a time.
 *
 * Results only mean anything per race, so the race picker comes first and the
 * screen is empty until one is chosen — a merged list across an event would be
 * a table nobody asked for. Birds with no position sort last rather than being
 * hidden, because "did not clock" is a result somebody is looking for.
 */
export default function EventResult() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const router = useRouter();

  const [raceId, setRaceId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  const racesReq = useAdminData<{ races?: Race[] }>(
    eventId ? `/admin/race?eventId=${eventId}` : null,
    [eventId]
  );
  const races = useMemo(() => {
    const all = racesReq.data?.races ?? [];
    // Finished races first — those are the ones with results to read.
    return [...all].sort(
      (a, b) =>
        (a.status === "ENDED" ? 0 : 1) - (b.status === "ENDED" ? 0 : 1) ||
        (b.raceNumber ?? 0) - (a.raceNumber ?? 0)
    );
  }, [racesReq.data]);

  useEffect(() => {
    if (raceId == null && races.length > 0) setRaceId(races[0].id);
  }, [races, raceId]);

  useEffect(() => {
    if (raceId == null) return;
    let cancelled = false;
    setLoadingRows(true);
    api
      .get(`/admin/race-item?raceId=${raceId}`)
      .then(({ data }) => {
        if (!cancelled) setRows(data?.raceItems ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => {
          const who = `${r.bird?.breeder?.firstName ?? ""} ${
            r.bird?.breeder?.lastName ?? ""
          }`.toLowerCase();
          return (
            (r.bird?.band ?? "").toLowerCase().includes(q) ||
            (r.bird?.birdName ?? "").toLowerCase().includes(q) ||
            who.includes(q)
          );
        })
      : rows;
    return [...filtered].sort((a, b) => {
      if (a.birdPosition == null && b.birdPosition == null) return 0;
      if (a.birdPosition == null) return 1;
      if (b.birdPosition == null) return -1;
      return a.birdPosition - b.birdPosition;
    });
  }, [rows, query]);

  if (racesReq.forbidden) return <NoAccess what="Results" />;

  const clocked = rows.filter((r) => r.birdPosition != null).length;
  const paid = rows.reduce((s, r) => s + (r.prizeValue ?? 0), 0);
  const race = races.find((r) => r.id === raceId);

  return (
    <Screen
      title="Result"
      subtitle={name ?? undefined}
      onRefresh={racesReq.refresh}
      refreshing={racesReq.refreshing}
      header={
        races.length > 0 ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
              {races.map((r) => {
                const active = r.id === raceId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setRaceId(r.id)}
                    className={`rounded-full border px-3.5 py-2 ${
                      active ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${active ? "text-white" : "text-slate-600"}`}
                    >
                      {r.name || `Race ${r.raceNumber ?? r.id}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="mt-2">
              <SearchBar value={query} onChange={setQuery} placeholder="Band, bird or breeder" />
            </View>
          </>
        ) : undefined
      }
    >
      {racesReq.loading ? (
        <Loading />
      ) : races.length === 0 ? (
        <View className="mt-4">
          <Empty>This event has no races, so there is nothing to score.</Empty>
        </View>
      ) : (
        <>
          {racesReq.error ? <Notice>{racesReq.error}</Notice> : null}

          <FigureRow>
            <Figure label="Birds entered" value={rows.length} basis="31%" />
            <Figure label="Clocked" value={clocked} tone="text-emerald-600" basis="31%" />
            <Figure label="Prize money" value={money(paid)} tone="text-blue-600" basis="31%" />
          </FigureRow>

          {race && race.status !== "ENDED" && (
            <Notice>
              This race has not ended, so positions and prizes can still change.
            </Notice>
          )}

          <View className="mt-4">
            {loadingRows ? (
              <Loading />
            ) : results.length === 0 ? (
              <Empty>
                {rows.length === 0 ? "No birds in this race." : "No bird matches that search."}
              </Empty>
            ) : (
              <Rows>
                {results.slice(0, 200).map((r) => {
                  const who =
                    `${r.bird?.breeder?.firstName ?? ""} ${
                      r.bird?.breeder?.lastName ?? ""
                    }`.trim() || r.eventInventoryItem?.eventInventory?.loft || "Unassigned";
                  return (
                    <Row
                      key={r.id}
                      leading={
                        <View className="w-8 items-center">
                          <Text className="text-sm font-semibold text-slate-900">
                            {r.birdPosition ?? "—"}
                          </Text>
                        </View>
                      }
                      title={`${r.bird?.band ?? "No band"}${
                        r.bird?.birdName ? ` · ${r.bird.birdName}` : ""
                      }`}
                      subtitle={`${who}${
                        r.birdPositionHotSpot != null ? ` · hotspot ${r.birdPositionHotSpot}` : ""
                      }`}
                      right={
                        r.arrivalTime ? new Date(r.arrivalTime).toLocaleTimeString() : "no clock"
                      }
                      rightSub={
                        r.prizeValue != null && r.prizeValue > 0 ? money(r.prizeValue) : undefined
                      }
                      rightTone={r.arrivalTime ? "text-slate-600" : "text-slate-400"}
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated shown={Math.min(results.length, 200)} total={results.length} />
          </View>

          {raceId != null && (
            <Pressable
              onPress={() => router.push(`/(admin)/race-detail?raceId=${raceId}` as never)}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3"
            >
              <Ionicons name="settings-outline" size={16} color="#334155" />
              <Text className="text-sm font-medium text-slate-700">Open race controls</Text>
            </Pressable>
          )}
        </>
      )}
    </Screen>
  );
}
