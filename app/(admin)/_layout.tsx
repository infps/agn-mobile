import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Redirect, Slot, usePathname, useRouter } from "expo-router";
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
    permissions: ["events.view", "events.manage"],
  },
  {
    label: "Races",
    short: "Races",
    href: "/(admin)/races",
    icon: "flag-outline",
    permissions: ["races.view", "races.manage"],
  },
  {
    label: "Check-in",
    short: "Scan",
    href: "/(admin)/checkin",
    icon: "scan-outline",
    permissions: ["checkin.manage"],
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
    permissions: ["accounting.view", "payments.view"],
  },
];

export default function AdminLayout() {
  const { user, isLoading: authLoading } = useAuth();
  const { canAny, isAdminCapable, isLoading: permsLoading } = usePermissions();
  const { isWide, gutter } = useResponsive();
  const router = useRouter();
  const pathname = usePathname();

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

  const visible = NAV.filter((item) => canAny(...item.permissions));

  const isActive = (href: string) => pathname?.startsWith(href.replace("/(admin)", ""));

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

            <Pressable
              onPress={() => router.replace("/(app)/home")}
              className="mb-4 mt-2 flex-row items-center gap-2 rounded-lg px-3 py-2.5"
            >
              <Ionicons name="swap-horizontal-outline" size={18} color="#64748b" />
              <Text className="text-sm text-slate-500">Breeder view</Text>
            </Pressable>
          </View>
        )}

        <View className="flex-1">
          <Slot />
        </View>
      </View>

      {!isWide && (
        <View className="flex-row border-t border-slate-200 bg-white pb-1">
          {visible.map((item) => (
            <NavButton key={item.href} item={item} rail={false} />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
