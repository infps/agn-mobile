import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { usePermissions } from "@/context/PermissionContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useToast } from "@/context/ToastContext";
import { downloadAndShare } from "@/service/download.service";
import { EventPicker } from "@/components/admin/EventPicker";
import {
  Button,
  ButtonRow,
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
  Sheet,
} from "@/components/admin/ui";

/** The one parameter a report needs before it can run, if any. */
type Requires =
  | "seasonId"
  | "raceId"
  | "breederId"
  | "feeSchemeId"
  | "prizeSchemeId"
  | "bettingSchemeId"
  | null;

interface Report {
  key: string;
  title: string;
  description: string | null;
  scope: string | null;
  requires: Requires;
  legacyTemplate: string | null;
  isLabelSheet?: boolean;
}

const FORMATS: { key: string; label: string; hint: string }[] = [
  { key: "pdf", label: "PDF", hint: "For printing and handing round" },
  { key: "xlsx", label: "Spreadsheet", hint: "Opens in Excel or Sheets" },
  { key: "csv", label: "CSV", hint: "Plain text, for importing elsewhere" },
];

/**
 * The reports that exist, and running one.
 *
 * Every one of these is rendered by the portal, not here — PDF, spreadsheet and
 * CSV all come back as finished bytes from the same endpoint the web app uses.
 * So there is no second implementation to keep in step: this screen picks a
 * report, supplies the one parameter it needs, and hands whatever comes back to
 * the phone's share sheet.
 *
 * The share sheet is the point. A file saved into a downloads folder on a phone
 * is a dead end, but a file handed straight to mail, Drive or a spreadsheet app
 * is the thing somebody actually wanted when they asked for the report while
 * standing away from their desk.
 *
 * Where a report came across from the old system, its original template name is
 * shown — that is what people still call it out loud.
 */
