import Constants from "expo-constants";
import React from "react";
import { Platform, Text, View } from "react-native";

/**
 * Whether a native MapView can be drawn at all.
 *
 * On Android react-native-maps always boots the Google Maps SDK — even with
 * `mapType="none"` and our own tiles — and the SDK throws a native
 * IllegalStateException ("API key not found") when the manifest carries no
 * `com.google.android.geo.API_KEY`. That kills the whole app and no JS error
 * boundary can catch it, so every map checks this before mounting MapView.
 * Set GOOGLE_MAPS_API_KEY in the EAS build env and rebuild to turn maps on;
 * app.config.js bakes in the key and sets `extra.mapsEnabled`.
 */
export const MAPS_AVAILABLE =
  Platform.OS !== "android" || Constants.expoConfig?.extra?.mapsEnabled === true;

export function MapUnavailable({ height }: { height: number }) {
  return (
    <View
      className="items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6"
      style={{ height }}
    >
      <Text className="text-center text-sm text-slate-500">
        The map is not available in this build.
      </Text>
    </View>
  );
}
