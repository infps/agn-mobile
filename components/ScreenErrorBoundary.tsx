import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

/**
 * What a screen shows instead of taking the whole app down.
 *
 * In a release build an error thrown while rendering is fatal: React Native
 * reports it and iOS aborts the process, and the crash log that reaches
 * TestFlight has the message stripped out. So a tester sees the app vanish and
 * we see a stack trace that names nothing in our code.
 *
 * Exported from the layouts as Expo Router's `ErrorBoundary`, this catches the
 * error at the screen instead. The message is printed on purpose: a screenshot
 * of this page is the bug report, and it is the only place the release build
 * still has the text.
 */
export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <View className="items-center">
          <Ionicons name="alert-circle-outline" size={40} color="#e11d48" />
          <Text className="mt-3 text-center text-lg font-semibold text-slate-900">
            Something went wrong on this screen
          </Text>
          <Text className="mt-1 text-center text-sm text-slate-500">
            The rest of the app is fine. Try again, or go back and carry on.
          </Text>
        </View>

        <View className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Text selectable className="text-xs text-slate-600">
            {error?.message || String(error)}
          </Text>
        </View>

        <View className="mt-5 flex-row" style={{ gap: 10 }}>
          <Pressable
            onPress={goBack}
            className="flex-1 items-center rounded-xl border border-slate-200 bg-white py-3"
          >
            <Text className="text-sm font-medium text-slate-700">Go back</Text>
          </Pressable>
          <Pressable onPress={retry} className="flex-1 items-center rounded-xl bg-blue-600 py-3">
            <Text className="text-sm font-medium text-white">Try again</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
