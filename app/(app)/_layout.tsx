import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

/**
 * The breeder shell, and who is allowed in it.
 *
 * One account sees one app. An account holding any admin permission is an
 * operator and belongs in the operations shell; an account holding none is a
 * breeder and belongs here. There is no crossing over, and the guard is a
 * redirect rather than a hidden button because hiding the way across still
 * leaves the screens reachable by a deep link or a stale history entry.
 *
 * Which side somebody lands on is therefore decided entirely by what the
 * superadmin has granted them — grant a permission and the account becomes an
 * operator on next load, revoke every one and it becomes a breeder again.
 * Nothing here needs configuring to match.
 */
export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const { isAdminCapable, isLoading: permsLoading } = usePermissions();

  // Waiting for permissions matters: deciding before they land would bounce an
  // operator into the breeder app for a frame and then pull them out of it.
  if (isLoading || (user && permsLoading)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (isAdminCapable) {
    return <Redirect href="/(admin)/dashboard" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
