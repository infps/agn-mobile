import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  Truncated,
} from "@/components/admin/ui";

interface Config {
  id: number;
  name: string | null;
  isPublic: boolean | null;
  filterMode: string | null;
  selectedRaceTypes?: { raceType?: { id: number; name: string | null } | null }[];
  selectedRaces?: { race?: { id: number; name: string | null } | null }[];
}

interface ResultRow {
  position?: number | null;
  rank?: number | null;
  band?: string | null;
  birdBand?: string | null;
  breederName?: string | null;
  loft?: string | null;
  total?: number | null;
  score?: number | null;
  racesCounted?: number | null;
}

/**
 * Standings across several races rather than one.
 *
 * An average is a saved definition — which races count, and how — so the
 * definition is picked first and its table follows. The portal lets you build
 * new ones; this reads the ones already built, because choosing which races
 * count is a decision made once, carefully, not between baskets.
 */
export default function EventAverages() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();

  const [configId, setConfigId] = useState<number | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // This endpoint answers with a bare array rather than an object.
  const configsReq = useAdminData<Config[]>(
    eventId ? `/admin/event/${eventId}/averages` : null,
    [eventId]
  );
  const configs = Array.isArray(configsReq.data) ? configsReq.data : [];

  useEffect(() => {
    if (configId == null && configs.length > 0) setConfigId(configs[0].id);
  }, [configs, configId]);

  useEffect(() => {
    if (configId == null || !eventId) return;
    let cancelled = false;
    setLoadingRows(true);
    setRowError(null);
    api
      .get(`/admin/event/${eventId}/averages/${configId}/results`)
      .then(({ data }) => {
        if (!cancelled) setRows(data?.results ?? []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setRows([]);
        setRowError(err?.response?.data?.message ?? "Could not work out this average.");
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configId, eventId]);

  if (configsReq.forbidden) return <NoAccess what="Averages" />;

  const active = configs.find((c) => c.id === configId) ?? null;
  const counted =
    (active?.selectedRaces?.length ?? 0) > 0
      ? `${active?.selectedRaces?.length} races`
      : (active?.selectedRaceTypes?.length ?? 0) > 0
        ? (active?.selectedRaceTypes ?? []).map((t) => t.raceType?.name).filter(Boolean).join(", ")
        : null;

  return (
    <Screen
      title="Averages"
      subtitle={name ?? undefined}
      onRefresh={configsReq.refresh}
      refreshing={configsReq.refreshing}
      header={
        configs.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {configs.map((c) => {
              const isActive = c.id === configId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setConfigId(c.id)}
                  className={`rounded-full border px-3.5 py-2 ${
                    isActive ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${isActive ? "text-white" : "text-slate-600"}`}
                  >
                    {c.name ?? `Average ${c.id}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : undefined
      }
    >
      {configsReq.loading ? (
        <Loading />
      ) : configs.length === 0 ? (
        <View className="mt-4">
          <Empty>No averages have been set up for this season.</Empty>
        </View>
      ) : (
        <>
          {configsReq.error ? <Notice>{configsReq.error}</Notice> : null}

          {counted ? (
            <Text className="mt-3 text-xs text-slate-500">
              Counting {counted}
              {active?.isPublic ? " · visible to breeders" : " · staff only"}
            </Text>
          ) : null}

          <View className="mt-4">
            {loadingRows ? (
              <Loading />
            ) : rowError ? (
              <Notice>{rowError}</Notice>
            ) : rows.length === 0 ? (
              <Empty>Nothing has scored in this average yet.</Empty>
            ) : (
              <Rows>
                {rows.slice(0, 200).map((r, index) => {
                  const position = r.position ?? r.rank ?? index + 1;
                  const score = r.total ?? r.score;
                  return (
                    <Row
                      key={`${r.band ?? r.birdBand ?? index}-${index}`}
                      leading={
                        <View className="w-8 items-center">
                          <Text className="text-sm font-semibold text-slate-900">{position}</Text>
                        </View>
                      }
                      title={r.band ?? r.birdBand ?? "No band"}
                      subtitle={[r.breederName, r.loft].filter(Boolean).join(" · ") || undefined}
                      right={score != null ? String(Math.round(score * 100) / 100) : "—"}
                      rightSub={r.racesCounted != null ? `${r.racesCounted} races` : undefined}
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated shown={Math.min(rows.length, 200)} total={rows.length} />
          </View>
        </>
      )}
    </Screen>
  );
}
