import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import api from "./api.service";

// ponytail: dynamic import so Expo Go (SDK 53+) doesn't crash at module load
let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // Expo Go — push not supported, silently skip
}

Notifications?.setNotificationHandler?.({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== "android" || !Notifications) return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Announcements",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

export interface RegisterOutcome {
  ok: boolean;
  token?: string;
  reason?: string;
}

export async function registerForPush(): Promise<RegisterOutcome> {
  try {
    if (!Notifications) return { ok: false, reason: "Push not supported in Expo Go." };
    if (!Device.isDevice) return { ok: false, reason: "Push only works on a real device." };

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
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
    console.log("[push] could not register:", error?.message ?? error);
    return { ok: false, reason: "Could not register this device." };
  }
}

export async function unregisterPush(): Promise<void> {
  try {
    if (!Notifications || !Device.isDevice) return;
    const id = projectId();
    if (!id) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (token) await api.delete("/notifications/device", { data: { token } });
  } catch {
    // best effort
  }
}
