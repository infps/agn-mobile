import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useAdminData } from "@/hooks/useAdminData";
import { Empty, Loading, NoAccess, Notice, SearchBar, Truncated } from "@/components/admin/ui";

interface EventRow {
  id: number;
  name: string | null;
  shortName: string | null;
  eventDate: string | null;
  endDate: string | null;
  isOpen: number | null;
  isPrivate: boolean;
  locationAddress: string | null;
}

/**
 * Every event, as the way into everything else.
 *
 * Almost all admin work is scoped to one event, so this is the front door
 * rather than a report: pick the event, then its sections. Open events sort
 * first because those are the ones being worked on.
 */
export default function AdminEvents() {
  const { can } = usePermissions();
  const { isWide, isMedium, gutter } = useResponsive();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const { data, loading, refreshing, forbidden, error, refresh } =
    useAdminData<{ events: EventRow[] }>("/breeder/events");

  const events = data?.events ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? events.filter(
          (e) =>
            (e.name ?? "").toLowerCase().includes(q) ||
            (e.shortName ?? "").toLowerCase().includes(q) ||
            (e.locationAddress ?? "").toLowerCase().includes(q)
        )
      : events;
    // Open first, then newest.
    return [...matching].sort(
      (a, b) =>
        (b.isOpen ?? 0) - (a.isOpen ?? 0) ||
        new Date(b.eventDate ?? 0).getTime() - new Date(a.eventDate ?? 0).getTime()
    );
  }, [events, query]);

  if (forbidden || (!can("events.view") && !can("events.manage"))) {
    return <NoAccess what="Events" />;
  }

  const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">Events</Text>
      <Text className="mt-1 text-sm text-slate-500">
        {events.filter((e) => e.isOpen === 1).length} open of {events.length}
      </Text>

      <View className="mt-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Event name or place" />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <ScrollView
          className="mt-3 flex-1"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {error ? <Notice>{error}</Notice> : null}

          {results.length === 0 ? (
            <Empty>{events.length === 0 ? "No events yet." : "No event matches that search."}</Empty>
          ) : (
            <View className={isWide || isMedium ? "flex-row flex-wrap" : ""} style={{ gap: 10 }}>
              {results.slice(0, 60).map((event) => {
                const start = fmt(event.eventDate);
                const end = fmt(event.endDate);
                return (
                  <Pressable
                    key={event.id}
                    onPress={() =>
                      router.push(
                        `/(admin)/event-detail?eventId=${event.id}&name=${encodeURIComponent(
                          event.name ?? ""
                        )}` as never
                      )
                    }
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    style={{ flexGrow: 1, flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%" }}
                  >
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="min-w-0 flex-1">
                        <Text className="font-semibold text-slate-900" numberOfLines={1}>
                          {event.name ?? "Untitled event"}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {event.shortName ?? "—"}
                          {start ? ` · ${start}${end ? ` – ${end}` : ""}` : ""}
                        </Text>
                      </View>
                      <View
                        className={`rounded-full px-2 py-0.5 ${
                          event.isOpen === 1 ? "bg-emerald-100" : "bg-slate-200"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-medium ${
                            event.isOpen === 1 ? "text-emerald-700" : "text-slate-600"
                          }`}
                        >
                          {event.isOpen === 1 ? "open" : "closed"}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-3 flex-row items-center gap-1">
                      <Text className="text-sm font-medium text-blue-600">Open event</Text>
                      <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Truncated shown={Math.min(results.length, 60)} total={results.length} />
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}
