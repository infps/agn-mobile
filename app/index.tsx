// app/index.tsx
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { Button } from "@/components/admin/ui";
import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
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
 *
 * The one case that is not a redirect: the server could not be asked and there
 * is no cached answer for this account. Guessing there means either stranding a
 * breeder in an admin shell or, far more likely, telling an organiser their
 * access is gone. Neither is worth guessing, so it asks to try again instead.
 */
export default function Index() {
  const { user, isLoading, checkSession } = useAuth();
  const { isAdminCapable, isLoading: permsLoading, isUnknown, refresh } = usePermissions();

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

  if (isUnknown) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8">
        <Ionicons name="cloud-offline-outline" size={32} color="#94a3b8" />
        <Text className="mt-4 text-center text-base font-medium text-slate-900">
          Could not check your access
        </Text>
        <Text className="mt-2 text-center text-sm text-slate-500">
          The portal did not answer, and this device has not seen your access before. Check you are
          on the same network as it, then try again.
        </Text>
        <View className="mt-5 w-48">
          <Button label="Try again" onPress={refresh} full />
        </View>
      </View>
    );
  }

  return <Redirect href={isAdminCapable ? "/(admin)/dashboard" : "/(app)/home"} />;
}
