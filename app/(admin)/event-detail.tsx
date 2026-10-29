import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useAdminData } from "@/hooks/useAdminData";
import { chooseSeason, useChosenSeason } from "@/service/season.service";
import { Figure, FigureRow, Loading, NoAccess, money } from "@/components/admin/ui";

/**
 * One event, and the way into its nineteen sections.
 *
 * The portal puts these in a tab strip across the top, which is exactly the
 * arrangement that stops working past about seven. A phone cannot pretend
 * otherwise, so the sections are a list you choose from and then return to —
 * the same structure, read the way a small screen reads.
 *
 * They carry the portal's grouping: setting the event up, running the racing,
 * handling the money, publishing to breeders. Each is gated on the same
 * permission its section is, so somebody sees exactly the sections they could
 * open in the portal and no dead ends.
 */
interface Section {
  key: string;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Any one is enough. Where the portal has the same tab this is exactly the
   * single permission its tab strip checks (`tabAllowed` in the portal's
   * admin/events/[eventId]/page.tsx), so a section shows here iff it shows there.
   */
  permissions: string[];
  /** Sections not yet built on mobile route nowhere; they are simply absent. */
  route?: string;
}

interface Group {
  label: string;
  sections: Section[];
}

const GROUPS: Group[] = [
  {
    label: "Setup",
    sections: [
      { key: "details", label: "Details", hint: "Dates, location, contact and schemes", icon: "information-circle-outline", permissions: ["events.view"], route: "/(admin)/event-settings" },
      { key: "seasons", label: "Seasons", hint: "Open, clone and switch seasons", icon: "layers-outline", permissions: ["events.view", "events.manage"], route: "/(admin)/event-seasons" },
      { key: "breeders", label: "Breeders", hint: "Who is entered", icon: "people-outline", permissions: ["breeders.view"], route: "/(admin)/event-breeders" },
      // The portal shows its Birds tab on birds.view (the list itself is served
      // by the registrations route, which answers to breeders.view|manage).
      { key: "birds", label: "Birds", hint: "Every bird in the loft", icon: "egg-outline", permissions: ["birds.view"], route: "/(admin)/event-birds" },
      { key: "groups", label: "Groups", hint: "Sections and vaccinations", icon: "albums-outline", permissions: ["groups.view"], route: "/(admin)/event-groups" },
      { key: "baskets", label: "Baskets", hint: "Loft and race baskets", icon: "cube-outline", permissions: ["baskets.view"], route: "/(admin)/event-baskets" },
      { key: "stations", label: "Stations", hint: "Liberation points", icon: "location-outline", permissions: ["stations.view"], route: "/(admin)/event-stations" },
      { key: "checkin", label: "Check-in", hint: "Link tags and place arriving birds", icon: "scan-outline", permissions: ["checkin.view", "checkin.manage"], route: "/(admin)/checkin" },
      { key: "scanners", label: "Scanners", hint: "Which reader feeds which section", icon: "radio-outline", permissions: ["scanners.view", "scanners.manage"], route: "/(admin)/event-scanners" },
      { key: "presets", label: "Status presets", hint: "The statuses a race day uses", icon: "pricetag-outline", permissions: ["events.manage"], route: "/(admin)/status-presets" },
    ],
  },
  {
    label: "Racing",
    sections: [
      { key: "races", label: "Races", hint: "Schedule and live control", icon: "flag-outline", permissions: ["races.view"], route: "/(admin)/races" },
      { key: "result", label: "Result", hint: "Positions and prizes", icon: "trophy-outline", permissions: ["races.view"], route: "/(admin)/event-result" },
      { key: "averages", label: "Averages", hint: "Multi-race standings", icon: "stats-chart-outline", permissions: ["races.view"], route: "/(admin)/event-averages" },
      { key: "tournaments", label: "Knockout", hint: "Rounds and cuts", icon: "git-branch-outline", permissions: ["tournaments.view"], route: "/(admin)/event-knockout" },
      { key: "classes", label: "Classes", hint: "Class entries and payouts", icon: "ribbon-outline", permissions: ["classes.view"], route: "/(admin)/event-classes" },
    ],
  },
  {
    label: "Money",
    sections: [
      { key: "accounting", label: "Accounting", hint: "Ledger and statements", icon: "cash-outline", permissions: ["accounting.view"], route: "/(admin)/accounting" },
      { key: "defaulters", label: "Defaulters", hint: "Unpaid entries", icon: "alert-circle-outline", permissions: ["payments.view"], route: "/(admin)/event-defaulters" },
      { key: "betting", label: "Betting", hint: "Pools and cash bets", icon: "dice-outline", permissions: ["betting.view"], route: "/(admin)/event-betting" },
      { key: "calcutta", label: "Calcutta", hint: "Live auction", icon: "hammer-outline", permissions: ["calcutta.view"], route: "/(admin)/event-calcutta" },
      { key: "store", label: "Store", hint: "Defaulter birds for sale", icon: "storefront-outline", permissions: ["store.view"], route: "/(admin)/event-store" },
    ],
  },
  {
    label: "Publish",
    sections: [
      { key: "messages", label: "Messages", hint: "Broadcast to breeders", icon: "chatbubbles-outline", permissions: ["messages.view"], route: "/(admin)/event-messages" },
      { key: "history", label: "History", hint: "Archived races by year", icon: "time-outline", permissions: ["birds.view"], route: "/(admin)/event-history" },
      { key: "content", label: "Rules & videos", hint: "Rules, fees and videos", icon: "document-text-outline", permissions: ["content.view"], route: "/(admin)/event-rules" },
    ],
  },
];

