import Header from "@/components/header";
import { useEvents } from "@/context";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TABS = ["Overview", "Races", "Messages", "Averages"] as const;
type Tab = (typeof TABS)[number];

const EventDetail = () => {
  const { id } = useLocalSearchParams();
  const { getEvent, currentEvent, getEventParticipants, participants, loading } = useEvents();
  const [tab, setTab] = useState<Tab>("Overview");

  useEffect(() => {
    if (id) {
      getEvent(id as string);
      getEventParticipants(id as string);
    }
  }, [id]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={currentEvent?.name ?? "Event"} />

      {/* Fee row */}
      <View className="flex-row mx-4 py-4 justify-between border-b border-gray-400">
        <View>
          <Text className="text-sm font-bold text-black text-center">Perch Fee</Text>
          <Text className="text-center text-sm">${currentEvent?.feeScheme?.entryFee ?? "N/A"}</Text>
        </View>
        <View>
          <Text className="text-sm font-bold text-black text-center">Bird Fee</Text>
          <Text className="text-center text-sm">
            ${currentEvent?.feeScheme?.perchFeeItems?.[0]?.perchFee ?? "N/A"}
          </Text>
        </View>
        <View>
          <Text className="text-sm font-bold ml-4">Race Date</Text>
          <Text className="text-center text-sm">
            {currentEvent ? format(new Date(currentEvent.eventDate), "MMM dd, yyyy") : ""}
          </Text>
        </View>
        <View>
          <Text className="text-sm font-bold text-black">Participants</Text>
          <Text className="text-center text-sm">
            {currentEvent?._count?.eventInventories ?? currentEvent?.eventInventories?.length ?? "N/A"}
          </Text>
        </View>
      </View>

      {/* Live race button */}
      {currentEvent?.races?.some((r) => !!r.startTime && r.isClosed !== 1) && (
        <TouchableOpacity
          className="mx-4 mt-3 bg-red-500 py-3 rounded-lg flex-row items-center justify-center gap-2"
          onPress={() => {
            const liveRace = currentEvent.races?.find((r) => !!r.startTime && r.isClosed !== 1);
            if (liveRace) router.push({ pathname: "/live-race", params: { raceId: String(liveRace.id) } });
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
          <Text className="text-white font-bold text-base">Watch Live Race</Text>
        </TouchableOpacity>
      )}

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="border-b border-gray-200"
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            className="px-4 py-3"
          >
            <Text className={`text-sm font-semibold ${tab === t ? "text-primary" : "text-gray-500"}`}>{t}</Text>
            {tab === t && <View className="h-0.5 bg-primary mt-1 rounded-full" />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "Overview" && <OverviewTab participants={participants} loading={loading} eventId={id as string} />}
      {tab === "Races" && <RacesTab eventId={id as string} />}
      {tab === "Messages" && <MessagesTab eventId={id as string} />}
      {tab === "Averages" && <AveragesTab eventId={id as string} />}
    </SafeAreaView>
  );
};

export default EventDetail;

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ participants, loading, eventId }: { participants: any[]; loading: boolean; eventId: string }) {
  return (
    <>
      <View className="flex-row p-4 justify-between items-center">
        <View className="flex-row items-center">
          <Ionicons name="people-outline" size={24} />
          <Text className="text-lg ml-2">Registered Participants</Text>
        </View>
        <View className="flex-row gap-2 items-center">
          <View className="rounded-2xl bg-primary px-4 py-2">
            <Text className="text-white text-sm">{participants?.length ?? 0} Breeders</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/event-defaulters", params: { eventId } })}
            className="rounded-2xl bg-red-100 px-3 py-2"
          >
            <Text className="text-red-600 text-xs font-semibold">Defaulters</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View className="flex-row bg-primary justify-between p-3 mx-2 border-b border-gray-200">
        <Text className="font-bold text-sm text-white w-12">#</Text>
        <Text className="font-bold text-sm text-center text-white w-32">Breeder Name</Text>
        <Text className="font-bold text-sm text-center text-white w-32">Loft Name</Text>
        <Text className="font-bold text-sm text-white w-18">Total Birds</Text>
      </View>
      {loading ? (
        <ActivityIndicator className="mt-8" />
      ) : (
        <FlatList
          data={participants}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => (
            <View className="flex-row justify-between p-4 border-b border-gray-200">
              <Text className="text-sm w-12">{index + 1}</Text>
              <Text className="text-sm w-32">{item?.breederName || "Unknown Breeder"}</Text>
              <Text className="text-sm w-32">{item?.loft || "Not specified"}</Text>
              <Text className="text-sm text-center w-18">{item?.birds?.length || "0"}</Text>
            </View>
          )}
          ListEmptyComponent={<Text className="text-center py-4 text-gray-500">No participants found</Text>}
        />
      )}
    </>
  );
}

