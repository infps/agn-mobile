import {
  BirdsTab,
  BreedersTab,
  HistoryTab,
  MessagesTab,
  ResultTab,
  StationsTab,
} from "@/components/EventDetailTabs";
import { ApprovalBanner, feeSchemeOf, isLiveRace, money, racesOf } from "@/components/EventShared";
import Header from "@/components/header";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * One event — the portal's /events/[eventId] page.
 *
 * The same tabs in the same order: Breeders, Birds, Result, Stations, Messages,
 * History, and Register (which opens the registration screen). The pieces the
 * portal puts on separate pages — rules, the Calcutta auction, the season
 * archive, the event store — hang off the header as shortcuts.
 */

const TABS = ["Breeders", "Birds", "Result", "Stations", "Messages", "History"] as const;
type Tab = (typeof TABS)[number];

const tabFromParam = (value: unknown): Tab => {
  const wanted = String(value ?? "").toLowerCase();
  return TABS.find((t) => t.toLowerCase() === wanted) ?? "Breeders";
};

interface PaymentStatus {
  eventInventoryId: number;
  approvalStatus?: string | null;
  totalPaid: number;
  totalPending: number;
  totalDue: number;
  isPaid: boolean;
}

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center border border-gray-200 rounded-full px-3 py-1.5 mr-2 bg-white"
    >
      <Ionicons name={icon} size={14} color="#189AB4" />
      <Text className="text-xs font-semibold text-gray-700 ml-1">{label}</Text>
    </TouchableOpacity>
  );
}