interface Stats {
  breederCount?: number;
  totalBirds?: number;
  activeBirds?: number;
  lostBirds?: number;
  totalCollected?: number;
  prizePool?: number;
  seasonName?: string | null;
  displayStatus?: string | null;
}

export default function AdminEventDetail() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can, canAny } = usePermissions();
  const { isWide, isMedium, gutter } = useResponsive();
  const router = useRouter();

  // Set from the Seasons section. While it is, every section below works in
  // that season instead of the active one.
  const season = useChosenSeason(eventId);

  const stats = useAdminData<Stats>(
    eventId ? `/admin/event/${eventId}/dashboard-stats` : null,
    [eventId, season?.id]
  );

  if (!can("events.view") && !can("events.manage")) {
    return <NoAccess what="Events" />;
  }

  const groups = GROUPS.map((group) => ({
    ...group,
    // A section with no mobile screen yet is left out rather than shown dead.
    sections: group.sections.filter((s) => s.route && canAny(...s.permissions)),
  })).filter((group) => group.sections.length > 0);

  const s = stats.data;

  return (
    <ScrollView style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Pressable onPress={() => router.back()} className="mb-3 flex-row items-center gap-1">
        <Ionicons name="chevron-back" size={16} color="#2563eb" />
        <Text className="text-sm font-medium text-blue-600">Events</Text>
      </Pressable>

      <Text className="text-2xl font-bold text-slate-900">{name || "Event"}</Text>
      <Text className="mt-1 text-sm text-slate-500">
        {[s?.seasonName, s?.displayStatus].filter(Boolean).join(" · ") || "Season not set"}
      </Text>

      {season ? (
        <Pressable
          onPress={() => chooseSeason(String(eventId), null)}
          className="mt-3 flex-row items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <Ionicons name="layers-outline" size={16} color="#b45309" />
          <Text className="flex-1 text-xs text-amber-800">
            Working in {season.name || `season ${season.id}`}, not the active season. Everything
            below reads and writes it.
          </Text>
          <Text className="text-xs font-semibold text-amber-800">Back to active</Text>
        </Pressable>
      ) : null}

      {stats.loading ? (
        <Loading />
      ) : stats.forbidden ? null : (
        <FigureRow>
          <Figure label="Breeders" value={s?.breederCount ?? 0} />
          <Figure label="Birds here" value={s?.activeBirds ?? s?.totalBirds ?? 0} />
          <Figure label="Collected" value={money(s?.totalCollected)} tone="text-emerald-600" />
          <Figure label="Prize pool" value={money(s?.prizePool)} tone="text-blue-600" />
        </FigureRow>
      )}

      {groups.map((group) => (
        <View key={group.label}>
          <Text className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {group.label}
          </Text>

          <View className={isWide || isMedium ? "flex-row flex-wrap" : ""} style={{ gap: 10 }}>
            {group.sections.map((section) => (
              <Pressable
                key={section.key}
                onPress={() =>
                  router.push(
                    `${section.route}?eventId=${eventId}&name=${encodeURIComponent(
                      String(name ?? "")
                    )}` as never
                  )
                }
                className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
                style={{
                  flexGrow: 1,
                  flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%",
                }}
              >
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                  <Ionicons name={section.icon} size={18} color="#475569" />
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-slate-900">{section.label}</Text>
                  <Text className="text-xs text-slate-500">{section.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
