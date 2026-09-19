import React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
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
  Screen,
} from "@/components/admin/ui";

interface Tournament {
  id: number;
  name: string;
  cutMode: string;
  cutValue: number;
  status: string;
  entryCount: number;
  aliveCount: number;
}

const STATUS: Record<string, { bg: string; text: string }> = {
  SETUP: { bg: "bg-slate-200", text: "text-slate-600" },
  RUNNING: { bg: "bg-emerald-100", text: "text-emerald-700" },
  FINISHED: { bg: "bg-blue-100", text: "text-blue-700" },
};

/**
 * Knockouts, and how many birds are still in them.
 *
 * The one number that matters is survivors against starters — a knockout is
 * defined by what it has eliminated. Advancing a round is left to the portal:
 * a cut is irreversible and decided against a full results table, which is not
 * a thing to do from a phone between baskets.
 */
export default function EventKnockout() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    tournaments?: Tournament[];
  }>(eventId ? `/admin/event/${eventId}/tournaments` : null, [eventId]);

  const rows = data?.tournaments ?? [];

  if (forbidden) return <NoAccess what="Knockout" />;

  const alive = rows.reduce((s, t) => s + t.aliveCount, 0);
  const entered = rows.reduce((s, t) => s + t.entryCount, 0);

  const cut = (t: Tournament) =>
    t.cutMode === "TOP_PERCENT"
      ? `top ${t.cutValue}%`
      : t.cutMode === "TOP_N"
        ? `top ${t.cutValue}`
        : t.cutMode.toLowerCase().replace(/_/g, " ");

  return (
    <Screen
      title="Knockout"
      subtitle={name ? `${name} · ${rows.length} running` : `${rows.length} running`}
      onRefresh={refresh}
      refreshing={refreshing}
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

          <View className="mt-4">
            {rows.length === 0 ? (
              <Empty>No knockouts have been set up for this season.</Empty>
            ) : (
              <Rows>
                {rows.map((t) => (
                  <Row
                    key={t.id}
                    title={t.name}
                    subtitle={`Cut to ${cut(t)}`}
                    right={`${t.aliveCount} of ${t.entryCount}`}
                    rightSub="still in"
                    rightTone={t.aliveCount > 0 ? "text-emerald-600" : "text-slate-400"}
                    badge={{
                      label: t.status.toLowerCase(),
                      ...(STATUS[t.status] ?? STATUS.SETUP),
                    }}
                  />
                ))}
              </Rows>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