export default function AdminReports() {
  const { can } = usePermissions();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [running, setRunning] = useState<Report | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [param, setParam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    reports?: Report[];
  }>("/admin/reports");

  const reports = useMemo(() => data?.reports ?? [], [data]);

  const needs = running?.requires ?? null;

  // Each parameter kind has its own source, and none of them is fetched until a
  // report that needs it is actually open.
  const seasonsReq = useAdminData<{ seasons?: { id: number; name: string | null; isActive: boolean }[] }>(
    needs === "seasonId" && eventId != null ? `/admin/event/${eventId}/seasons` : null,
    [needs, eventId]
  );
  const racesReq = useAdminData<{ races?: { id: number; name: string | null; raceNumber: number | null }[] }>(
    needs === "raceId" && eventId != null ? `/admin/race?eventId=${eventId}` : null,
    [needs, eventId]
  );
  const breedersReq = useAdminData<{ breeders?: { id: number; firstName: string | null; lastName: string | null }[] }>(
    needs === "breederId" ? "/admin/breeders" : null,
    [needs]
  );
  const schemesReq = useAdminData<any>(
    needs === "feeSchemeId"
      ? "/admin/fee-scheme"
      : needs === "prizeSchemeId"
        ? "/admin/prize-scheme"
        : needs === "bettingSchemeId"
          ? "/admin/betting-scheme"
          : null,
    [needs]
  );

  const paramChoices: Choice[] = useMemo(() => {
    if (needs === "seasonId") {
      return (seasonsReq.data?.seasons ?? []).map((s) => ({
        key: s.id,
        label: s.name ?? `Season ${s.id}`,
        hint: s.isActive ? "active" : null,
      }));
    }
    if (needs === "raceId") {
      return (racesReq.data?.races ?? []).map((r) => ({
        key: r.id,
        label: r.name ?? `Race ${r.raceNumber ?? r.id}`,
      }));
    }
    if (needs === "breederId") {
      return (breedersReq.data?.breeders ?? []).slice(0, 200).map((b) => ({
        key: b.id,
        label: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || `Breeder ${b.id}`,
      }));
    }
    if (needs?.endsWith("SchemeId")) {
      const list =
        schemesReq.data?.feeSchemes ??
        schemesReq.data?.prizeSchemes ??
        schemesReq.data?.bettingSchemes ??
        [];
      return list.map((s: { id: number; name: string }) => ({ key: s.id, label: s.name }));
    }
    return [];
  }, [needs, seasonsReq.data, racesReq.data, breedersReq.data, schemesReq.data]);

  const paramLoading =
    seasonsReq.loading || racesReq.loading || breedersReq.loading || schemesReq.loading;

  /** Season and race parameters are chosen within an event, so it is asked first. */
  const needsEvent = needs === "seasonId" || needs === "raceId";

  const run = async (format: string) => {
    if (!running) return;
    if (needs && param == null) {
      toast.error("Pick what to run it for first.");
      return;
    }

    setBusy(true);
    const query = new URLSearchParams({ format });
    if (needs && param != null) query.set(needs, String(param));

    const stamp = new Date().toISOString().slice(0, 10);
    const ext = format === "xlsx" ? "xlsx" : format;
    const result = await downloadAndShare(
      `/admin/reports/${running.key}?${query.toString()}`,
      `${running.key}-${stamp}.${ext}`
    );
    setBusy(false);

    if (result.ok) {
      setRunning(null);
      setParam(null);
    } else if (result.problem) {
      toast.error(result.problem);
    }
  };

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? reports.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q) ||
            (r.legacyTemplate ?? "").toLowerCase().includes(q)
        )
      : reports;

    const byScope = new Map<string, Report[]>();
    for (const report of matching) {
      const scope = report.scope ?? "other";
      if (!byScope.has(scope)) byScope.set(scope, []);
      byScope.get(scope)!.push(report);
    }
    return Array.from(byScope.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [reports, query]);

  if (forbidden || (!can("reports.view") && !can("reports.manage"))) {
    return <NoAccess what="Reports" />;
  }

  return (
    <Screen
      title="Reports"
      subtitle={`${reports.length} the portal can produce`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={<SearchBar value={query} onChange={setQuery} placeholder="Report name or purpose" />}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          {grouped.length === 0 ? (
            <View className="mt-4">
              <Empty>
                {reports.length === 0 ? "No reports are defined." : "No report matches that."}
              </Empty>
            </View>
          ) : (
            grouped.map(([scope, list]) => (
              <View key={scope}>
                <Text className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {scope.replace(/_/g, " ")}
                </Text>
                <Rows>
                  {list.map((r) => (
                    <Row
                      key={r.key}
                      title={r.title}
                      subtitle={r.description ?? undefined}
                      right={r.legacyTemplate ?? "Run"}
                      rightTone={r.legacyTemplate ? "text-slate-400" : "text-cyan-600"}
                      onPress={() => {
                        setParam(null);
                        setRunning(r);
                      }}
                    />
                  ))}
                </Rows>
              </View>
            ))
          )}
        </>
      )}

      <Sheet
        open={running != null}
        onClose={() => {
          if (!busy) setRunning(null);
        }}
        title={running?.title ?? "Run report"}
        subtitle={running?.description ?? undefined}
      >
        {needsEvent ? (
          <View className="mt-3">
            <Text className="mb-1 text-xs font-medium text-slate-600">Event</Text>
            <EventPicker value={eventId} onChange={(id) => setEventId(id)} />
          </View>
        ) : null}

        {needs ? (
          <>
            <Text className="mb-1 mt-3 text-xs font-medium text-slate-600">
              {needs === "seasonId"
                ? "Season"
                : needs === "raceId"
                  ? "Race"
                  : needs === "breederId"
                    ? "Breeder"
                    : "Scheme"}
            </Text>
            {paramLoading ? (
              <Loading />
            ) : (
              <ChoiceList
                choices={paramChoices}
                selected={param}
                onPick={(k) => setParam(Number(k))}
                empty="Nothing here to run it for."
              />
            )}
          </>
        ) : null}

        <Text className="mb-1 mt-4 text-xs font-medium text-slate-600">Format</Text>
        <View style={{ gap: 8 }}>
          {FORMATS.map((f) => (
            <View key={f.key}>
              <Button
                label={f.label}
                tone={f.key === "pdf" ? "primary" : "secondary"}
                icon="download-outline"
                onPress={() => run(f.key)}
                disabled={busy || (needs != null && param == null)}
                pending={busy}
                full
              />
              <Text className="mt-0.5 text-xs text-slate-400">{f.hint}</Text>
            </View>
          ))}
        </View>

        {busy ? (
          <Text className="mt-4 text-center text-xs text-slate-400">
            The portal is building it…
          </Text>
        ) : null}

        <ButtonRow>
          <Button
            label="Close"
            tone="secondary"
            onPress={() => setRunning(null)}
            disabled={busy}
            full
          />
        </ButtonRow>
      </Sheet>
    </Screen>
  );
}
