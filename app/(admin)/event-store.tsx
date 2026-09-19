import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
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

interface Listing {
  id: number;
  price: number | null;
  status: string | null;
  createdAt: string;
  originalBreeder?: { firstName: string | null; lastName: string | null } | null;
  purchasedBy?: { firstName: string | null; lastName: string | null } | null;
  items?: { id: number; inventoryItem?: { bird?: { band: string | null } | null } | null }[];
}

type Filter = "available" | "sold" | "all";

/**
 * Birds forfeited by defaulters, and who bought them.
 *
 * Two questions, and the split between them is the screen: what is still for
 * sale, and what has gone. Available comes first because that is the list
 * somebody reads out loud at an event.
 */
export default function EventStore() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [filter, setFilter] = useState<Filter>("available");

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    listings?: Listing[];
  }>(eventId ? `/admin/event/${eventId}/store` : null, [eventId]);

  const listings = data?.listings ?? [];

  const isSold = (l: Listing) =>
    Boolean(l.purchasedBy) || (l.status ?? "").toUpperCase() === "SOLD";

  const rows = useMemo(
    () =>
      listings.filter((l) =>
        filter === "all" ? true : filter === "sold" ? isSold(l) : !isSold(l)
      ),
    [listings, filter]
  );

  if (forbidden) return <NoAccess what="The event store" />;

  const sold = listings.filter(isSold);
  const takings = sold.reduce((s, l) => s + (l.price ?? 0), 0);

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: "available", label: `For sale (${listings.length - sold.length})` },
    { key: "sold", label: `Sold (${sold.length})` },
    { key: "all", label: "All" },
  ];

  return (
    <Screen
      title="Store"
      subtitle={name ?? undefined}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                className={`flex-1 rounded-lg py-2 ${active ? "bg-blue-600" : ""}`}
              >
                <Text
                  className={`text-center text-xs font-medium ${
                    active ? "text-white" : "text-slate-600"
                  }`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Listings" value={listings.length} basis="31%" />
            <Figure label="Sold" value={sold.length} basis="31%" />
            <Figure label="Taken" value={money(takings)} tone="text-emerald-600" basis="31%" />
          </FigureRow>

          <View className="mt-4">
            {rows.length === 0 ? (
              <Empty>
                {listings.length === 0
                  ? "Nothing has been listed in the store."
                  : filter === "available"
                    ? "Everything listed has sold."
                    : "Nothing has sold yet."}
              </Empty>
            ) : (
              <Rows>
                {rows.map((l) => {
                  const bands = (l.items ?? [])
                    .map((i) => i.inventoryItem?.bird?.band)
                    .filter(Boolean);
                  const from = `${l.originalBreeder?.firstName ?? ""} ${
                    l.originalBreeder?.lastName ?? ""
                  }`.trim();
                  const to = `${l.purchasedBy?.firstName ?? ""} ${
                    l.purchasedBy?.lastName ?? ""
                  }`.trim();
                  return (
                    <Row
                      key={l.id}
                      title={bands.length > 0 ? bands.join(", ") : `Listing ${l.id}`}
                      subtitle={
                        [from ? `from ${from}` : null, to ? `to ${to}` : null]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      right={money(l.price)}
                      rightSub={isSold(l) ? "sold" : "for sale"}
                      rightTone={isSold(l) ? "text-emerald-600" : "text-slate-900"}
                    />
                  );
                })}
              </Rows>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
