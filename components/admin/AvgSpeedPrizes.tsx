import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { seasonRacesUrl, useChosenSeason } from "@/service/season.service";
import { CheckRow, Label } from "@/components/admin/raceParts";
import { Confirm } from "@/components/admin/actions";
import { Button, ButtonRow, Empty, Loading, Notice, Row, Rows, Sheet, money } from "@/components/admin/ui";

interface RaceOption {
  id: number;
  seasonId?: number | null;
  raceNumber: number | null;
  distance: number | null;
  raceTypeId: number | null;
  raceType?: { name: string | null } | null;
}

interface Ranked {
  inventoryItemId: number;
  birdId: number | null;
  position: number;
  raceCount: number;
  totalDistance: number;
  totalFlightMs: number;
  yardsPerMin: number | null;
  prize: number | null;
  band: string;
  breederName: string;
  loft: string | null;
}

/** HayLoft's usual choice: the hot spot races. */
const HOT_SPOT_TYPES = new Set([6, 7, 8]);

const hms = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * HayLoft's average-speed winners, as the portal's Averages tab card: pick
 * races, rank the birds by races flown then average speed (daylight flight
 * time only), and set each rank's prize from the season's average prize
 * scheme. The prizes go to the breeders' accounts. The server runs the same
 * procedures as HayLoft (portal lib/hayloft-avg-speed); nothing is worked out
 * here.
 */
export function AvgSpeedPrizesSheet({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const season = useChosenSeason(eventId);
  const racesReq = useAdminData<{ races?: RaceOption[] }>(open ? seasonRacesUrl(eventId, season) : null, [
    open,
    eventId,
    season?.id,
  ]);
  const races = useMemo(() => (racesReq.data?.races ?? []).filter((r) => (r.distance ?? 0) > 0), [racesReq.data]);
  const seasonId = season?.id ?? races[0]?.seasonId ?? null;

  // The picks belong to one race list; a new list (another season) starts
  // again from HayLoft's usual choice, the hot spot races.
  const racesKey = races.map((r) => r.id).join(",");
  const [picked, setPicked] = useState<{ key: string; ids: Set<number> } | null>(null);
  const chosen = useMemo(
    () =>
      picked && picked.key === racesKey
        ? picked.ids
        : new Set(races.filter((r) => HOT_SPOT_TYPES.has(r.raceTypeId ?? -1)).map((r) => r.id)),
    [picked, racesKey, races]
  );
  const [onlyHotSpotPaid, setOnlyHotSpotPaid] = useState(true);
  const [ranked, setRanked] = useState<{ key: string; rows: Ranked[] } | null>(null);
  const rows = ranked && ranked.key === racesKey ? ranked.rows : null;
  const setRows = (next: Ranked[] | null) => setRanked(next ? { key: racesKey, rows: next } : null);
  const [confirming, setConfirming] = useState(false);
  const [ranking, setRanking] = useState(false);

  const toggle = (id: number) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked({ key: racesKey, ids: next });
    setRows(null);
  };

  const rank = async () => {
    if (seasonId == null) return;
    const q = `seasonId=${seasonId}&raceIds=${[...chosen].join(",")}&onlyHotSpotPaid=${onlyHotSpotPaid ? 1 : 0}`;
    setRanking(true);
    try {
      const res = await api.get(`/admin/event/${eventId}/avg-speed-prizes?${q}`);
      setRows(res.data?.rows ?? []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not rank the birds");
    } finally {
      setRanking(false);
    }
  };

  const save = async () => {
    if (seasonId == null) return;
    const { ok, data } = await action.run<{ message?: string }>("post", `/admin/event/${eventId}/avg-speed-prizes`, {
      seasonId,
      raceIds: [...chosen],
      onlyHotSpotPaid,
    });
    setConfirming(false);
    if (ok) toast.success(data?.message ?? "Average-speed prizes set.");
  };

  const prizeTotal = (rows ?? []).reduce((s, r) => s + (r.prize ?? 0), 0);

  return (
    <Sheet open={open} onClose={onClose} title="Average-speed prizes" subtitle="As HayLoft ranks and pays them">
      {racesReq.loading ? (
        <Loading />
      ) : races.length === 0 ? (
        <Empty>No races with a distance in this season.</Empty>
      ) : (
        <>
          <Label>Races</Label>
          {races.map((r) => (
            <CheckRow
              key={r.id}
              on={chosen.has(r.id)}
              label={`${r.raceType?.name ?? "Race"} ${r.raceNumber ?? ""}`.trim()}
              hint={`${r.distance} mi`}
              onPress={() => toggle(r.id)}
            />
          ))}
          <CheckRow
            on={onlyHotSpotPaid}
            label="Only birds with a hot spot fee"
            onPress={() => {
              setOnlyHotSpotPaid(!onlyHotSpotPaid);
              setRows(null);
            }}
          />
          <ButtonRow>
            <Button
              label="Rank birds"
              tone="secondary"
              onPress={rank}
              pending={ranking}
              disabled={chosen.size === 0 || seasonId == null}
              full
            />
            <Button
              label="Set prizes"
              onPress={() => setConfirming(true)}
              disabled={!rows || rows.length === 0}
              full
            />
          </ButtonRow>

          {rows ? (
            rows.length === 0 ? (
              <Empty>No bird has a placed arrival in these races.</Empty>
            ) : (
              <View className="mt-3">
                <Text className="mb-2 text-xs text-slate-500">
                  {rows.length} birds · prizes {money(prizeTotal)}
                </Text>
                <Rows>
                  {rows.map((r) => (
                    <Row
                      key={r.inventoryItemId}
                      bird={{ id: r.birdId, band: r.band }}
                      leading={<Text className="w-7 text-xs font-medium text-slate-400">#{r.position}</Text>}
                      title={r.band}
                      subtitle={[
                        r.breederName,
                        `${r.raceCount} race${r.raceCount === 1 ? "" : "s"}`,
                        `${r.totalDistance} mi`,
                        hms(r.totalFlightMs),
                        r.yardsPerMin != null ? `${r.yardsPerMin.toFixed(3)} ypm` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      right={r.prize != null && r.prize > 0 ? money(r.prize) : null}
                    />
                  ))}
                </Rows>
              </View>
            )
          ) : (
            <Notice>Pick the races and rank the birds to see the winners and their prizes.</Notice>
          )}
        </>
      )}

      <Confirm
        open={confirming}
        title="Set average-speed prizes?"
        body={`Stores ${money(prizeTotal)} of average-speed prizes for ${
          (rows ?? []).filter((r) => (r.prize ?? 0) > 0).length
        } birds in the breeders' accounts, replacing this season's earlier average-speed prizes (HayLoft's AVG_WINNER_PRIZE_SET).`}
        confirmLabel="Set prizes"
        tone="primary"
        pending={action.pending}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}
