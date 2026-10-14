import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { seasonRacesUrl, useChosenSeason } from "@/service/season.service";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { CheckRow, Label, Pills, raceLabel, shortBand } from "@/components/admin/raceParts";
import {
  Button,
  ButtonRow,
  ChoiceList,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  SearchBar,
  Sheet,
  Truncated,
} from "@/components/admin/ui";

type FilterMode = "ALL" | "BY_TYPE" | "MANUAL" | "COMBINATION";

interface Config {
  id: number;
  name: string | null;
  isPublic: boolean | null;
  filterMode: FilterMode | null;
  selectedRaceTypes?: { raceType?: { id: number; name: string | null } | null }[];
  selectedRaces?: { race?: { id: number; name: string | null } | null }[];
}

interface ResultRow {
  rank: number | null;
  birdId: number;
  band: string | null;
  color: string | null;
  sex: number | null;
  loft: string | null;
  breederName: string | null;
  racesFlown: number;
  /** Yards per minute; null for a bird that flew none of the counted races. */
  avgSpeedYPM: number | null;
}

const MODES: { key: FilterMode; label: string; hint: string }[] = [
  { key: "ALL", label: "All races", hint: "Every race in the season counts" },
  { key: "BY_TYPE", label: "By type", hint: "Only races of the chosen types" },
  { key: "MANUAL", label: "Manual", hint: "Only the races picked by hand" },
  { key: "COMBINATION", label: "Combination", hint: "Chosen types plus hand-picked races" },
];

const SEX: Record<number, string> = { 0: "Unknown", 1: "Cock", 2: "Hen" };

const EMPTY = {
  name: "",
  filterMode: "ALL" as FilterMode,
  isPublic: false,
  typeIds: [] as number[],
  raceIds: [] as number[],
};

const flip = (list: number[], id: number) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/**
 * Standings across several races rather than one.
 *
 * An average is a saved definition — which races count, and whether breeders
 * can see it — so the definition is picked first and its table follows. The
 * definitions are built here as well as read: which races count is decided
 * once and carefully, but "make that one public" is exactly the thing somebody
 * is asked to do while standing at the loft.
 *
 * The table ranks on average speed in yards a minute. Birds that flew none of
 * the counted races stay listed, unranked, at the bottom — the same "DNP" the
 * portal's export gives them.
 */
