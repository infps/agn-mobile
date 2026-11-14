import React, { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { seasonRacesUrl, useChosenSeason } from "@/service/season.service";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { Label, Pills, raceLabel } from "@/components/admin/raceParts";
import {
  Button,
  ButtonRow,
  ChoiceList,
  Confirm,
  Empty,
  Field,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  Sheet,
} from "@/components/admin/ui";

type CutMode = "TOP_PERCENT" | "TOP_N" | "MANUAL";

interface Round {
  id: number;
  roundNumber: number;
  raceId: number | null;
  status: string;
  survivorCount: number | null;
  race?: { name?: string | null; raceNumber?: number | null; status?: string | null } | null;
}

interface Tournament {
  id: number;
  name: string;
  cutMode: CutMode;
  cutValue: number;
  status: string;
  rounds?: Round[];
  entryCount: number;
  aliveCount: number;
}

const STATUS: Record<string, { bg: string; text: string }> = {
  SETUP: { bg: "bg-slate-200", text: "text-slate-600" },
  RUNNING: { bg: "bg-emerald-100", text: "text-emerald-700" },
  COMPLETE: { bg: "bg-blue-100", text: "text-blue-700" },
};

const CUT_MODES: { key: CutMode; label: string; hint: string }[] = [
  { key: "TOP_PERCENT", label: "Top percent", hint: "A share of the field goes through" },
  { key: "TOP_N", label: "Top N birds", hint: "A fixed number goes through" },
  { key: "MANUAL", label: "Hand-picked", hint: "The operator picks who goes through" },
];

const cutSummary = (mode: CutMode, value: number) =>
  mode === "TOP_PERCENT"
    ? `top ${value}% go through each round`
    : mode === "TOP_N"
      ? `top ${Math.floor(value)} birds go through each round`
      : "the operator picks who goes through";

const roundLabel = (round: Round) =>
  round.race?.name ||
  (round.race?.raceNumber != null ? `Race ${round.race.raceNumber}` : "no race attached");

/**
 * Knockouts — birds eliminated round by round on a position cutoff.
 *
 * Each round runs as an ordinary race, so check-in, scanning and results behave
 * exactly as they do everywhere else. What is particular to a knockout is the
 * cut, and the one number that matters is survivors against starters.
 *
 * Applying a cut is the most irreversible button in the app: it reads the
 * round's finishing order, applies the rule, and eliminates everything below
 * the line. There is no undo on either side, portal or phone. So it is only
 * offered when the portal would offer it — the round has a race and that race
 * has ended — the reason is stated when it is not, and the confirmation spells
 * the cut out in the tournament's own terms, because that is the sentence
 * somebody can check against what they meant to do.
 */
export default function EventKnockout() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const base = eventId ? `/admin/event/${eventId}/tournaments` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    tournaments?: Tournament[];
  }>(base, [eventId]);

  const [advancing, setAdvancing] = useState<Tournament | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    cutMode: "TOP_PERCENT" as CutMode,
    cutValue: "50",
    raceIds: [] as number[],
  });

  // Rounds are picked from the selected season's races (as the portal's
  // Knockout tab does), and only while creating.
  const chosen = useChosenSeason(eventId);
  const racesReq = useAdminData<{
    races?: { id: number; name: string | null; raceNumber: number | null }[];
  }>(creating && eventId ? seasonRacesUrl(eventId, chosen) : null, [creating, eventId, chosen?.id]);
  const races = racesReq.data?.races ?? [];

  const rows = data?.tournaments ?? [];
  const mayManage = can("tournaments.manage");

  const nextRound = (t: Tournament) => (t.rounds ?? []).find((r) => r.status !== "CUT_APPLIED");

  /** Why the cut is not on offer, in the portal's words; null when it is. */
  const blocked = (t: Tournament): string | null => {
    const next = nextRound(t);
    if (next == null) return "Every round has been cut. Add another race as a round.";
    if (next.raceId == null) return "Attach a race to this round first.";
    if (next.race?.status !== "ENDED") {
      return "The round's race has to end before the cut can be applied.";
    }
    return null;
  };

  const create = async () => {
    if (!form.name.trim()) {
      toast.error("Give the tournament a name.");
      return;
    }
    const { ok, data: said } = await action.run<{ message?: string }>("post", base!, {
      name: form.name.trim(),
      cutMode: form.cutMode,
      cutValue: Number(form.cutValue) || 0,
      raceIds: form.raceIds,
    });
    if (ok) {
      toast.success(said?.message ?? "Tournament created.");
      setCreating(false);
      setForm({ name: "", cutMode: "TOP_PERCENT", cutValue: "50", raceIds: [] });
      reload();
    }
  };

  const advance = async () => {
    if (!advancing) return;
    // No body: the server applies the tournament's own cut rule. A hand-picked
    // cut needs the list of birds to keep, which no screen — here or in the
    // portal — can build yet, so the server refuses it and says why.
    const { ok, data: said } = await action.run<{ message?: string }>(
      "post",
      `/admin/tournament/${advancing.id}/advance`
    );
    if (ok) {
      toast.success(said?.message ?? "Round advanced.");
      reload();
    }
    setAdvancing(null);
  };

  if (!canAny("tournaments.view", "tournaments.manage") || forbidden) {
    return <NoAccess what="Knockout" />;
  }

  const alive = rows.reduce((s, t) => s + t.aliveCount, 0);
  const entered = rows.reduce((s, t) => s + t.entryCount, 0);
  const advancingRound = advancing ? nextRound(advancing) : undefined;

  return (
    <Screen
      title="Knockout"
      subtitle={name ? `${name} · ${rows.length} tournaments` : `${rows.length} tournaments`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        mayManage ? (
          <ButtonRow>
            <Button label="New tournament" icon="add" onPress={() => setCreating(true)} />
          </ButtonRow>
        ) : undefined
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Knockouts" value={rows.length} basis="31%" />
            <Figure label="Birds entered" value={entered} basis="31%" />
            <Figure label="Still alive" value={alive} tone="text-emerald-600" basis="31%" />
          </FigureRow>

          {rows.length === 0 ? (
            <View className="mt-4">
              <Empty>No tournaments in this season yet.</Empty>
            </View>
          ) : (
            rows.map((t) => {
              const next = nextRound(t);
              const why = blocked(t);
              const done = t.status === "COMPLETE";
              return (
                <View key={t.id} className="mt-4">
                  <Rows>
                    <Row
                      title={t.name}
                      subtitle={cutSummary(t.cutMode, t.cutValue)}
                      right={`${t.aliveCount} of ${t.entryCount}`}
                      rightSub="still in"
                      rightTone={t.aliveCount > 0 ? "text-emerald-600" : "text-slate-400"}
                      badge={{ label: t.status.toLowerCase(), ...(STATUS[t.status] ?? STATUS.SETUP) }}
                    />
                    {(t.rounds ?? []).map((round) => (
                      <Row
                        key={round.id}
                        leading={
                          <Text className="w-7 text-xs font-medium text-slate-400">
                            R{round.roundNumber}
                          </Text>
                        }
                        title={roundLabel(round)}
                        subtitle={round.race?.status ? round.race.status.toLowerCase() : undefined}
                        right={
                          round.status === "CUT_APPLIED"
                            ? `${round.survivorCount ?? 0} through`
                            : round.status.toLowerCase().replace(/_/g, " ")
                        }
                        rightTone={
                          round.status === "CUT_APPLIED" ? "text-blue-600" : "text-slate-500"
                        }
                      />
                    ))}
                  </Rows>

                  {mayManage && !done ? (
                    <>
                      <ButtonRow>
                        <Button
                          label={`Apply round ${next?.roundNumber ?? "?"} cut`}
                          tone="danger"
                          icon="cut-outline"
                          disabled={why != null}
                          onPress={() => setAdvancing(t)}
                          full
                        />
                      </ButtonRow>
                      {why ? (
                        <Text className="mt-1 text-xs text-amber-600">{why}</Text>
                      ) : t.cutMode === "MANUAL" ? (
                        <Text className="mt-1 text-xs text-slate-500">
                          Hand-picked cuts are applied through the API with the birds to keep.
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
              );
            })
          )}
        </>
      )}

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="New tournament"
        subtitle="Every active bird in the season is entered when it is created"
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Knockout 2027"
          autoFocus
        />

        <Label>Cut mode</Label>
        <ChoiceList
          choices={CUT_MODES}
          selected={form.cutMode}
          onPick={(k) => setForm({ ...form, cutMode: k as CutMode })}
        />

        {form.cutMode !== "MANUAL" ? (
          <Field
            label={form.cutMode === "TOP_PERCENT" ? "Percent through" : "Birds through"}
            value={form.cutValue}
            onChange={(v) => setForm({ ...form, cutValue: v })}
            keyboard="numeric"
          />
        ) : null}

        <Label>Rounds</Label>
        {racesReq.loading ? (
          <Loading />
        ) : races.length === 0 ? (
          <Text className="text-xs text-slate-500">
            This season has no races yet. The tournament will start with one empty round.
          </Text>
        ) : (
          <>
            <Pills
              wrap
              pills={races.map((r) => ({
                key: r.id,
                label: raceLabel(r),
                lead: form.raceIds.includes(r.id) ? `${form.raceIds.indexOf(r.id) + 1}.` : null,
              }))}
              isOn={(k) => form.raceIds.includes(Number(k))}
              onPress={(k) => {
                const id = Number(k);
                setForm({
                  ...form,
                  raceIds: form.raceIds.includes(id)
                    ? form.raceIds.filter((x) => x !== id)
                    : [...form.raceIds, id],
                });
              }}
            />
            <Text className="mt-2 text-xs text-slate-400">
              Tap races in the order they should be flown. Each becomes a round.
            </Text>
          </>
        )}

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setCreating(false)} full />
          <Button label="Create tournament" onPress={create} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={advancing != null}
        title={`Cut round ${advancingRound?.roundNumber ?? ""} of ${advancing?.name ?? "this knockout"}?`}
        body={
          advancing
            ? `${advancing.aliveCount} birds are still in. From the finishing order of ${
                advancingRound ? roundLabel(advancingRound) : "the round's race"
              }, ${cutSummary(
                advancing.cutMode,
                advancing.cutValue
              )} and the rest are eliminated. This cannot be undone, here or in the portal.`
            : ""
        }
        confirmLabel="Make the cut"
        pending={action.pending}
        onConfirm={advance}
        onCancel={() => setAdvancing(null)}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
