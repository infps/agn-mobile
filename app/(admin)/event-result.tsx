import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { downloadAndShare } from "@/service/download.service";
import { itemStatus, Pills, shortBand } from "@/components/admin/raceParts";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
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
  Sheet,
  Truncated,
  money,
} from "@/components/admin/ui";

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
  location: string | null;
  distance: number | null;
  raceType?: { name?: string | null } | null;
}

interface ResultRow {
  id: number;
  status: string;
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

/** The portal's own test for a training toss: a race type called T or Training. */
const isTraining = (r: Race) => {
  const n = (r.raceType?.name ?? "").toUpperCase();
  return n === "T" || n === "TRAINING";
};

const FORMATS: Choice[] = [
  { key: "pdf", label: "PDF", hint: "For printing and handing round" },
  { key: "xlsx", label: "Spreadsheet", hint: "Opens in Excel or Sheets" },
  { key: "csv", label: "CSV", hint: "Plain text, for importing elsewhere" },
];

/**
 * Finishing order and prize money, one race at a time.
 *
 * Results only mean anything per race, so the race picker comes first and the
 * screen is empty until one is chosen — a merged list across an event would be
 * a table nobody asked for. Birds with no position sort last rather than being
 * hidden, because "did not clock" is a result somebody is looking for.
 *
 * Races and training tosses are kept apart, as the portal's Result tab keeps
 * them: a training toss carries no prize, and nobody looking for the final
 * wants to scroll past eight of them to reach it.
 */
export default function EventResult() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const router = useRouter();
  const { canAny } = usePermissions();
  const toast = useToast();

  const [kind, setKind] = useState<"races" | "training">("races");
  const [raceId, setRaceId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const racesReq = useAdminData<{ races?: Race[] }>(
    eventId ? `/admin/race?eventId=${eventId}` : null,
    [eventId]
  );
  const everyRace = useMemo(() => racesReq.data?.races ?? [], [racesReq.data]);
  const trainingCount = useMemo(() => everyRace.filter(isTraining).length, [everyRace]);
  const races = useMemo(() => {
    const all = everyRace.filter((r) => isTraining(r) === (kind === "training"));
    // Finished races first — those are the ones with results to read.
    return [...all].sort(
      (a, b) =>
        (a.status === "ENDED" ? 0 : 1) - (b.status === "ENDED" ? 0 : 1) ||
        (b.raceNumber ?? 0) - (a.raceNumber ?? 0)
    );
  }, [everyRace, kind]);

  // Whichever list is showing, something in it is selected — switching between
  // races and training must not leave the other list's race on screen.
  useEffect(() => {
    if (races.length === 0) {
      if (raceId != null) setRaceId(null);
    } else if (!races.some((r) => r.id === raceId)) {
      setRaceId(races[0].id);
    }
  }, [races, raceId]);

  useEffect(() => {
    if (raceId == null) {
      setRows([]);
      return;
    }
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

  if (!canAny("races.view", "races.manage") || racesReq.forbidden) {
    return <NoAccess what="Results" />;
  }

  const clocked = rows.filter((r) => r.birdPosition != null).length;
  const paid = rows.reduce((s, r) => s + (r.prizeValue ?? 0), 0);
  const race = races.find((r) => r.id === raceId);

  const runExport = async (format: string | number) => {
    if (raceId == null) return;
    setExporting(true);
    const result = await downloadAndShare(
      `/breeder/export/results?format=${format}&raceId=${raceId}${
        eventId ? `&eventId=${eventId}` : ""
      }`,
      `race-${raceId}-results.${format}`
    );
    setExporting(false);
    if (result.ok) setExportOpen(false);
    else if (result.problem) toast.error(result.problem);
  };

  return (
    <Screen
      title="Result"
      subtitle={name ?? undefined}
      onRefresh={racesReq.refresh}
      refreshing={racesReq.refreshing}
      header={
        everyRace.length > 0 ? (
          <>
            <View className="mb-2">
              <Pills
                pills={[
                  { key: "races", label: "Races", lead: everyRace.length - trainingCount },
                  { key: "training", label: "Training", lead: trainingCount },
                ]}
                isOn={(k) => k === kind}
                onPress={(k) => setKind(k as "races" | "training")}
              />
            </View>
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
          <Empty>
            {everyRace.length === 0
              ? "This event has no races, so there is nothing to score."
              : "No races in this category."}
          </Empty>
        </View>
      ) : (
        <>
          {racesReq.error ? <Notice>{racesReq.error}</Notice> : null}

          {race ? (
            <Text className="mt-3 text-xs text-slate-500">
              {[
                race.raceType?.name,
                race.status === "STARTED" ? "LIVE" : race.status.toLowerCase(),
                race.startTime ? new Date(race.startTime).toLocaleString() : null,
                race.location,
                race.distance != null ? `${race.distance} mi` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}

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
                      title={`${shortBand(r.bird?.band) || "No band"}${
                        r.bird?.birdName ? ` · ${r.bird.birdName}` : ""
                      }`}
                      subtitle={`${who}${
                        r.birdPositionHotSpot != null ? ` · hotspot ${r.birdPositionHotSpot}` : ""
                      }`}
                      // A bird with a time has said what it is; one without
                      // needs its status to explain why.
                      badge={r.arrivalTime ? null : itemStatus(r.status)}
                      right={r.arrivalTime ? new Date(r.arrivalTime).toLocaleTimeString() : null}
                      rightSub={
                        r.prizeValue != null && r.prizeValue > 0
                          ? `${money(r.prizeValue)}${
                              r.birdDrop != null ? ` · drop ${r.birdDrop}` : ""
                            }`
                          : undefined
                      }
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated
              shown={Math.min(results.length, 200)}
              total={results.length}
              where="a narrower search"
            />
          </View>

          {raceId != null && (
            <>
              <Pressable
                onPress={() => router.push(`/(admin)/race-detail?raceId=${raceId}` as never)}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3"
              >
                <Ionicons name="settings-outline" size={16} color="#334155" />
                <Text className="text-sm font-medium text-slate-700">Open race controls</Text>
              </Pressable>
              <ButtonRow>
                <Button
                  label="Export results"
                  tone="secondary"
                  icon="download-outline"
                  onPress={() => setExportOpen(true)}
                  full
                />
                <Button
                  label="Averages"
                  tone="secondary"
                  icon="stats-chart-outline"
                  onPress={() =>
                    router.push(
                      `/(admin)/event-averages?eventId=${eventId}&name=${encodeURIComponent(
                        String(name ?? "")
                      )}` as never
                    )
                  }
                  full
                />
              </ButtonRow>
            </>
          )}
        </>
      )}

      <Sheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export results"
        subtitle="The whole race, every breeder — handed to the share sheet"
      >
        {exporting ? <Loading /> : <ChoiceList choices={FORMATS} onPick={runExport} />}
      </Sheet>
    </Screen>
  );
}
