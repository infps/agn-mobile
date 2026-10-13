import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useToast } from "@/context/ToastContext";
import { downloadAndShare } from "@/service/download.service";
import {
  Button,
  type Choice,
  ChoiceList,
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  SectionTitle,
  Sheet,
} from "@/components/admin/ui";

type Scope = "race" | "season" | "scheme" | "global";
type Format = "pdf" | "xlsx" | "csv" | "html";

interface Report {
  key: string;
  title: string;
  description: string | null;
  scope: Scope | null;
  /** The one parameter a report needs before it can run, if any. */
  requires: "seasonId" | "raceId" | null;
  legacyTemplate: string | null;
  isLabelSheet?: boolean;
}

interface Season {
  id: number;
  name: string | null;
  isActive?: boolean | null;
  event?: { id: number; name: string | null } | null;
}

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  raceType?: { name: string | null } | null;
}

const SCOPE_LABEL: Record<Scope, string> = {
  race: "Per race",
  season: "Per season",
  scheme: "Scheme",
  global: "All breeders",
};

const FORMATS: {
  key: Format;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "pdf", label: "PDF", icon: "document-text-outline" },
  { key: "xlsx", label: "Excel", icon: "grid-outline" },
  { key: "csv", label: "CSV", icon: "download-outline" },
  { key: "html", label: "Print", icon: "print-outline" },
];

const seasonLabel = (s: Season) =>
  s.event?.name ? `${s.event.name} — ${s.name ?? `Season ${s.id}`}` : s.name ?? `Season ${s.id}`;

const raceLabel = (r: Race) =>
  `${r.name || `Race ${r.raceNumber ?? r.id}`}${r.raceType?.name ? ` · ${r.raceType.name}` : ""}`;

/**
 * The reports that exist, and running one.
 *
 * Every one of these is rendered by the portal, not here — PDF, spreadsheet,
 * CSV and the print view all come back as finished bytes from the same endpoint
 * the web app uses. So there is no second implementation to keep in step: this
 * screen holds a season and a race, the way the portal's Scope card does, and
 * hands whatever comes back to the phone's share sheet.
 *
 * The scope is chosen once and kept, not asked per report. Somebody printing
 * for a race day wants the result sheet, the pool totals and the labels for the
 * same race, and being asked "which race?" three times is how the wrong one
 * gets printed.
 *
 * The share sheet is the point. A file saved into a downloads folder on a phone
 * is a dead end, but a file handed straight to mail, Drive, a printer or a
 * spreadsheet app is the thing somebody actually wanted. "Print" is the
 * portal's print view — a web page — which the share sheet can send to a
 * browser or straight to a printer.
 *
 * Where a report came across from the old system, its original template name is
 * shown — that is what people still call it out loud.
 */
