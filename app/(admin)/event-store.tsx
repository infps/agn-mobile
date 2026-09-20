import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import {

  type Choice,
  ChoiceList,
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
  Sheet,
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

interface Breeder {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
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
  const { can } = usePermissions();
  const action = useAdminAction();
  const [filter, setFilter] = useState<Filter>("available");
  const [selling, setSelling] = useState<Listing | null>(null);
  const [buyerQuery, setBuyerQuery] = useState("");

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    listings?: Listing[];
  }>(eventId ? `/admin/event/${eventId}/store` : null, [eventId]);

  // Only once a sale is actually being recorded: the breeder list is long and
  // nobody browsing the store needs it loaded.
  const breedersReq = useAdminData<{ breeders?: Breeder[] }>(
    selling ? "/admin/breeders" : null,
    [selling?.id]
  );

  const listings = useMemo(() => data?.listings ?? [], [data]);
  const mayManage = can("store.manage");

  const isSold = (l: Listing) =>
    Boolean(l.purchasedBy) || (l.status ?? "").toUpperCase() === "SOLD";

  const rows = useMemo(
    () =>
      listings.filter((l) =>
        filter === "all" ? true : filter === "sold" ? isSold(l) : !isSold(l)
      ),
    [listings, filter]
  );

  const buyers: Choice[] = useMemo(() => {
    const all = breedersReq.data?.breeders ?? [];
    const q = buyerQuery.trim().toLowerCase();
    const matched = q
      ? all.filter((b) =>
          `${b.firstName ?? ""} ${b.lastName ?? ""} ${b.email ?? ""}`.toLowerCase().includes(q)
        )
      : all;
    return matched.slice(0, 40).map((b) => ({
      key: b.id,
      label: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.email || `Breeder ${b.id}`,
      hint: b.email,
    }));
  }, [breedersReq.data, buyerQuery]);

  const sell = async (buyerBreederId: string | number) => {
    if (!selling) return;
    const { ok } = await action.run(
      "post",
      `/admin/event/${eventId}/store/${selling.id}/purchase`,
      { buyerBreederId },
      { success: "Sale recorded." }
    );
    if (ok) {
      setSelling(null);
      setBuyerQuery("");
      reload();
    }
  };

  if (forbidden) return <NoAccess what="The event store" />;

  const sold = listings.filter(isSold);
  const takings = sold.reduce((s, l) => s + (l.price ?? 0), 0);

  const FILTERS: { key: Filter; label: string }[] = [
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
                      onPress={
                        mayManage && !isSold(l)
                          ? () => {
                              setBuyerQuery("");
                              setSelling(l);
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </Rows>
            )}
          </View>
        </>
      )}

      <Sheet
        open={selling != null}
        onClose={() => setSelling(null)}
        title="Record the sale"
        subtitle={`${money(selling?.price)} — pick the buyer`}
      >
        <View className="mt-2">
          <SearchBar value={buyerQuery} onChange={setBuyerQuery} placeholder="Search breeders" />
        </View>
        {breedersReq.loading ? (
          <Loading />
        ) : (
          <ChoiceList
            choices={buyers}
            onPick={sell}
            empty={buyerQuery ? "Nobody matches that." : "No breeders on this event."}
          />
        )}
        {action.pending ? (
          <Text className="mt-3 text-center text-xs text-slate-400">Recording…</Text>
        ) : null}
      </Sheet>
    </Screen>
  );
}
