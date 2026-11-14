import React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { Screen } from "@/components/admin/ui";

/**
 * Everything that is not tied to a single event.
 *
 * The bottom bar holds five things before it starts feeling like a menu, and
 * the day-to-day five are already there. What is left — the bird register, user
 * approvals, the report catalogue — is reached occasionally and belongs behind
 * one tap rather than competing for a permanent slot.
 */
interface Item {
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  /**
   * Any one is enough. Empty means everybody. Where the portal sidebar has the
   * same item this is exactly its single `permission` (components/app-sidebar).
   */
  permissions: string[];
  /**
   * Set where the portal checks the role itself rather than a permission — its
   * route, or its sidebar's "Administration" group, which is SUPERADMIN-only.
   */
  superAdminOnly?: boolean;
}

const ITEMS: Item[] = [
  {
    label: "Birds",
    hint: "Look up any band number on record",
    icon: "egg-outline",
    route: "/(admin)/birds",
    permissions: ["birds.view"],
  },
  {
    label: "Users",
    hint: "Approve sign-ups and see accounts",
    icon: "person-add-outline",
    route: "/(admin)/users",
    permissions: ["users.view"],
  },
  {
    label: "Permissions",
    hint: "What each role and person may do",
    icon: "shield-checkmark-outline",
    route: "/(admin)/permissions",
    permissions: ["users.permissions"],
    superAdminOnly: true,
  },
  {
    label: "Schemes",
    hint: "What an entry costs and what a place pays",
    icon: "pricetags-outline",
    route: "/(admin)/schemes",
    permissions: ["schemes.manage"],
  },
  {
    label: "Reports",
    hint: "What the portal can produce",
    icon: "document-text-outline",
    route: "/(admin)/reports",
    // The report routes ask for view; manage alone is refused by them.
    permissions: ["reports.view"],
  },
  {
    label: "Notifications",
    hint: "Send an announcement to people with the app",
    icon: "megaphone-outline",
    route: "/(admin)/notifications",
    permissions: ["notifications.view"],
  },
  {
    label: "Race types",
    hint: "The kinds of race and what each pays for",
    icon: "ribbon-outline",
    route: "/(admin)/race-types",
    permissions: ["schemes.manage"],
    superAdminOnly: true,
  },
  {
    label: "Event types",
    hint: "The kinds of event an organiser can run",
    icon: "albums-outline",
    route: "/(admin)/event-types",
    permissions: ["events.manage"],
    superAdminOnly: true,
  },
  {
    label: "Bird status codes",
    hint: "The statuses a bird can carry, and their colours",
    icon: "color-palette-outline",
    route: "/(admin)/bird-status-codes",
    permissions: ["users.permissions"],
    superAdminOnly: true,
  },
  {
    label: "Display settings",
    hint: "Velocity units and how sex is worded",
    icon: "options-outline",
    route: "/(admin)/settings",
    permissions: [],
  },
  {
    label: "Help & guide",
    hint: "What each section is for",
    icon: "help-circle-outline",
    route: "/(admin)/help",
    permissions: [],
  },
];

export default function AdminMore() {
  const { user, signOut: endSession } = useAuth();
  const { canAny, role, permissions } = usePermissions();
  const { isWide, isMedium } = useResponsive();
  const router = useRouter();

  const visible = ITEMS.filter(
    (item) =>
      (item.permissions.length === 0 || canAny(...item.permissions)) &&
      (!item.superAdminOnly || role === "SUPERADMIN")
  );

  const confirmSignOut = () => {
    Alert.alert("Sign out", "You will need to sign in again to use the app.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => endSession() },
    ]);
  };

  return (
    <Screen title="More" subtitle={user?.email ?? undefined}>
      <View
        className={isWide || isMedium ? "mt-4 flex-row flex-wrap" : "mt-4"}
        style={{ gap: 10 }}
      >
        {visible.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => router.push(item.route as never)}
            className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
            style={{ flexGrow: 1, flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%" }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
              <Ionicons name={item.icon} size={18} color="#475569" />
            </View>
            <View className="flex-1">
              <Text className="font-medium text-slate-900">{item.label}</Text>
              <Text className="text-xs text-slate-500">{item.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </Pressable>
        ))}
      </View>


      {/* Stated plainly, because "why can I not see X" is the most common
          question an operator has and the answer is usually here. */}
      <View className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Your access
        </Text>
        <Text className="mt-1 text-sm text-slate-700">
          {role ? role.toLowerCase() : "no role"} · {permissions.length} permissions
        </Text>
        <Text className="mt-1 text-xs text-slate-500">
          Permissions are granted in the portal. Anything not granted is hidden here rather
          than shown and refused.
        </Text>
      </View>

      <Pressable
        onPress={confirmSignOut}
        className="mt-4 flex-row items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white py-3"
      >
        <Ionicons name="log-out-outline" size={16} color="#e11d48" />
        <Text className="text-sm font-medium text-rose-600">Sign out</Text>
      </Pressable>
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
