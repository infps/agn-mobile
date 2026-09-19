import React, { useMemo, useState } from "react";
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
  SearchBar,
  Screen,
  Truncated,
  money,
} from "@/components/admin/ui";

interface Defaulter {
  eventInventoryId: number;
  breederName: string;
  loft: string | null;
  cashPromised: boolean | null;
  balanceOwed: number;
  birds: { id: number }[];
}

/**
 * Entries that have not paid, once the deadline has passed.
 *
 * The server decides who counts — it is tied to a specific race date, not to
 * "owes money today" — so this only lists people while that window is open and
 * says so plainly when it is not. Guessing the rule here and having it disagree
 * with the portal would be worse than showing nothing.
 */
export default function EventDefaulters() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    defaulters?: Defaulter[];
    isInDefaulterWindow?: boolean;
    paymentRaceDate?: string | null;
  }>(eventId ? `/admin/event/${eventId}/defaulters` : null, [eventId]);

  const rows = data?.defaulters ?? [];
  const open = data?.isInDefaulterWindow ?? false;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (d) => d.breederName.toLowerCase().includes(q) || (d.loft ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (forbidden) return <NoAccess what="Defaulters" />;

  const owed = rows.reduce((s, d) => s + d.balanceOwed, 0);
  const birds = rows.reduce((s, d) => s + (d.birds?.length ?? 0), 0);
  const deadline = data?.paymentRaceDate
    ? new Date(data.paymentRaceDate).toLocaleDateString()
    : null;

  return (
    <Screen
      title="Defaulters"
      subtitle={
        open
          ? `${rows.length} entr${rows.length === 1 ? "y" : "ies"} past the deadline`
          : "The deadline has not passed yet"
      }
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        rows.length > 0 ? (
          <SearchBar value={query} onChange={setQuery} placeholder="Breeder or loft" />
        ) : undefined
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          {!open ? (
            <View className="mt-4">
              <Empty>
                Nobody counts as a defaulter until the payment race has run
                {deadline ? `, which is set for ${deadline}.` : "."}
              </Empty>
            </View>
          ) : (
            <>
              <FigureRow>
                <Figure label="Entries" value={rows.length} basis="31%" />
                <Figure label="Birds affected" value={birds} basis="31%" />
                <Figure label="Owed" value={money(owed)} tone="text-rose-600" basis="31%" />
              </FigureRow>

              <View className="mt-4">
                {results.length === 0 ? (
                  <Empty>
                    {rows.length === 0
                      ? "Everybody has paid."
                      : "No breeder matches that search."}
                  </Empty>
                ) : (
                  <Rows>
                    {results.map((d) => (
                      <Row
                        key={d.eventInventoryId}
                        title={d.breederName || "Unnamed"}
                        subtitle={`${d.loft ?? "No loft"} · ${d.birds?.length ?? 0} birds${
                          d.cashPromised ? " · cash promised" : ""
                        }`}
                        right={money(d.balanceOwed)}
                        rightTone="text-rose-600"
                      />
                    ))}
                  </Rows>
                )}
                <Truncated shown={results.length} total={results.length} />
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
