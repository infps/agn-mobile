import { Ionicons } from "@expo/vector-icons";
import { router, type ErrorBoundaryProps } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * What the user sees instead of the app closing.
 *
 * Exported as `ErrorBoundary` from every route file, which expo-router wraps
 * around that route: a screen that throws while rendering shows this in its
 * place and leaves the rest of the app — the stack, the nav bar — working.
 *
 * Deliberately depends on no context: a provider may be the thing that broke.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
    retry();
  };

  return (
    <View className="flex-1 items-center justify-center bg-white px-8">
      <Ionicons name="alert-circle-outline" size={56} color="#189AB4" />
      <Text className="mt-4 text-center text-lg font-bold text-gray-900">
        Something went wrong
      </Text>
      <Text className="mt-2 text-center text-sm text-gray-500">
        This screen ran into a problem. Your data is safe — try again, or go back.
      </Text>
      <Text className="mt-3 text-center text-xs text-gray-400" numberOfLines={3}>
        {String(error?.message ?? error)}
      </Text>
      <View className="mt-6 flex-row gap-3">
        <Pressable onPress={goBack} className="rounded-lg border border-primary px-5 py-2.5">
          <Text className="font-semibold text-primary">Go back</Text>
        </Pressable>
        <Pressable onPress={retry} className="rounded-lg bg-primary px-5 py-2.5">
          <Text className="font-semibold text-white">Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Errors React never sees — a throw inside a timer, an event handler, a
 * listener — reach RN's global handler, which in a release build reports them
 * as fatal and kills the app. Route them here instead and draw the error page
 * over whatever is on screen; the app underneath keeps its state.
 */
let showFatal: ((error: Error) => void) | null = null;

if (!__DEV__) {
  const fallback = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal && showFatal) {
      console.error(error);
      showFatal(error instanceof Error ? error : new Error(String(error)));
    } else {
      fallback(error, isFatal);
    }
  });
}

export function FatalErrorGate({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    showFatal = setError;
    return () => {
      showFatal = null;
    };
  }, []);

  return (
    <>
      {children}
      {error && (
        <View style={StyleSheet.absoluteFill}>
          <ErrorBoundary error={error} retry={async () => setError(null)} />
        </View>
      )}
    </>
  );
}
