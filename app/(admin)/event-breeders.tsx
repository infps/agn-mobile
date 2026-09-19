import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
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

interface Registration {
  id: number;
  loft: string | null;
  cashPromised: boolean | null;
  breeder: { id: number; firstName: string | null; lastName: string | null; city1: string | null; state1: string | null } | null;
  _count?: { items?: number };
  items?: { id: number }[];
  payments?: { status: string; paymentValue: number | null }[];
}

/**
 * Who is entered in this event, and whether they have paid.
 *
 * The portal's Breeders tab is a wide table. On a phone the two facts that
 * actually get looked up standing in a loft are the bird count and the money,
 * so those are the row; everything else is a tap away in the directory.
 */
export default function EventBreeders() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    eventInventory?: Registration[];
  }>(eventId ? `/admin/event/${eventId}/event-inventory` : null, [eventId]);

  const rows: Registration[] = data?.eventInventory ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const who = `${r.breeder?.firstName ?? ""} ${r.breeder?.lastName ?? ""}`.toLowerCase();
      return who.includes(q) || (r.loft ?? "").toLowerCase().includes(q);
    });
  }, [rows, query]);

  if (forbidden) return <NoAccess what="Breeder registrations" />;

  const birdsOf = (r: Registration) => r._count?.items ?? r.items?.length ?? 0;
  const paidOf = (r: Registration) =>
    (r.payments ?? [])
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + (p.paymentValue ?? 0), 0);

  const totalBirds = rows.reduce((s, r) => s + birdsOf(r), 0);
  const totalPaid = rows.reduce((s, r) => s + paidOf(r), 0);

  return (
    <Screen
      title="Breeders"
      subtitle={name ? `${name} · ${rows.length} entered` : `${rows.length} entered`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={<SearchBar value={query} onChange={setQuery} placeholder="Breeder or loft" />}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Registrations" value={rows.length} basis="31%" />
            <Figure label="Birds entered" value={totalBirds} basis="31%" />
            <Figure label="Collected" value={money(totalPaid)} tone="text-emerald-600" basis="31%" />
          </FigureRow>

          <View className="mt-4">
            {results.length === 0 ? (
              <Empty>
                {rows.length === 0 ? "Nobody is entered yet." : "No breeder matches that search."}
              </Empty>
            ) : (
              <Rows>
                {results.slice(0, 150).map((r) => {
                  const who =
                    `${r.breeder?.firstName ?? ""} ${r.breeder?.lastName ?? ""}`.trim() ||
                    `Registration ${r.id}`;
                  const paid = paidOf(r);
                  return (
                    <Row
                      key={r.id}
                      title={who}
                      subtitle={
                        [r.loft, [r.breeder?.city1, r.breeder?.state1].filter(Boolean).join(", ")]
                          .filter(Boolean)
                          .join(" · ") || "No loft"
                      }
                      right={`${birdsOf(r)} birds`}
                      rightSub={paid > 0 ? money(paid) : r.cashPromised ? "cash promised" : "unpaid"}
                      rightTone={paid > 0 ? "text-emerald-600" : "text-slate-600"}
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated shown={Math.min(results.length, 150)} total={results.length} />
          </View>
        </>
      )}
    </Screen>
  );
}
