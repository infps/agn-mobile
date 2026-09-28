import { useAuth, useEvents } from "@/context";
import api from "@/service/api.service";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface LiveRace {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
  startTime: string | null;
  arrivedCount: number;
  _count: { raceItems: number };
  event: { id: number; name: string; shortName: string | null } | null;
}

interface PendingPayment {
  id: number;
  paymentValue: number | null;
  eventInventory?: { season?: { event?: { name?: string } | null } | null } | null;
}

export default function HomeScreen() {
  const { events, loading: eventsLoading, listEvents } = useEvents();
  const { user } = useAuth();
  const router = useRouter();

  const [liveRaces, setLiveRaces] = useState<LiveRace[]>([]);
  const [birdCount, setBirdCount] = useState<number | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const firstName = user?.name?.split(" ")[0] ?? "Breeder";

  const liveEvents = (events ?? []).filter(
    (e) => e.races?.some((r) => !!r.startTime && r.isClosed !== 1)
  );
  const openEvents = (events ?? []).filter((e) => e.isOpen === 1);

  const load = async () => {
    try {
      const [racesRes, birdsRes, paymentsRes] = await Promise.allSettled([
        api.get("/breeder/races/live"),
        api.get("/breeder/birds"),
        api.get("/breeder/payments/pending"),
      ]);

      if (racesRes.status === "fulfilled") setLiveRaces(racesRes.value.data?.races ?? []);
      if (birdsRes.status === "fulfilled") setBirdCount(birdsRes.value.data?.birds?.length ?? 0);
      if (paymentsRes.status === "fulfilled") {
        setPendingPayments(paymentsRes.value.data?.payments ?? []);
        setTotalPending(paymentsRes.value.data?.totalPending ?? 0);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    listEvents();
    load();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* HEADER */}
        <View className="px-4 pt-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <TouchableOpacity onPress={() => router.push("/settings" as any)}>
              <MaterialIcons name="menu" size={28} color="#000" />
            </TouchableOpacity>
            <View>
              <Text className="text-xs text-gray-500">Welcome back</Text>
              <Text className="text-lg font-bold text-gray-900">{firstName}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push("/notifications" as any)}>
            <Ionicons name="notifications-outline" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* STAT CARDS */}
        <View className="px-4 mt-5 flex-row gap-3">
          {/* Bird count */}
          <TouchableOpacity
            className="flex-1 bg-white rounded-2xl p-4 border border-gray-100"
            onPress={() => router.push("/birds" as any)}
          >
            <View className="w-9 h-9 rounded-full bg-blue-50 items-center justify-center mb-2">
              <Ionicons name="egg-outline" size={18} color="#189AB4" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">
              {loading ? "—" : birdCount ?? 0}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">Active Birds</Text>
          </TouchableOpacity>

          {/* Pending payment */}
          <TouchableOpacity
            className="flex-1 bg-white rounded-2xl p-4 border border-gray-100"
            onPress={() => router.push("/payments" as any)}
          >
            <View className="w-9 h-9 rounded-full bg-red-50 items-center justify-center mb-2">
              <Ionicons name="card-outline" size={18} color="#ef4444" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">
              {loading ? "—" : `$${totalPending.toFixed(0)}`}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              Due · {pendingPayments.length} bill{pendingPayments.length !== 1 ? "s" : ""}
            </Text>
          </TouchableOpacity>

          {/* Open events */}
          <TouchableOpacity
            className="flex-1 bg-white rounded-2xl p-4 border border-gray-100"
            onPress={() => router.push("/events" as any)}
          >
            <View className="w-9 h-9 rounded-full bg-green-50 items-center justify-center mb-2">
              <Ionicons name="calendar-outline" size={18} color="#22c55e" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">
              {eventsLoading ? "—" : openEvents.length}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">Open Events</Text>
          </TouchableOpacity>
        </View>

        {/* QUICK ACTIONS */}
        <View className="px-4 mt-5 flex-row gap-3">
          {[
            { label: "My Events", icon: "list-outline" as const, href: "/my-events", color: "#189AB4" },
            { label: "My Birds", icon: "egg-outline" as const, href: "/birds", color: "#8b5cf6" },
            { label: "Payments", icon: "card-outline" as const, href: "/payments", color: "#f59e0b" },
            { label: "Results", icon: "trophy-outline" as const, href: "/result", color: "#10b981" },
          ].map((a) => (
            <TouchableOpacity
              key={a.href}
              onPress={() => router.push(a.href as any)}
              className="flex-1 bg-white border border-gray-100 rounded-xl items-center py-3 gap-1"
            >
              <Ionicons name={a.icon} size={20} color={a.color} />
              <Text className="text-[9px] text-gray-600 font-medium text-center">{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* LIVE RACES */}
        <View className="mt-6">
          <View className="flex-row justify-between items-center px-4 mb-3">
            <View className="flex-row items-center gap-2">
              <View className="w-2 h-2 rounded-full bg-red-500" />
              <Text className="text-base font-bold text-gray-900">Live Races</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/races" as any)}>
              <Text className="text-xs text-blue-500">See All</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="mx-4 bg-white rounded-2xl p-6 items-center">
              <ActivityIndicator size="small" color="#189AB4" />
            </View>
          ) : liveRaces.length === 0 ? (
            <View className="mx-4 bg-white rounded-2xl p-5 items-center border border-gray-100">
              <Ionicons name="radio-outline" size={28} color="#d1d5db" />
              <Text className="text-gray-400 text-sm mt-2">No races in the air right now</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              data={liveRaces}
              keyExtractor={(r) => String(r.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="w-56 bg-white rounded-2xl p-4 border border-gray-100"
                  onPress={() => router.push({ pathname: "/live-race", params: { raceId: String(item.id) } } as any)}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-1.5">
                      <View className="w-2 h-2 rounded-full bg-red-500" />
                      <Text className="text-[10px] text-red-500 font-semibold uppercase">Live</Text>
                    </View>
                    <Text className="text-[10px] text-gray-400">
                      {item.arrivedCount}/{item._count.raceItems} in
                    </Text>
                  </View>
                  <Text className="font-bold text-gray-900 text-sm" numberOfLines={1}>
                    {item.name ?? `Race ${item.raceNumber ?? item.id}`}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                    {item.event?.shortName ?? item.event?.name ?? "—"}
                  </Text>
                  <View className="mt-3 bg-red-500 rounded-lg py-1.5 items-center">
                    <Text className="text-white text-xs font-semibold">Watch Live</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        {/* LIVE / OPEN EVENTS */}
        <View className="mt-6">
          <View className="flex-row justify-between items-center px-4 mb-3">
            <Text className="text-base font-bold text-gray-900">Events</Text>
            <TouchableOpacity onPress={() => router.push("/events" as any)}>
              <Text className="text-xs text-blue-500">See All</Text>
            </TouchableOpacity>
          </View>

          {eventsLoading ? (
            <View className="mx-4 bg-white rounded-2xl p-6 items-center">
              <ActivityIndicator size="small" color="#189AB4" />
            </View>
          ) : liveEvents.length === 0 && openEvents.length === 0 ? (
            <View className="mx-4 bg-white rounded-2xl p-5 items-center border border-gray-100">
              <Text className="text-gray-400 text-sm">No active events</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              data={[...liveEvents, ...openEvents.filter((e) => !liveEvents.find((l) => l.id === e.id))].slice(0, 8)}
              keyExtractor={(e) => String(e.id)}
              renderItem={({ item }) => {
                const isLive = liveEvents.some((l) => l.id === item.id);
                return (
                  <TouchableOpacity
                    className="w-44 bg-white rounded-2xl p-4 border border-gray-100"
                    onPress={() => router.push(`/(app)/event-detail?id=${item.id}` as any)}
                  >
                    {isLive && (
                      <View className="flex-row items-center gap-1 mb-1">
                        <View className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <Text className="text-[9px] text-red-500 font-semibold uppercase">Live</Text>
                      </View>
                    )}
                    <Text className="font-bold text-gray-900 text-sm" numberOfLines={2}>{item.name}</Text>
                    <Text className="text-[10px] text-gray-400 mt-1">
                      {item.eventDate ? new Date(item.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                    </Text>
                    <View className={`mt-3 rounded-lg py-1.5 items-center ${isLive ? "bg-red-500" : "bg-blue-500"}`}>
                      <Text className="text-white text-xs font-semibold">
                        {isLive ? "Watch" : "View"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>

        {/* PENDING PAYMENTS DETAIL */}
        {pendingPayments.length > 0 && (
          <View className="mt-6 mb-4">
            <View className="flex-row justify-between items-center px-4 mb-3">
              <Text className="text-base font-bold text-gray-900">Pending Bills</Text>
              <TouchableOpacity onPress={() => router.push("/payments" as any)}>
                <Text className="text-xs text-blue-500">See All</Text>
              </TouchableOpacity>
            </View>
            {pendingPayments.slice(0, 3).map((p) => (
              <TouchableOpacity
                key={p.id}
                className="mx-4 mb-2 bg-white border border-gray-100 rounded-xl px-4 py-3 flex-row items-center justify-between"
                onPress={() => router.push("/payments" as any)}
              >
                <View className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-red-50 items-center justify-center">
                    <Ionicons name="card-outline" size={15} color="#ef4444" />
                  </View>
                  <Text className="text-sm text-gray-800" numberOfLines={1}>
                    {p.eventInventory?.season?.event?.name ?? "Payment due"}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-red-500">
                  ${(p.paymentValue ?? 0).toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
