import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import api from "./api.service";

/**
 * Telling the portal where to reach this phone.
 *
 * The token comes from Expo rather than from APNs or FCM directly: the app is
 * an Expo build, so Expo already holds the platform credentials, and the token
 * it returns is the only address the portal needs.
 *
 * Two things this deliberately does not do. It does not ask for permission on
 * first launch — a permission prompt before somebody knows what the app is gets
 * declined, and a declined notification permission on iOS cannot be asked for
 * again. And it never throws: being unreachable is a worse app, not a broken
 * one, and a failure here must not stop somebody signing in.
 */

/** Foreground behaviour: a notification arriving while the app is open still shows. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Android delivers silently unless the notification names a channel the app
 * has created. The portal sends `channelId: "default"`, so that is the one
 * created here.
 */
async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Announcements",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** The EAS project this build belongs to — required to mint a token. */
function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

export interface RegisterOutcome {
  ok: boolean;
  token?: string;
  /** Why not, in words worth showing if somebody asks. */
  reason?: string;
}

/**
 * Ask for permission if it has not been answered, then hand the token over.
 *
 * Safe to call on every sign-in: the portal upserts on the token, so repeating
 * it refreshes the record rather than growing a list.
 */
export async function registerForPush(): Promise<RegisterOutcome> {
  try {
    // A simulator has no push service behind it, and the token call fails in a
    // way that reads like a bug rather than the expected thing it is.
    if (!Device.isDevice) {
      return { ok: false, reason: "Push only works on a real device." };
    }

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      // Only asks when it has never been answered. iOS refuses a second prompt
      // after a denial, so re-asking would be a no-op that looks like a bug.
      if (!existing.canAskAgain) {
        return { ok: false, reason: "Notifications are turned off for this app." };
      }
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") {
      return { ok: false, reason: "Notifications were not allowed." };
    }

    const id = projectId();
    if (!id) {
      return { ok: false, reason: "This build has no EAS project id, so no token can be issued." };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return { ok: false, reason: "No push token was issued." };

    await api.post("/notifications/device", {
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? Device.modelName ?? null,
    });

    return { ok: true, token };
  } catch (error: any) {
    // Logged rather than surfaced: the person was signing in, not setting up
    // notifications, and this is not their problem to solve.
    console.log("[push] could not register:", error?.message ?? error);
    return { ok: false, reason: "Could not register this device." };
  }
}

/**
 * Drop this device on sign-out.
 *
 * Without it the next person to sign in on a shared handset keeps receiving
 * the previous one's announcements until they register and overwrite it.
 */
export async function unregisterPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const id = projectId();
    if (!id) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (token) await api.delete("/notifications/device", { data: { token } });
  } catch {
    // Best effort. The portal deactivates a token the push service rejects
    // anyway, so a missed unregister corrects itself.
  }
}