export default function EventAverages() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [configId, setConfigId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Config | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [removing, setRemoving] = useState<Config | null>(null);

  const base = eventId ? `/admin/event/${eventId}/averages` : null;

  // This endpoint answers with a bare array rather than an object.
  const configsReq = useAdminData<Config[]>(base, [eventId]);
  const configs = useMemo(
    () => (Array.isArray(configsReq.data) ? configsReq.data : []),
    [configsReq.data]
  );

  useEffect(() => {
    if (configs.length === 0) {
      if (configId != null) setConfigId(null);
    } else if (!configs.some((c) => c.id === configId)) {
      setConfigId(configs[0].id);
    }
  }, [configs, configId]);

  const resultsReq = useAdminData<{ results?: ResultRow[] }>(
    base && configId != null ? `${base}/${configId}/results` : null,
    [eventId, configId]
  );
  const rows = useMemo(() => resultsReq.data?.results ?? [], [resultsReq.data]);

  // The pickers a definition is built from, fetched only while one is open.
  const typesReq = useAdminData<{ raceTypes?: { id: number; name: string | null }[] }>(
    editing != null ? "/admin/race-type" : null,
    [editing != null]
  );
  // The portal's Averages tab picks from the selected season's races.
  const chosen = useChosenSeason(eventId);
  const racesReq = useAdminData<{
    races?: { id: number; name: string | null; raceNumber: number | null }[];
  }>(
    editing != null && eventId ? seasonRacesUrl(eventId, chosen) : null,
    [editing != null, eventId, chosen?.id]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.loft ?? "").toLowerCase().includes(q) ||
        (r.breederName ?? "").toLowerCase().includes(q) ||
        (r.band ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  // Every route behind this screen — writes included — is guarded by races.view.
  if (!can("races.view") || configsReq.forbidden) return <NoAccess what="Averages" />;

  const active = configs.find((c) => c.id === configId) ?? null;
  const needsTypes = form.filterMode === "BY_TYPE" || form.filterMode === "COMBINATION";
  const needsRaces = form.filterMode === "MANUAL" || form.filterMode === "COMBINATION";

  const describe = (c: Config) => {
    const types = (c.selectedRaceTypes ?? []).map((t) => t.raceType?.name).filter(Boolean);
    const picked = c.selectedRaces?.length ?? 0;
    const mode = MODES.find((m) => m.key === c.filterMode)?.label ?? "All races";
    return [
      mode,
      types.length > 0 ? types.join(", ") : null,
      picked > 0 ? `${picked} race${picked === 1 ? "" : "s"}` : null,
      c.isPublic ? "visible to breeders" : "private",
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const startNew = () => {
    setForm({ ...EMPTY });
    setEditing("new");
  };

  const startEdit = (c: Config) => {
    setForm({
      name: c.name ?? "",
      filterMode: c.filterMode ?? "ALL",
      isPublic: c.isPublic === true,
      typeIds: (c.selectedRaceTypes ?? []).flatMap((t) => (t.raceType ? [t.raceType.id] : [])),
      raceIds: (c.selectedRaces ?? []).flatMap((r) => (r.race ? [r.race.id] : [])),
    });
    setEditing(c);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Give the average a name.");
      return;
    }
    const isNew = editing === "new";
    const body = {
      name: form.name.trim(),
      filterMode: form.filterMode,
      isPublic: form.isPublic,
      // A mode that does not use a list clears it, so switching an average back
      // to "all races" does not leave a stale selection behind it.
      raceTypeIds: needsTypes ? form.typeIds : [],
      raceIds: needsRaces ? form.raceIds : [],
    };
    const { ok, data } = await action.run<Config>(
      isNew ? "post" : "patch",
      isNew ? base! : `${base}/${(editing as Config).id}`,
      body,
      { success: isNew ? "Average created." : "Average updated." }
    );
    if (ok) {
      setEditing(null);
      if (isNew && data?.id != null) setConfigId(data.id);
      configsReq.reload();
      resultsReq.reload();
    }
  };

  const togglePublic = async (c: Config) => {
    const { ok } = await action.run(
      "patch",
      `${base}/${c.id}`,
      { isPublic: !c.isPublic },
      { success: c.isPublic ? "Made private." : "Made public." }
    );
    if (ok) configsReq.reload();
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}/${removing.id}`, undefined, {
      success: "Average deleted.",
    });
    if (ok) {
      setRemoving(null);
      configsReq.reload();
    }
  };

  /** The portal's CSV, column for column, handed to the share sheet. */
  const exportCsv = async () => {
    try {
      const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const lines = [
        "Rank,Loft,Band,Sex,Color,Races Flown,Avg Speed (YPM)",
        ...shown.map((r) =>
          [
            r.rank ?? "DNP",
            r.loft ?? r.breederName ?? "",
            r.band ?? "",
            r.sex != null ? (SEX[r.sex] ?? "") : "",
            r.color ?? "",
            r.racesFlown,
            r.avgSpeedYPM != null ? r.avgSpeedYPM.toFixed(3) : "",
          ]
            .map(cell)
            .join(",")
        ),
      ];
      const safe = (active?.name ?? "average").replace(/[^a-zA-Z0-9._-]+/g, "-") || "average";
      const file = new File(Paths.cache, `${safe}.csv`);
      file.create({ overwrite: true });
      file.write(lines.join("\n"));
      if (!(await Sharing.isAvailableAsync())) {
        toast.error("This device cannot share files, so there is nowhere to send it.");
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
    } catch {
      toast.error("Could not write the export.");
    }
  };

  return (
    <Screen
      title="Averages"
      subtitle={name ?? undefined}
      onRefresh={() => {
        configsReq.refresh();
        resultsReq.reload();
      }}
      refreshing={configsReq.refreshing}
      header={
        <>
          <ButtonRow>
            <Button label="New average" icon="add" onPress={startNew} />
          </ButtonRow>
          {configs.length > 0 ? (
            <View className="mt-3">
              <Pills
                pills={configs.map((c) => ({ key: c.id, label: c.name ?? `Average ${c.id}` }))}
                isOn={(k) => k === configId}
                onPress={(k) => setConfigId(Number(k))}
              />
            </View>
          ) : null}
        </>
      }
    >
      {configsReq.loading ? (
        <Loading />
      ) : configs.length === 0 ? (
        <View className="mt-4">
          {configsReq.error ? <Notice>{configsReq.error}</Notice> : null}
          <Empty>No averages have been set up for this season.</Empty>
        </View>
      ) : (
        <>
          {configsReq.error ? <Notice>{configsReq.error}</Notice> : null}

          {active ? (
            <>
              <Text className="mt-3 text-xs text-slate-500">{describe(active)}</Text>
              <ButtonRow>
                <Button label="Edit" tone="secondary" icon="create-outline" onPress={() => startEdit(active)} full />
                <Button
                  label={active.isPublic ? "Make private" : "Make public"}
                  tone="secondary"
                  icon={active.isPublic ? "eye-off-outline" : "eye-outline"}
                  onPress={() => togglePublic(active)}
                  pending={action.pending}
                  full
                />
              </ButtonRow>
              <ButtonRow>
                <Button
                  label="Export CSV"
                  tone="secondary"
                  icon="download-outline"
                  onPress={exportCsv}
                  disabled={shown.length === 0}
                  full
                />
                <Button label="Delete" tone="secondary" icon="trash-outline" onPress={() => setRemoving(active)} full />
              </ButtonRow>
            </>
          ) : null}

          <View className="mt-3">
            <SearchBar value={query} onChange={setQuery} placeholder="Loft, breeder or band" />
          </View>

          <View className="mt-3">
            {resultsReq.loading ? (
              <Loading />
            ) : resultsReq.error ? (
              <Notice>{resultsReq.error}</Notice>
            ) : shown.length === 0 ? (
              <Empty>
                {rows.length === 0
                  ? "No birds are in this average yet."
                  : "No bird matches that search."}
              </Empty>
            ) : (
              <Rows>
                {shown.slice(0, 300).map((r) => (
                  <Row
                    key={r.birdId}
                    leading={
                      <View className="w-9 items-center">
                        <Text className="text-sm font-semibold text-slate-900">{r.rank ?? "—"}</Text>
                      </View>
                    }
                    title={r.loft ?? r.breederName ?? "Unknown"}
                    subtitle={
                      [
                        shortBand(r.band),
                        r.sex != null ? SEX[r.sex] : null,
                        r.color,
                        r.loft ? r.breederName : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                    right={r.avgSpeedYPM != null ? r.avgSpeedYPM.toFixed(3) : "DNP"}
                    rightSub={`${r.racesFlown} race${r.racesFlown === 1 ? "" : "s"}`}
                    rightTone={r.avgSpeedYPM != null ? "text-slate-900" : "text-slate-400"}
                  />
                ))}
              </Rows>
            )}
            <Truncated shown={Math.min(shown.length, 300)} total={shown.length} where="a narrower search or the export" />
            {shown.length > 0 ? (
              <Text className="mt-2 text-center text-xs text-slate-400">
                Average speed in yards per minute.
              </Text>
            ) : null}
          </View>
        </>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New average" : "Edit average"}
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="All-Race Average"
          autoFocus={editing === "new"}
        />

        <Label>Which races count</Label>
        <ChoiceList
          choices={MODES}
          selected={form.filterMode}
          onPick={(k) => setForm({ ...form, filterMode: k as FilterMode })}
        />

        {needsTypes ? (
          <>
            <Label>Race types</Label>
            {typesReq.loading ? (
              <Loading />
            ) : (
              <Pills
                wrap
                pills={(typesReq.data?.raceTypes ?? []).map((t) => ({
                  key: t.id,
                  label: t.name ?? `Type ${t.id}`,
                }))}
                isOn={(k) => form.typeIds.includes(Number(k))}
                onPress={(k) => setForm({ ...form, typeIds: flip(form.typeIds, Number(k)) })}
              />
            )}
          </>
        ) : null}

        {needsRaces ? (
          <>
            <Label>Races</Label>
            {racesReq.loading ? (
              <Loading />
            ) : (racesReq.data?.races ?? []).length === 0 ? (
              <Text className="text-xs text-slate-500">No races found for this season.</Text>
            ) : (
              (racesReq.data?.races ?? []).map((r) => (
                <CheckRow
                  key={r.id}
                  on={form.raceIds.includes(r.id)}
                  label={raceLabel(r)}
                  onPress={() => setForm({ ...form, raceIds: flip(form.raceIds, r.id) })}
                />
              ))
            )}
          </>
        ) : null}

        <View className="mt-3">
          <CheckRow
            on={form.isPublic}
            label="Public"
            hint="Visible to breeders."
            onPress={() => setForm({ ...form, isPublic: !form.isPublic })}
          />
        </View>

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button label="Save" onPress={save} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Delete "${removing?.name ?? "this average"}"?`}
        body="The definition goes. The races and their results are untouched, and the average can be built again."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
