import { SimpleMarkdown } from "@/components/EventShared";
import Header from "@/components/header";
import api from "@/service/api.service";
import { format } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Rules for the season — the portal's /events/[eventId]/rules page, from
 * GET /api/public/event/[eventId]/rules. Sections are markdown written by the
 * organizer; only published ones are returned.
 */

interface RulesData {
  event: {
    id: number;
    name: string;
    shortName: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    contactAddress: string | null;
  };
  season: { id: number; name: string; startDate: string | null; endDate: string | null };
  sections: { id: number; title: string; body: string; updatedAt: string }[];
}

export default function EventRules() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [data, setData] = useState<RulesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    api
      .get(`/public/event/${eventId}/rules`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.message ?? "Could not load the rules."))
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title="Rules" />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : error || !data ? (
        <Text className="text-center text-red-500 mt-10 px-6">{error ?? "No rules found."}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text className="text-xl font-bold text-gray-900">{data.event.name}</Text>
          <Text className="text-xs text-gray-500 mt-1">
            {data.season.name}
            {data.season.startDate ? ` · ${format(new Date(data.season.startDate), "MMM d, yyyy")}` : ""}
            {data.season.endDate ? ` – ${format(new Date(data.season.endDate), "MMM d, yyyy")}` : ""}
          </Text>

          {data.sections.length === 0 ? (
            <Text className="text-gray-500 mt-8 text-center">
              The organizer has not published rules for this season yet.
            </Text>
          ) : (
            data.sections.map((section) => (
              <View key={section.id} className="mt-5">
                <Text className="text-base font-bold text-gray-900 border-b border-gray-200 pb-1 mb-2">
                  {section.title}
                </Text>
                <SimpleMarkdown source={section.body ?? ""} />
              </View>
            ))
          )}

          {data.event.contactName || data.event.contactEmail || data.event.contactPhone ? (
            <View className="mt-8 pt-3 border-t border-gray-200">
              <Text className="text-sm font-bold text-gray-800 mb-1">Contact</Text>
              {data.event.contactName ? <Text className="text-sm text-gray-700">{data.event.contactName}</Text> : null}
              {data.event.contactPhone ? (
                <Text
                  className="text-sm text-primary"
                  onPress={() => Linking.openURL(`tel:${data.event.contactPhone}`)}
                >
                  {data.event.contactPhone}
                </Text>
              ) : null}
              {data.event.contactEmail ? (
                <Text
                  className="text-sm text-primary"
                  onPress={() => Linking.openURL(`mailto:${data.event.contactEmail}`)}
                >
                  {data.event.contactEmail}
                </Text>
              ) : null}
              {data.event.contactAddress ? (
                <Text className="text-sm text-gray-700">{data.event.contactAddress}</Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
