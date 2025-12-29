import { AppProviders } from "@/context";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <AppProviders>
        <Slot />
        <StatusBar style="light" backgroundColor="#189AB4" />
      </AppProviders>
    </ThemeProvider>
  );
}
