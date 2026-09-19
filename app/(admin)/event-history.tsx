import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
  Truncated,
} from "@/components/admin/ui";

interface Entry {
  id: number;
  action: string;
  detail: string | null;
  createdAt: string;
  performedBy?: { name: string | null } | null;
  eventInventoryItem?: {
    bird?: { band: string | null; birdName: string | null } | null;
  } | null;
  bird?: { band: string | null } | null;
}

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  REGISTERED: "add-circle-outline",
  CHECKED_IN: "checkmark-circle-outline",
  STATUS_CHANGED: "swap-horizontal-outline",
  BASKET_ASSIGNED: "cube-outline",
  SUBSTITUTED: "repeat-outline",
  RETURNED: "arrow-undo-outline",
  LOST: "alert-circle-outline",
};

/**
 * Everything that has happened to the birds in this event, newest first.
 *
 * This is the record you reach for when somebody disputes what was done to
 * their bird, so it stays a plain chronological log — no grouping, no
 * summarising, and the person who did it named on every line. A log that has
 * been tidied is a log you cannot rely on in an argument.
 */
export default function EventHistory() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    history?: Entry[];
  }>(eventId ? `/admin/event/${eventId}/bird-history` : null, [eventId]);

  const history = data?.history ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => {
      const band =
        h.eventInventoryItem?.bird?.band ?? h.bird?.band ?? "";
      return (
        band.toLowerCase().includes(q) ||
        h.action.toLowerCase().includes(q) ||
        (h.detail ?? "").toLowerCase().includes(q) ||
        (h.performedBy?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [history, query]);

  if (forbidden) return <NoAccess what="Bird history" />;

  return (
    <Screen
      title="History"
      subtitle={name ? `${name} · ${history.length} entries` : `${history.length} entries`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={<SearchBar value={query} onChange={setQuery} placeholder="Band, action or person" />}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4">
            {results.length === 0 ? (
              <Empty>
                {history.length === 0
                  ? "Nothing has been recorded against this event's birds yet."
                  : "Nothing matches that search."}
              </Empty>
            ) : (
              <Rows>
                {results.slice(0, 200).map((h) => {
                  const band =
                    h.eventInventoryItem?.bird?.band ?? h.bird?.band ?? "Unknown bird";
                  return (
                    <Row
                      key={h.id}
                      leading={
                        <Ionicons
                          name={ICON[h.action] ?? "ellipse-outline"}
                          size={16}
                          color="#94a3b8"
                        />
                      }
                      title={`${band} · ${h.action.toLowerCase().replace(/_/g, " ")}`}
                      subtitle={
                        [h.detail, h.performedBy?.name].filter(Boolean).join(" · ") || undefined
                      }
                      right={new Date(h.createdAt).toLocaleDateString()}
                      rightSub={new Date(h.createdAt).toLocaleTimeString()}
                      rightTone="text-slate-400"
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