const EventDetail = () => {
  const params = useLocalSearchParams<{ id?: string; eventId?: string; tab?: string }>();
  const id = String(params.id ?? params.eventId ?? "");
  const [event, setEvent] = useState<any>(null);
  const [stats, setStats] = useState<{ breeders: number; birds: number; races: number } | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>(tabFromParam(params.tab));

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    setEvent(null);
    setStatus(null);
    api
      .get(`/breeder/events/${id}`)
      .then((r) => {
        if (!alive) return;
        setEvent(r.data.event);
        setStats(r.data.stats ?? null);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    // 404 here simply means "not registered", which is the common case.
    api
      .get(`/breeder/event/${id}/payment-status`)
      .then((r) => alive && setStatus(r.data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Event" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      </SafeAreaView>
    );
  }

  if (failed || !event) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Event" />
        <Text className="text-center text-red-500 mt-10">Event not found or unavailable.</Text>
      </SafeAreaView>
    );
  }

  const races = racesOf(event);
  const feeScheme = feeSchemeOf(event);
  const liveRace = races.find(isLiveRace);
  const registered = !!status;
  const eventName: string = event.name ?? "Event";

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={eventName} />

      {event.shortName || event.locationAddress ? (
        <View className="px-4 pt-2">
          {event.shortName ? (
            <Text className="text-center text-xs text-gray-500">{event.shortName}</Text>
          ) : null}
          {event.locationAddress ? (
            <Text className="text-center text-xs text-gray-500 mt-0.5">
              Liberation Point: {event.locationAddress}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Headline figures */}
      <View className="flex-row mx-4 py-3 justify-between border-b border-gray-200">
        <View className="items-center flex-1">
          <Text className="text-[11px] font-bold text-black">Entry Fee</Text>
          <Text className="text-xs">{feeScheme?.entryFee != null ? money(feeScheme.entryFee) : "N/A"}</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[11px] font-bold text-black">Date</Text>
          <Text className="text-xs">
            {event.eventDate ? format(new Date(event.eventDate), "MMM dd, yyyy") : "-"}
          </Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[11px] font-bold text-black">Breeders</Text>
          <Text className="text-xs">{stats?.breeders ?? "-"}</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[11px] font-bold text-black">Birds</Text>
          <Text className="text-xs">{stats?.birds ?? "-"}</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-[11px] font-bold text-black">Races</Text>
          <Text className="text-xs">{stats?.races ?? races.length}</Text>
        </View>
      </View>

      {/* Registration banner — the portal's RegistrationBanner */}
      <ApprovalBanner status={status?.approvalStatus} />
      {registered && status && status.totalDue > 0 ? (
        <TouchableOpacity
          onPress={() => router.push("/payments" as any)}
          className="mx-4 mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50 flex-row items-center justify-between"
        >
          <Text className="text-xs text-amber-900 flex-1">
            You have {money(status.totalDue)} outstanding for this event.
          </Text>
          <Text className="text-xs font-bold text-amber-900">Pay now</Text>
        </TouchableOpacity>
      ) : null}

      {/* Primary actions */}
      <View style={{ flexDirection: "row", marginHorizontal: 16, marginTop: 12, gap: 8 }}>
        {event.isOpen === 1 || event.isOpen === true ? (
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "#189AB4", paddingVertical: 11, borderRadius: 8, alignItems: "center" }}
            onPress={() => router.push({ pathname: "/register-in-event", params: { eventId: id } } as any)}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
              {registered ? "Register more birds" : "Register"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {registered ? (
          <TouchableOpacity
            style={{ flex: 1, borderWidth: 1, borderColor: "#189AB4", paddingVertical: 11, borderRadius: 8, alignItems: "center" }}
            onPress={() =>
              router.push({ pathname: "/my-registration", params: { eventId: id, eventName } } as any)
            }
          >
            <Text style={{ color: "#189AB4", fontWeight: "700", fontSize: 14 }}>My registration</Text>
          </TouchableOpacity>
        ) : null}
        {liveRace ? (
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "#ef4444", paddingVertical: 11, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
            onPress={() => router.push({ pathname: "/live-race", params: { raceId: String(liveRace.id) } })}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>Watch Live</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* The portal's separate event pages */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
        >
          {event.raceFormat === "CALCUTTA" ? (
            <Shortcut
              icon="hammer-outline"
              label="Join Calcutta Auction"
              onPress={() => router.push({ pathname: "/event-calcutta", params: { eventId: id, eventName } } as any)}
            />
          ) : null}
          <Shortcut
            icon="document-text-outline"
            label="Rules"
            onPress={() => router.push({ pathname: "/event-rules", params: { eventId: id } } as any)}
          />
          <Shortcut
            icon="navigate-outline"
            label="Station coordinates"
            onPress={() => router.push({ pathname: "/event-stations", params: { eventId: id } } as any)}
          />
          <Shortcut
            icon="archive-outline"
            label="Archive"
            onPress={() => router.push({ pathname: "/event-archive", params: { eventId: id } } as any)}
          />
          <Shortcut
            icon="pricetag-outline"
            label="Store"
            onPress={() => router.push({ pathname: "/event-store", params: { eventId: id } } as any)}
          />
          <Shortcut
            icon="alert-circle-outline"
            label="Defaulters"
            onPress={() => router.push({ pathname: "/event-defaulters", params: { eventId: id } } as any)}
          />
        </ScrollView>
      </View>

      {/* Tab bar */}
      <View className="border-b border-gray-200">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {TABS.map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} className="px-4 py-3">
              <Text className={`text-sm font-semibold ${tab === t ? "text-primary" : "text-gray-500"}`}>{t}</Text>
              {tab === t && <View className="h-0.5 bg-primary mt-1 rounded-full" />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View className="flex-1">
        {tab === "Breeders" && <BreedersTab eventId={id} />}
        {tab === "Birds" && <BirdsTab eventId={id} />}
        {tab === "Result" && <ResultTab eventId={id} races={races} />}
        {tab === "Stations" && <StationsTab eventId={id} event={event} />}
        {tab === "Messages" && <MessagesTab eventId={id} />}
        {tab === "History" && <HistoryTab eventId={id} />}
      </View>
    </SafeAreaView>
  );
};

export default EventDetail;

export { ErrorBoundary } from "@/components/ErrorScreen";