// ── Races ─────────────────────────────────────────────────────────────────────

function RacesTab({ eventId }: { eventId: string }) {
  const [races, setRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/breeder/event/${eventId}/history`)
      .then((r) => setRaces(r.data.races ?? []))
      .catch(() => setError("Could not load races."))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <ActivityIndicator className="mt-8" />;
  if (error) return <Text className="text-red-500 text-center mt-8">{error}</Text>;

  return (
    <FlatList
      data={races}
      keyExtractor={(r) => String(r.id)}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => (
        <View className="border border-gray-200 rounded-xl p-4 mb-3">
          <View className="flex-row justify-between items-start">
            <Text className="font-semibold text-gray-900 flex-1">
              {item.name || `Race ${item.raceNumber ?? item.id}`}
            </Text>
            <View className={`rounded-full px-2 py-0.5 ${item.status === "ENDED" ? "bg-green-100" : "bg-amber-100"}`}>
              <Text className={`text-[10px] font-medium ${item.status === "ENDED" ? "text-green-700" : "text-amber-700"}`}>
                {item.status}
              </Text>
            </View>
          </View>
          {item.raceType && <Text className="text-xs text-gray-500 mt-1">{item.raceType.name}</Text>}
          {item.distance && <Text className="text-xs text-gray-500">{item.distance} mi</Text>}
          {item.startTime && (
            <Text className="text-xs text-gray-400 mt-1">
              {format(new Date(item.startTime), "MMM dd, yyyy HH:mm")}
            </Text>
          )}
        </View>
      )}
      ListEmptyComponent={<Text className="text-center text-gray-500 mt-8">No races yet</Text>}
    />
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

function MessagesTab({ eventId }: { eventId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/breeder/event/${eventId}/messages`)
      .then((r) => setMessages(r.data.messages ?? []))
      .catch(() => setError("Could not load messages."))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <ActivityIndicator className="mt-8" />;
  if (error) return <Text className="text-red-500 text-center mt-8">{error}</Text>;

  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => String(m.id)}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => (
        <View className="border border-gray-200 rounded-xl p-4 mb-3">
          {item.title && <Text className="font-semibold text-gray-900 mb-1">{item.title}</Text>}
          <Text className="text-sm text-gray-700">{item.body}</Text>
          <View className="flex-row justify-between mt-2">
            <Text className="text-xs text-gray-400">
              {item.author ? `${item.author.name ?? ""} ${item.author.lastName ?? ""}`.trim() : ""}
            </Text>
            {item.createdAt && (
              <Text className="text-xs text-gray-400">
                {format(new Date(item.createdAt), "MMM dd, yyyy")}
              </Text>
            )}
          </View>
        </View>
      )}
      ListEmptyComponent={<Text className="text-center text-gray-500 mt-8">No messages</Text>}
    />
  );
}

// ── Averages ──────────────────────────────────────────────────────────────────

function AveragesTab({ eventId }: { eventId: string }) {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/breeder/event/${eventId}/averages`)
      .then((r) => setConfigs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setError("Could not load averages."))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <ActivityIndicator className="mt-8" />;
  if (error) return <Text className="text-red-500 text-center mt-8">{error}</Text>;

  return (
    <FlatList
      data={configs}
      keyExtractor={(c) => String(c.id)}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => (
        <TouchableOpacity
          className="border border-gray-200 rounded-xl p-4 mb-3 flex-row justify-between items-center"
          onPress={() => router.push({ pathname: "/averages-detail", params: { avgId: String(item.id), eventId, name: item.name } })}
        >
          <View>
            <Text className="font-semibold text-gray-900">{item.name}</Text>
            {item.filterMode && <Text className="text-xs text-gray-500 mt-0.5">{item.filterMode}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text className="text-center text-gray-500 mt-8">No public averages configured</Text>}
    />
  );
}
