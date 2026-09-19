import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { usePermissions } from "@/context/PermissionContext";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
} from "@/components/admin/ui";

interface Report {
  key: string;
  title: string;
  description: string | null;
  scope: string | null;
  requires: string[] | null;
  legacyTemplate: string | null;
}

/**
 * The reports that exist, and what each one is for.
 *
 * Generating one produces a file, and a file on a phone is a dead end — it
 * lands in a downloads folder nobody opens, and the reports here are the kind
 * that get printed and handed round. So this is a catalogue rather than a
 * generator: it answers "is there a report for that, and what is it called",
 * which is the question somebody asks while away from their desk.
 *
 * Where a report came across from the old system, its original template name is
 * shown — that is what people still call it out loud.
 */
export default function AdminReports() {
  const { can } = usePermissions();
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    reports?: Report[];
  }>("/admin/reports");

  const reports = data?.reports ?? [];

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
      subtitle={`${reports.length} available in the portal`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={<SearchBar value={query} onChange={setQuery} placeholder="Report name or purpose" />}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <Notice>
            Reports are generated and downloaded from the portal. This lists what exists.
          </Notice>

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
                      right={r.legacyTemplate ?? undefined}
                      rightTone="text-slate-400"
                    />
                  ))}
                </Rows>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
