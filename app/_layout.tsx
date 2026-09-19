import { AppProviders } from "@/context";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";

/**
 * The root of both apps.
 *
 * SDK 56 severed expo-router from react-navigation, so the ThemeProvider that
 * used to wrap this is gone — expo-router owns navigation theming itself now,
 * and importing react-navigation alongside it is a hard error rather than a
 * warning. Nothing here relied on the theme it provided; every screen sets its
 * own colours.
 */
export default function RootLayout() {
  return (
    <AppProviders>
      <Slot />
      {/* SDK 56 also dropped backgroundColor from expo-status-bar: Android
          draws edge-to-edge now, so the bar takes the colour of whatever is
          behind it. The light content style is what actually mattered. */}
      <StatusBar style="light" />
    </AppProviders>
  );
}
