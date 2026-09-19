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
  money,
} from "@/components/admin/ui";

interface RaceClass {
  id: number;
  code: string | null;
  description: string | null;
  classFee: number | null;
  payoutType: string | null;
  przEntry: number | null;
  cutPercent: number | null;
  isActive: boolean | null;
  entryCount: number;
  pool: number;
}

/**
 * Optional side-pots people buy into on top of their entry.
 *
 * A class is a fee, a count and a pot, and the pot is the number anybody
 * actually wants — it is what will be paid out. Inactive classes stay listed
 * rather than hidden, because a class that took entries and was then switched
 * off is exactly the thing somebody comes here to check.
 */
export default function EventClasses() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    classes?: RaceClass[];
  }>(eventId ? `/admin/event/${eventId}/classes` : null, [eventId]);

  const classes = data?.classes ?? [];

  if (forbidden) return <NoAccess what="Classes" />;

  const entries = classes.reduce((s, c) => s + c.entryCount, 0);
  const pool = classes.reduce((s, c) => s + c.pool, 0);

  return (
    <Screen
      title="Classes"
      subtitle={name ? `${name} · ${classes.length} classes` : `${classes.length} classes`}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Classes" value={classes.length} basis="31%" />
            <Figure label="Entries" value={entries} basis="31%" />
            <Figure label="In the pot" value={money(pool)} tone="text-emerald-600" basis="31%" />
          </FigureRow>

          <View className="mt-4">
            {classes.length === 0 ? (
              <Empty>No classes have been set up for this season.</Empty>
            ) : (
              <Rows>
                {classes.map((c) => (
                  <Row
                    key={c.id}
                    title={c.code ?? `Class ${c.id}`}
                    subtitle={
                      [
                        c.description,
                        c.classFee != null ? `${money(c.classFee)} a bird` : null,
                        c.payoutType ? c.payoutType.toLowerCase().replace(/_/g, " ") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                    right={money(c.pool)}
                    rightSub={`${c.entryCount} entries`}
                    rightTone={c.pool > 0 ? "text-emerald-600" : "text-slate-400"}
                    badge={
                      c.isActive === false
                        ? { label: "off", bg: "bg-slate-200", text: "text-slate-600" }
                        : null
                    }
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
