import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Button,
  ButtonRow,
  Empty,
  Loading,
  NoAccess,
  Notice,
  SearchBar,
  Truncated,
} from "@/components/admin/ui";
import { type AdminEvent, EventFormSheet } from "@/components/admin/EventFormSheet";
import { isStaff, isSuper, showDate, ymd } from "@/components/admin/formBits";

/**
 * Every event, as the way into everything else.
 *
 * Almost all admin work is scoped to one event, so this is the front door
 * rather than a report: pick the event, then its sections. Open events sort
 * first because those are the ones being worked on.
 *
 * Each card carries three ways in. The card itself opens the event's sections;
 * the two icons go to what the portal keeps in the event's header — its details
 * and its seasons — since those are about the event itself rather than anything
 * that happens inside it.
 *
 * An event without a season is an empty shell: every section under it reads
 * from the active season and will say it has none. So creating one leads
 * straight into opening its first season, with the dates carried across.
 * Making somebody do the two things in two places is how an event ends up
 * looking broken an hour after it was made.
 */
export default function AdminEvents() {
  const { canAny, role } = usePermissions();
  const { isWide, isMedium, gutter } = useResponsive();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, loading, refreshing, forbidden, error, refresh, reload } =
    useAdminData<{ events?: AdminEvent[] }>("/admin/event");

  const events = useMemo(() => data?.events ?? [], [data]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? events.filter((e) =>
          [e.name, e.shortName, e.locationAddress, e.eventType?.name].some((v) =>
            (v ?? "").toLowerCase().includes(q)
          )
        )
      : events;
    // Open first, then newest.
    return [...matching].sort(
      (a, b) =>
        (b.isOpen ?? 0) - (a.isOpen ?? 0) ||
        new Date(b.eventDate ?? 0).getTime() - new Date(a.eventDate ?? 0).getTime()
    );
  }, [events, query]);

  if (forbidden || !canAny("events.view", "events.manage")) {
    return <NoAccess what="Events" />;
  }

  // The event's own routes check the account's role, not a permission.
  const mayWrite = isStaff(role);

  const go = (route: string, event: AdminEvent, extra = "") =>
    router.push(
      `/(admin)/${route}?eventId=${event.id}&name=${encodeURIComponent(event.name ?? "")}${extra}` as never
    );

  const afterSave = (saved: AdminEvent) => {
    setCreating(false);
    reload();
    if (!saved?.id) return;
    // Only a super admin may open a season, so only they are taken to do it.
    if (isSuper(role)) {
      go(
        "event-seasons",
        saved,
        `&open=new&start=${ymd(saved.eventDate)}&end=${ymd(saved.endDate)}`
      );
    } else {
      go("event-settings", saved);
    }
  };

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">Events</Text>
      <Text className="mt-1 text-sm text-slate-500">
        {events.filter((e) => e.isOpen === 1).length} open of {events.length}
      </Text>

      <View className="mt-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Event name, type or place" />
      </View>

      {mayWrite ? (
        <ButtonRow>
          <Button label="New event" icon="add" onPress={() => setCreating(true)} />
        </ButtonRow>
      ) : null}

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
                const start = showDate(event.eventDate);
                const end = showDate(event.endDate);
                const open = event.isOpen === 1;
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => go("event-detail", event)}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    style={{ flexGrow: 1, flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%" }}
                  >
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="min-w-0 flex-1">
                        <Text className="font-semibold text-slate-900" numberOfLines={1}>
                          {event.name ?? "Untitled event"}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                          {[event.shortName, event.eventType?.name].filter(Boolean).join(" · ") || "—"}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                          {start ? `${start}${end ? ` – ${end}` : ""}` : "No date set"}
                          {event.createdBy?.name ? ` · by ${event.createdBy.name}` : ""}
                        </Text>
                      </View>
                      <View className="items-end" style={{ gap: 4 }}>
                        <View
                          className={`rounded-full px-2 py-0.5 ${open ? "bg-emerald-100" : "bg-slate-200"}`}
                        >
                          <Text
                            className={`text-[10px] font-medium ${
                              open ? "text-emerald-700" : "text-slate-600"
                            }`}
                          >
                            {open ? "open" : "closed"}
                          </Text>
                        </View>
                        {event.isPrivate ? (
                          <View className="flex-row items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5">
                            <Ionicons name="lock-closed" size={9} color="#b45309" />
                            <Text className="text-[10px] font-medium text-amber-700">private</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <View className="mt-3 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1">
                        <Text className="text-sm font-medium text-blue-600">Open event</Text>
                        <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                      </View>
                      <View className="flex-row" style={{ gap: 8 }}>
                        <Pressable
                          onPress={() => go("event-seasons", event)}
                          hitSlop={6}
                          className="flex-row items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          <Ionicons name="calendar-outline" size={14} color="#475569" />
                          <Text className="text-xs font-medium text-slate-600">Seasons</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => go("event-settings", event)}
                          hitSlop={6}
                          className="flex-row items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5"
                        >
                          <Ionicons name="information-circle-outline" size={14} color="#475569" />
                          <Text className="text-xs font-medium text-slate-600">Details</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Truncated shown={Math.min(results.length, 60)} total={results.length} where="the search" />
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <EventFormSheet
        open={creating}
        event={null}
        onClose={() => setCreating(false)}
        onSaved={afterSave}
      />
    </View>
  );
}
