import { BETTING_ENABLED } from "@/constants/features";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { EventPicker } from "@/components/admin/EventPicker";
import { seasonRacesUrl, useChosenSeason } from "@/service/season.service";
import { RaceFormSheet } from "@/components/admin/RaceFormSheet";
import { type AdminRace, RACE_STATUS, raceLabel } from "@/components/admin/raceParts";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Loading,
  NoAccess,
  Notice,
  Screen,
  SearchBar,
} from "@/components/admin/ui";

/**
 * Races for one event.
 *
 * Ordered live-first rather than by date: a race in the air is the only one
 * anybody needs to reach in a hurry, and scrolling past a season of finished
 * races to find it is exactly the friction this screen exists to remove.
 *
 * Each card carries what the portal's table does — type, distance, when, the
 * bird counts, the arrival weather — and the betting switch, because opening a
 * pool is a thing done from this list and not from inside the race. It asks
 * first: opening betting announces itself to the whole season.
 *
 * Reached two ways. From an event it arrives with that event already chosen;
 * from the tab bar it picks the newest and lets you change it.
 */
export default function AdminRaces() {
  const params = useLocalSearchParams<{ eventId?: string }>();
  const { can, canAny } = usePermissions();
  const { isWide, isMedium } = useResponsive();
  const router = useRouter();
  const toast = useToast();
  const action = useAdminAction();

  const [eventId, setEventId] = useState<number | null>(
    params.eventId && !isNaN(Number(params.eventId)) ? Number(params.eventId) : null
  );
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminRace | "new" | null>(null);
  const [removing, setRemoving] = useState<AdminRace | null>(null);
  const [betting, setBetting] = useState<AdminRace | null>(null);

  // The season chosen on the event's Seasons screen: the portal's Races tab
  // lists the races of the season selected above its tabs.
  const season = useChosenSeason(eventId);

  // The admin list carries private races too, which the breeder list hides.
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    races?: AdminRace[];
  }>(eventId != null ? seasonRacesUrl(eventId, season) : null, [eventId, season?.id]);

  const races = useMemo(() => data?.races ?? [], [data]);
  const canManage = can("races.manage");
  const canBet = can("betting.manage");

  const visible = useMemo(() => {
    const rank = (r: AdminRace) => (r.status === "STARTED" ? 0 : r.status === "REGISTERING" ? 1 : 2);
    const q = query.trim().toLowerCase();
    return races
      .filter(
        (r) =>
          !q ||
          (r.name ?? "").toLowerCase().includes(q) ||
          String(r.raceNumber ?? "").includes(q) ||
          (r.location ?? "").toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          (r.arrivalWeather ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => rank(a) - rank(b) || (b.raceNumber ?? 0) - (a.raceNumber ?? 0));
  }, [races, query]);

  const removeRace = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", "/admin/race", { raceId: removing.id }, {
      success: "Race deleted.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  const toggleBetting = async () => {
    if (!betting) return;
    const { ok, data: said } = await action.run<{ bettingOpen?: boolean }>(
      "post",
      `/admin/race/${betting.id}/betting/toggle`
    );
    if (ok) {
      toast.success(said?.bettingOpen ? "Betting is open." : "Betting is closed.");
      setBetting(null);
      reload();
    }
  };

  if (!canAny("races.view", "races.manage") || forbidden) return <NoAccess what="Races" />;

  return (
    <Screen
      title="Races"
      subtitle={season ? `Season: ${season.name ?? `#${season.id}`}` : undefined}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <>
          <EventPicker value={eventId} onChange={(id) => setEventId(id)} />
          {canManage && eventId != null ? (
            <ButtonRow>
              <Button label="New race" icon="add" onPress={() => setEditing("new")} />
            </ButtonRow>
          ) : null}
          <View className="mt-3">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Name, number, location, status or weather"
            />
          </View>
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <View className="mt-3">
          {error ? <Notice>{error}</Notice> : null}

          {visible.length === 0 ? (
            <Empty>
              {races.length === 0 ? "This event has no races yet." : "No race matches that search."}
            </Empty>
          ) : (
            <View className={isWide || isMedium ? "flex-row flex-wrap" : ""} style={{ gap: 10 }}>
              {visible.map((race) => {
                const tone = RACE_STATUS[race.status] ?? RACE_STATUS.ENDED;
                const canToggle = canBet && race.status === "REGISTERING";
                return (
                  <Pressable
                    key={race.id}
                    onPress={() => router.push(`/(admin)/race-detail?raceId=${race.id}` as never)}
                    // Editing is the rarer intent, so a hold reaches it as well
                    // as the pencil — opening the race is what somebody is
                    // doing on a race day, and it keeps the whole card.
                    onLongPress={canManage ? () => setEditing(race) : undefined}
                    delayLongPress={400}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    style={{ flexGrow: 1, flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%" }}
                  >
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="flex-1">
                        <Text className="font-semibold text-slate-900">{raceLabel(race)}</Text>
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {race.raceType?.name ?? "Race"}
                          {race.distance != null ? ` · ${race.distance} miles` : ""}
                        </Text>
                      </View>
                      {race.isPrivate ? (
                        <View className="rounded-full bg-amber-100 px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-amber-700">private</Text>
                        </View>
                      ) : null}
                      <View className={`rounded-full px-2 py-0.5 ${tone.bg}`}>
                        <Text className={`text-[10px] font-medium ${tone.text}`}>{tone.label}</Text>
                      </View>
                    </View>

                    <Text className="mt-2 text-xs text-slate-500">
                      {race.startTime ? new Date(race.startTime).toLocaleString() : "Not scheduled"}
                    </Text>
                    {race.location ? (
                      <Text className="mt-0.5 text-xs text-slate-400">{race.location}</Text>
                    ) : null}

                    <Text className="mt-2 text-xs text-slate-600">
                      {race.activeBirds ?? 0} active · {race.lostBirds ?? 0} lost ·{" "}
                      {race.foreignBirds ?? 0} foreign
                    </Text>
                    {race.arrivalWeather || race.arrivalTemperature ? (
                      <Text className="mt-0.5 text-xs text-slate-400">
                        Arrival{" "}
                        {[
                          race.arrivalTemperature ? `${race.arrivalTemperature}°` : null,
                          race.arrivalWeather,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    ) : null}
                    {race.transportStatus && race.transportStatus !== "IDLE" ? (
                      <Text className="mt-1 text-xs text-amber-600">
                        Transport {race.transportStatus.toLowerCase().replace(/_/g, " ")}
                      </Text>
                    ) : null}

                    <View className="mt-3 flex-row items-center justify-between">
                      {BETTING_ENABLED ? (
                        <Pressable
                          onPress={canToggle ? () => setBetting(race) : undefined}
                          disabled={!canToggle}
                          hitSlop={6}
                          className="flex-row items-center gap-1.5"
                        >
                          <Ionicons
                            name={race.bettingOpen ? "toggle" : "toggle-outline"}
                            size={26}
                            color={race.bettingOpen ? "#059669" : canToggle ? "#64748b" : "#cbd5e1"}
                          />
                          <Text className="text-xs text-slate-500">
                            Betting {race.bettingOpen ? "open" : "closed"}
                          </Text>
                        </Pressable>
                      ) : (
                        <View />
                      )}
                      {canManage ? (
                        <Pressable onPress={() => setEditing(race)} hitSlop={10}>
                          <Ionicons name="create-outline" size={18} color="#64748b" />
                        </Pressable>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!canManage && races.length > 0 ? (
            <Text className="mt-4 text-center text-xs text-slate-400">
              You can see these races but not change them.
            </Text>
          ) : null}
        </View>
      )}

      <RaceFormSheet
        open={editing != null}
        onClose={() => setEditing(null)}
        eventId={eventId}
        race={editing === "new" ? null : editing}
        onSaved={reload}
        onDelete={(race) => setRemoving(race)}
      />

      <Confirm
        open={removing != null}
        title={`Delete ${removing ? raceLabel(removing) : "this race"}?`}
        body="Entries, arrivals and results recorded against it go with it. A race that has been flown should be kept, not deleted."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={removeRace}
        onCancel={() => setRemoving(null)}
      />

      <Confirm
        open={betting != null}
        title={
          betting?.bettingOpen
            ? `Close betting on ${betting ? raceLabel(betting) : ""}?`
            : `Open betting on ${betting ? raceLabel(betting) : ""}?`
        }
        body={
          betting?.bettingOpen
            ? "No more bets will be taken on this race."
            : "The season is told the pool is open. Only one race in an event can take bets at a time."
        }
        confirmLabel={betting?.bettingOpen ? "Close betting" : "Open betting"}
        tone={betting?.bettingOpen ? "danger" : "primary"}
        pending={action.pending}
        onConfirm={toggleBetting}
        onCancel={() => setBetting(null)}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
