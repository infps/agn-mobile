import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Redirect, Slot, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";

/**
 * The admin shell.
 *
 * Mirrors the ERP: the same modules, gated by the same permissions, from the
 * same endpoint. On a tablet the navigation sits permanently beside the content;
 * on a phone it becomes a bottom bar, because a rail would eat half the screen.
 */
interface NavItem {
  label: string;
  short: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Any one of these is enough to show the item. */
  permissions: string[];
}

const NAV: NavItem[] = [
  {
    label: "Overview",
    short: "Home",
    href: "/(admin)/dashboard",
    icon: "grid-outline",
    permissions: ["events.view", "races.view"],
  },
  {
    label: "Events",
    short: "Events",
    href: "/(admin)/events",
    icon: "calendar-outline",
    // The portal sidebar's Events item checks events.view alone.
    permissions: ["events.view"],
  },
  {
    label: "Races",
    short: "Races",
    href: "/(admin)/races",
    icon: "flag-outline",
    // The portal's Races tab checks races.view alone.
    permissions: ["races.view"],
  },
  {
    label: "Check-in",
    short: "Scan",
    href: "/(admin)/checkin",
    icon: "scan-outline",
    permissions: ["checkin.view", "checkin.manage"],
  },
  {
    label: "Breeders",
    short: "People",
    href: "/(admin)/breeders",
    icon: "people-outline",
    permissions: ["breeders.view", "breeders.manage"],
  },
  {
    label: "Accounting",
    short: "Money",
    href: "/(admin)/accounting",
    icon: "cash-outline",
    // The portal's Accounting tab checks accounting.view alone.
    permissions: ["accounting.view"],
  },
  {
    label: "More",
    short: "More",
    href: "/(admin)/more",
    icon: "ellipsis-horizontal",
    // Always reachable: it holds sign-out and the explanation of why a section
    // is missing, which is exactly what somebody with little access needs.
    permissions: [],
  },
];

export default function AdminLayout() {
  const { user, isLoading: authLoading } = useAuth();
  const { canAny, isAdminCapable, isLoading: permsLoading } = usePermissions();
  const { isWide, gutter } = useResponsive();
  const router = useRouter();
  const pathname = usePathname();
  const { raceId } = useGlobalSearchParams<{ raceId?: string }>();

  if (authLoading || permsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  // Somebody with no admin permission has no business here, and sending them to
  // an empty shell would look broken rather than intentional.
  if (!isAdminCapable) return <Redirect href="/(app)/home" />;

  // An empty permission list means "always available" — canAny would say false
  // for it, since nothing in an empty set can match.
  const visible = NAV.filter(
    (item) => item.permissions.length === 0 || canAny(...item.permissions)
  );

  // A rail has room for everything. A bottom bar does not: past five, the
  // labels shrink to the point of being decoration, so the tail folds into
  // More — which is where it would have been looked for anyway.
  const BAR_SLOTS = 4;
  const barItems =
    visible.length <= BAR_SLOTS + 1
      ? visible
      : [
          ...visible.filter((i) => i.href !== "/(admin)/more").slice(0, BAR_SLOTS),
          ...visible.filter((i) => i.href === "/(admin)/more"),
        ];

  const isActive = (href: string) => pathname?.startsWith(href.replace("/(admin)", ""));

  // The shell renders screens through a Slot, which keeps history but draws no
  // header, and an iPhone has no back button of its own. So the shell draws the
  // one back button, top left, on every screen that is not a tab root.
  //
  // A tab root is whatever the navigation shows right now: everything on the
  // tablet rail, but only the bottom-bar items on a phone. Breeders or
  // Accounting folded into More are somewhere you went *from* More, so they get
  // a back button there. Check-in is a root from the nav, but the same screen
  // opened from a race (with a raceId) is clocking arrivals for that race.
  const rootPaths = (isWide ? visible : barItems).map((item) =>
    item.href.replace("/(admin)", "")
  );
  const isRoot = rootPaths.includes(pathname ?? "") && !(pathname === "/checkin" && raceId);
  const showBack = pathname != null && !isRoot;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(admin)/dashboard");
  };

  const NavButton = ({ item, rail }: { item: NavItem; rail: boolean }) => {
    const active = isActive(item.href);
    return (
      <Pressable
        onPress={() => router.push(item.href as never)}
        className={`${rail ? "flex-row items-center gap-3 rounded-lg px-3 py-2.5" : "flex-1 items-center py-2"} ${
          active && rail ? "bg-blue-50" : ""
        }`}
      >
        <Ionicons
          name={item.icon}
          size={rail ? 20 : 22}
          color={active ? "#2563eb" : "#64748b"}
        />
        <Text
          className={`${rail ? "text-sm" : "text-[11px] mt-0.5"} ${
            active ? "text-blue-600 font-semibold" : "text-slate-500"
          }`}
        >
          {rail ? item.label : item.short}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className={isWide ? "flex-1 flex-row" : "flex-1"}>
        {isWide && (
          <View
            className="border-r border-slate-200 bg-white"
            style={{ width: 232, paddingHorizontal: 12, paddingTop: gutter }}
          >
            <View className="px-3 pb-4">
              <Text className="text-lg font-bold text-slate-900">Pigeon Pulse</Text>
              <Text className="text-xs text-slate-500">Race operations</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {visible.map((item) => (
                <NavButton key={item.href} item={item} rail />
              ))}
            </ScrollView>

          </View>
        )}

        <View className="flex-1">
          {showBack && (
            <View
              className="flex-row items-center border-b border-slate-200 bg-white"
              style={{ paddingHorizontal: gutter - 6, height: 44 }}
            >
              <Pressable
                onPress={goBack}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                className="flex-row items-center gap-0.5 py-2 pr-3"
              >
                <Ionicons name="chevron-back" size={24} color="#2563eb" />
                <Text className="text-base font-medium text-blue-600">Back</Text>
              </Pressable>
            </View>
          )}
          <Slot />
        </View>
      </View>

      {!isWide && (
        <View className="flex-row border-t border-slate-200 bg-white pb-1">
          {barItems.map((item) => (
            <NavButton key={item.href} item={item} rail={false} />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
