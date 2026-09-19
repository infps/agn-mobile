import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
} from "@/components/admin/ui";

interface Item {
  id: number;
  birdId: number | null;
  bird: {
    id: number;
    band: string | null;
    birdName: string | null;
    color: string | null;
    sex: string | null;
    rfid: string | null;
    attention: string | null;
  } | null;
  currentGroup?: { id: number; name: string | null } | null;
  statusGroup?: { id: number; name: string | null } | null;
  eventInventory?: {
    loft: string | null;
    breeder?: { firstName: string | null; lastName: string | null } | null;
  } | null;
}

type Filter = "all" | "tagged" | "untagged" | "attention";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "tagged", label: "Tagged" },
  { key: "untagged", label: "No tag" },
  { key: "attention", label: "Attention" },
];

/**
 * Every bird in this event's loft.
 *
 * Filters rather than columns: the questions asked here are which birds still
 * need a tag and which ones are flagged, and both are a yes-or-no that a table
 * column answers badly on a narrow screen.
 */
export default function EventBirds() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const router = useRouter();

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    eventInventoryItems?: Item[];
  }>(eventId ? `/admin/event/${eventId}/event-inventory-items` : null, [eventId]);

  const items = data?.eventInventoryItems ?? [];

  const tagged = items.filter((i) => i.bird?.rfid).length;
  const flagged = items.filter((i) => i.bird?.attention).length;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "tagged" && !i.bird?.rfid) return false;
      if (filter === "untagged" && i.bird?.rfid) return false;
      if (filter === "attention" && !i.bird?.attention) return false;
      if (!q) return true;
      const who = `${i.eventInventory?.breeder?.firstName ?? ""} ${
        i.eventInventory?.breeder?.lastName ?? ""
      }`.toLowerCase();
      return (
        (i.bird?.band ?? "").toLowerCase().includes(q) ||
        (i.bird?.birdName ?? "").toLowerCase().includes(q) ||
        (i.eventInventory?.loft ?? "").toLowerCase().includes(q) ||
        who.includes(q)
      );
    });
  }, [items, query, filter]);

  if (forbidden) return <NoAccess what="Birds" />;

  return (
    <Screen
      title="Birds"
      subtitle={name ? `${name} · ${items.length} in the loft` : `${items.length} in the loft`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Band, name, loft or breeder" />
          <View className="mt-2 flex-row rounded-xl border border-slate-200 bg-white p-1">
            {FILTERS.map((f) => {
              const active = f.key === filter;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  className={`flex-1 rounded-lg py-1.5 ${active ? "bg-blue-600" : ""}`}
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
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Birds" value={items.length} basis="31%" />
            <Figure label="Tagged" value={tagged} tone="text-emerald-600" basis="31%" />
            <Figure label="Flagged" value={flagged} tone="text-amber-600" basis="31%" />
          </FigureRow>

          <View className="mt-4">
            {results.length === 0 ? (
              <Empty>
                {items.length === 0
                  ? "No birds registered to this event yet."
                  : "No bird matches that filter."}
              </Empty>
            ) : (
              <Rows>
                {results.slice(0, 200).map((item) => {
                  const who =
                    `${item.eventInventory?.breeder?.firstName ?? ""} ${
                      item.eventInventory?.breeder?.lastName ?? ""
                    }`.trim() || item.eventInventory?.loft || "Unassigned";
                  return (
                    <Row
                      key={item.id}
                      title={`${item.bird?.band ?? "No band"}${
                        item.bird?.birdName ? ` · ${item.bird.birdName}` : ""
                      }`}
                      subtitle={`${who}${
                        item.currentGroup?.name ? ` · ${item.currentGroup.name}` : ""
                      }`}
                      leading={
                        <Ionicons
                          name={item.bird?.rfid ? "radio" : "radio-outline"}
                          size={16}
                          color={item.bird?.rfid ? "#059669" : "#cbd5e1"}
                        />
                      }
                      badge={
                        item.bird?.attention
                          ? { label: "attention", bg: "bg-amber-100", text: "text-amber-700" }
                          : null
                      }
                      onPress={
                        item.bird?.id
                          ? () => router.push(`/(admin)/bird-detail?birdId=${item.bird!.id}` as never)
                          : undefined
                      }
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated shown={Math.min(results.length, 200)} total={results.length} />
          </View>
        </>
      )}
    </Screen>
  );
}