export default function AdminReports() {
  const { can } = usePermissions();
  const toast = useToast();
  const allowed = can("reports.view");

  const [query, setQuery] = useState("");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [raceId, setRaceId] = useState<number | null>(null);
  const [picking, setPicking] = useState<"season" | "race" | null>(null);
  /** `report:format` while the portal is building one. */
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    reports?: Report[];
  }>(allowed ? "/admin/reports" : null);

  const seasonsReq = useAdminData<{ seasons?: Season[] }>(allowed ? "/admin/seasons" : null);
  const racesReq = useAdminData<{ races?: Race[] }>(
    allowed && seasonId != null ? `/admin/race?seasonId=${seasonId}` : null,
    [seasonId]
  );

  const reports = useMemo(() => data?.reports ?? [], [data]);
  const seasons = useMemo(() => seasonsReq.data?.seasons ?? [], [seasonsReq.data]);
  const races = useMemo(
    () => (seasonId != null ? racesReq.data?.races ?? [] : []),
    [racesReq.data, seasonId]
  );

  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const race = races.find((r) => r.id === raceId) ?? null;

  const seasonChoices: Choice[] = seasons.map((s) => ({
    key: s.id,
    label: seasonLabel(s),
    hint: s.isActive ? "active" : null,
  }));
  const raceChoices: Choice[] = races.map((r) => ({ key: r.id, label: raceLabel(r) }));

  const missingFor = (report: Report): string | null => {
    if (report.requires === "seasonId" && seasonId == null) return "Choose a season first";
    if (report.requires === "raceId" && raceId == null) return "Choose a race first";
    return null;
  };

  const run = async (report: Report, format: Format) => {
    const blocked = missingFor(report);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    if (busy) return;

    // Both are sent whenever they are set, as the portal does — scheme reports
    // take the season, and a report ignores what it has no use for.
    const params = new URLSearchParams({ format });
    if (seasonId != null) params.set("seasonId", String(seasonId));
    if (raceId != null) params.set("raceId", String(raceId));

    setBusy(`${report.key}:${format}`);
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await downloadAndShare(
      `/admin/reports/${report.key}?${params.toString()}`,
      `${report.key}-${stamp}.${format}`
    );
    setBusy(null);

    if (!result.ok && result.problem) toast.error(result.problem);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.legacyTemplate ?? "").toLowerCase().includes(q)
    );
  }, [reports, query]);

  if (!allowed || forbidden) return <NoAccess what="Reports" />;

  return (
    <Screen
      title="Reports"
      subtitle="Pick a season — and a race for race reports — then take it in the format you need."
      onRefresh={() => {
        refresh();
        seasonsReq.refresh();
        if (seasonId != null) racesReq.refresh();
      }}
      refreshing={refreshing}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <SectionTitle>Scope</SectionTitle>
          {seasonsReq.forbidden ? (
            <Notice>
              Choosing a season needs access to events, which is not part of yours. Reports that
              need no season can still be run.
            </Notice>
          ) : seasonsReq.error ? (
            <Notice>{seasonsReq.error}</Notice>
          ) : null}
          <Rows>
            <Row
              title="Season"
              subtitle={season ? seasonLabel(season) : "Select a season"}
              onPress={() => setPicking("season")}
            />
            <Row
              title="Race"
              subtitle={
                seasonId == null
                  ? "Select a season first"
                  : race
                    ? raceLabel(race)
                    : "Select a race"
              }
              onPress={seasonId != null ? () => setPicking("race") : undefined}
            />
          </Rows>

          <SectionTitle>{`${reports.length} reports`}</SectionTitle>
          <SearchBar value={query} onChange={setQuery} placeholder="Report name or purpose" />

          <View className="mt-3" style={{ gap: 10 }}>
            {shown.length === 0 ? (
              <Empty>
                {reports.length === 0 ? "No reports are defined." : "No report matches that."}
              </Empty>
            ) : (
              shown.map((r) => {
                const blocked = missingFor(r);
                return (
                  <View key={r.key} className="rounded-xl border border-slate-200 bg-white p-4">
                    <View className="flex-row items-start justify-between gap-2">
                      <Text className="flex-1 font-semibold text-slate-900">{r.title}</Text>
                      {r.scope ? (
                        <View className="rounded-full bg-slate-100 px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-slate-600">
                            {SCOPE_LABEL[r.scope] ?? r.scope}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {r.description ? (
                      <Text className="mt-1 text-sm text-slate-500">{r.description}</Text>
                    ) : null}
                    {r.legacyTemplate ? (
                      <Text className="mt-1 text-[11px] text-slate-400">
                        replaces {r.legacyTemplate}
                      </Text>
                    ) : null}
                    {blocked ? (
                      <Text className="mt-2 text-xs text-amber-600">{blocked}</Text>
                    ) : null}

                    <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                      {FORMATS.map((f) => (
                        <Button
                          key={f.key}
                          label={f.label}
                          icon={f.icon}
                          tone={f.key === "pdf" ? "primary" : "secondary"}
                          onPress={() => run(r, f.key)}
                          disabled={blocked != null || busy != null}
                          pending={busy === `${r.key}:${f.key}`}
                        />
                      ))}
                    </View>
                    {busy?.startsWith(`${r.key}:`) ? (
                      <Text className="mt-2 text-xs text-slate-400">The portal is building it…</Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      <Sheet
        open={picking === "season"}
        onClose={() => setPicking(null)}
        title="Season"
        subtitle="Every report below runs for this one"
      >
        {seasonsReq.loading ? (
          <Loading />
        ) : (
          <ChoiceList
            choices={seasonChoices}
            selected={seasonId}
            onPick={(key) => {
              setSeasonId(Number(key));
              // A race belongs to its season; carrying one across would run a
              // report for a race the screen no longer names.
              setRaceId(null);
              setPicking(null);
            }}
            empty="No seasons to choose from."
          />
        )}
      </Sheet>

      <Sheet
        open={picking === "race"}
        onClose={() => setPicking(null)}
        title="Race"
        subtitle={season ? seasonLabel(season) : undefined}
      >
        {racesReq.loading ? (
          <Loading />
        ) : (
          <ChoiceList
            choices={raceChoices}
            selected={raceId}
            onPick={(key) => {
              setRaceId(Number(key));
              setPicking(null);
            }}
            empty={
              racesReq.forbidden
                ? "Choosing a race needs access to races, which is not part of yours."
                : "This season has no races yet."
            }
          />
        )}
      </Sheet>
    </Screen>
  );
}
