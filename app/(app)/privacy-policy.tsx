import Header from "@/components/header";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * The full policy lives on the website — the same page the Play Store and App
 * Store listings link to — so there is one text to keep current, not two.
 */
const SITE = "https://pigeon-pulse.vercel.app";
const CONTACT_EMAIL = "jdsuperfarm@gmail.com";

const LinkRow = ({ label, path }: { label: string; path: string }) => (
  <Pressable
    onPress={() => WebBrowser.openBrowserAsync(`${SITE}${path}`)}
    className="mt-3 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
  >
    <Text className="font-medium text-slate-900">{label}</Text>
    <Ionicons name="open-outline" size={18} color="#64748b" />
  </Pressable>
);

const PrivacyPolicy = () => {
  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Privacy Policy" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text className="text-base leading-6 text-slate-700">
          Pigeon Pulse collects the details you give us — your account, profile, birds, entries,
          payments and bets — to run events, publish race results and process payments through
          PayPal. Race staff who track a transport share their device location while tracking is
          on. We do not sell your data.
        </Text>
        <Text className="mt-3 text-base leading-6 text-slate-700">
          The full policy explains what we collect, who we share it with, how long we keep it, and
          your rights.
        </Text>

        <LinkRow label="Read the full Privacy Policy" path="/privacy" />
        <LinkRow label="Delete your account" path="/delete-account" />

        <Text className="mt-6 text-sm text-slate-500">
          Questions? Email {CONTACT_EMAIL}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PrivacyPolicy;

export { ErrorBoundary } from "@/components/ErrorScreen";
