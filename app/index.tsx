// app/index.tsx
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { Redirect } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import "./global.css";

/**
 * Where the app opens.
 *
 * One binary decides it: does this account hold any admin permission? If it
 * does, the admin shell is the useful landing place — somebody running an event
 * opens the app to check a race, not to look at their own birds. Everyone else
 * gets the breeder app, which is the whole experience for them.
 *
 * Both shells stay reachable either way, so an operator who also flies birds can
 * cross over without signing out.
 */
export default function Index() {
  const { user, isLoading, checkSession } = useAuth();
  const { isAdminCapable, isLoading: permsLoading } = usePermissions();

  useEffect(() => {
    const verifySession = async () => {
      try {
        await checkSession();
      } catch (error) {
        console.log("Session verification failed:", error);
      }
    };

    verifySession();
    // Once, on open: re-running this would re-check the session on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deciding the destination before permissions land would send every admin to
  // the breeder app for a moment and then yank them out of it.
  if (isLoading || (user && permsLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return <Redirect href={isAdminCapable ? "/(admin)/dashboard" : "/(app)/home"} />;
}
