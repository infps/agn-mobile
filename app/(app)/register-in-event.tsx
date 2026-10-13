import {
  bandOf,
  bettingSchemeOf,
  feeSchemeOf,
  money,
  poolKey,
  racesOf,
  registrationFees,
  schemePools,
  SchemePool,
} from "@/components/EventShared";
import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Register for an event — the portal's Register tab.
 *
 * The order is the portal's: pick a loft (team) name, say how many perches to
 * reserve, choose which of your birds fill them, optionally back those birds in
 * the event's betting pools, then either pay now or commit to paying later.
 *
 * Everything is sent to POST /api/breeder/event/[eventId]/register, which
 * prices the registration itself; the figures shown here are a preview built
 * from the same fee scheme. The fee scheme, betting scheme and races live on
 * the event's active season, not on the event.
 *
 * Paying now follows the portal's button: register with paymentIntent PAYPAL,
 * open the `approveUrl` that create-order returns, poll, capture — and if the
 * payment does not complete, take the unpaid registration back out again so a
 * failed checkout does not leave a registration behind.
 */

const POLL_MS = 3000;
const MAX_POLLS = 100; // five minutes
const CATEGORY_LABEL: Record<string, string> = { BELGIAN: "Belgian", STANDARD: "Standard", WTA: "WTA" };

interface MyBird {
  id: number;
  birdName?: string | null;
  band?: string | null;
  band1?: string | null;
  band2?: string | null;
  band3?: string | null;
  band4?: string | null;
  color?: string | null;
  sex?: number | null;
  isActive?: number | boolean | null;
  isLost?: number | boolean | null;
}

const RegisterInEvent = () => {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const toast = useToast();

  const [event, setEvent] = useState<any>(null);
  const [birds, setBirds] = useState<MyBird[]>([]);
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [loftName, setLoftName] = useState("");
  const [reservedBirds, setReservedBirds] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [bets, setBets] = useState<Record<number, string[]>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<null | "paypal" | "later">(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    Promise.all([
      api.get(`/breeder/events/${eventId}`),
      api.get("/breeder/teams").catch(() => null),
    ])
      .then(([ev, tm]) => {
        if (!alive) return;
        setEvent(ev.data?.event ?? null);
        const list = tm?.data?.teams ?? [];
        setTeams(list);
        // The breeder's default team name pre-fills the loft, as on the portal.
        setLoftName((prev) => prev || tm?.data?.defaultTeamName || list[0]?.name || "");
      })
      .catch((e) => toast.error(e?.response?.data?.message ?? "Could not load the event"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Birds are re-read on focus so one added from here shows up on return.
  useFocusEffect(
    useCallback(() => {
      api
        .get("/breeder/birds")
        .then((r) => setBirds(r.data?.birds ?? []))
        .catch(() => {});
    }, [])
  );

  const feeScheme = feeSchemeOf(event);
  const races = racesOf(event);
  const pools: SchemePool[] = useMemo(() => schemePools(bettingSchemeOf(event)), [event]);
  const maxBirds: number = feeScheme?.maxBirdCount || 0;
  const requiresPayment = !!feeScheme?.requirePaymentToRegister;
  const isOpen = event?.isOpen === 1 || event?.isOpen === true;

  const fees = useMemo(
    () => registrationFees(feeScheme, races, reservedBirds),
    [feeScheme, races, reservedBirds]
  );

  // One stake per chosen pool, per bird, in every race of the season.
  const betStakes = useMemo(() => {
    let perRace = 0;
    for (const birdId of selected) {
      for (const key of bets[birdId] ?? []) {
        perRace += pools.find((p) => poolKey(p) === key)?.amount ?? 0;
      }
    }
    return perRace * races.length;
  }, [selected, bets, pools, races.length]);

  const total = (fees?.total ?? 0) + betStakes;

  const availableBirds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return birds.filter((b) => {
      if (b.isLost === 1 || b.isLost === true) return false;
      if (b.isActive === 0 || b.isActive === false) return false;
      if (!q) return true;
      return bandOf(b).toLowerCase().includes(q) || String(b.birdName ?? "").toLowerCase().includes(q);
    });
  }, [birds, search]);

  const setReserved = (n: number) => {
    const capped = Math.max(0, maxBirds > 0 ? Math.min(n, maxBirds) : n);
    setReservedBirds(capped);
    // Fewer perches than chosen birds drops the extra birds.
    setSelected((prev) => (prev.length > capped ? prev.slice(0, capped) : prev));
  };

  const toggleBird = (id: number) => {
    if (selected.includes(id)) {
      setSelected((prev) => prev.filter((b) => b !== id));
      return;
    }
    if (reservedBirds <= 0) {
      toast.error("Choose how many perches to reserve first");
      return;
    }
    if (selected.length >= reservedBirds) {
      toast.error(`Maximum ${reservedBirds} birds for this registration`);
      return;
    }
    setSelected((prev) => [...prev, id]);
  };

  const togglePool = (birdId: number, key: string) =>
    setBets((prev) => {
      const current = prev[birdId] ?? [];
      return {
        ...prev,
        [birdId]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
      };
    });

  const validate = (): boolean => {
    if (!loftName.trim()) {
      toast.error("Loft name is required");
      return false;
    }
    if (reservedBirds <= 0) {
      toast.error("Reserve at least one perch");
      return false;
    }
    return true;
  };

  const payload = (paymentIntent?: "PAYPAL" | "CASH") => ({
    loftName: loftName.trim(),
    reservedBirds,
    birds: selected.map((birdId) => ({ birdId })),
    bets: selected
      .filter((birdId) => (bets[birdId] ?? []).length > 0)
      .map((birdId) => ({
        birdId,
        pools: (bets[birdId] ?? []).map((key) => {
          const [category, tierIndex] = key.split(":");
          return { category, tierIndex: Number(tierIndex) };
        }),
      })),
    ...(note.trim() ? { note: note.trim() } : {}),
    ...(paymentIntent ? { paymentIntent } : {}),
  });

  const registerLater = async () => {
    if (!validate()) return;
    setBusy("later");
    try {
      // Where payment is required, "later" is a promise to pay cash.
      await api.post(`/breeder/event/${eventId}/register`, payload(requiresPayment ? "CASH" : undefined));
      Alert.alert(
        "Registered",
        requiresPayment
          ? "Registration recorded with a commitment to pay cash. It takes part once the organizer approves it."
          : "Registration successful. You can pay from the Payments screen. It takes part once the organizer approves it."
      );
      router.back();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Registration failed");
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (inventoryId: number) => {
    try {
      await api.delete(`/breeder/event/${eventId}/registration/${inventoryId}`);
    } catch {
      // The route refuses once anything was captured, which is the right outcome.
    }
  };

  const registerAndPay = async () => {
    if (!validate()) return;
    setBusy("paypal");
    let inventoryId: number | null = null;
    try {
      const reg = await api.post(`/breeder/event/${eventId}/register`, payload("PAYPAL"));
      inventoryId = reg.data?.data?.eventInventory?.id ?? null;
      if (!inventoryId) throw new Error("The registration did not come back with an id");

      const order = await api.post("/payment/paypal/create-order", {
        eventInventoryId: inventoryId,
        currency: "USD",
      });
      const { orderID, approveUrl } = order.data as { orderID: string; approveUrl?: string };
      if (!approveUrl) throw new Error("PayPal did not return an approval link");

      WebBrowser.openBrowserAsync(approveUrl);

      const id = inventoryId;
      let polls = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        polls += 1;
        if (polls > MAX_POLLS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          await rollback(id);
          setBusy(null);
          toast.error("Timed out waiting for PayPal. Nothing was charged and the registration was not kept.");
          return;
        }
        try {
          const status = await api.post("/payment/paypal/check-status", { orderID });
          if (!status.data?.isApproved && !status.data?.isCompleted) return;

          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          try {
            await api.post("/payment/paypal/capture-order", { orderID, eventInventoryId: id });
            Alert.alert("Success", "Payment confirmed. Your registration takes part once the organizer approves it.");
            router.back();
          } catch (captureErr: any) {
            await rollback(id);
            toast.error(captureErr?.response?.data?.message || "Failed to capture payment");
          } finally {
            setBusy(null);
          }
        } catch {
          // One failed check is not a failed payment. Keep polling until the cap.
        }
      }, POLL_MS);
    } catch (err: any) {
      if (inventoryId) await rollback(inventoryId);
      toast.error(err?.response?.data?.message || err?.message || "Could not start the payment");
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Register" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Register" />
        <Text className="text-center text-red-500 mt-10">Event not found or unavailable.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title={`Register · ${event.name ?? ""}`} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {!isOpen ? (
          <View className="rounded-lg border border-red-200 bg-red-50 p-3 mb-3">
            <Text className="text-sm text-red-700">Registration for this event is closed.</Text>
          </View>
        ) : null}
        {requiresPayment ? (
          <View className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3">
            <Text className="text-xs text-amber-800">
              This event requires payment to register. Pay now with PayPal, or commit to paying cash.
            </Text>
          </View>
        ) : null}

        {/* Loft */}
        <View className="bg-white rounded-xl p-3 mb-3">
          <Text className="text-sm font-bold text-gray-800 mb-2">Loft / Team name</Text>
          <TextInput
            className="border border-gray-300 rounded-lg px-3 py-2 text-black"
            value={loftName}
            onChangeText={setLoftName}
            placeholder="Enter loft name"
            placeholderTextColor="#9ca3af"
          />
          {teams.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
              {teams.map((t) => {
                const active = loftName.trim() === t.name;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setLoftName(t.name)}
                    className={`px-3 py-1.5 rounded-full mr-2 border ${
                      active ? "bg-primary border-primary" : "bg-white border-gray-200"
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${active ? "text-white" : "text-gray-700"}`}>{t.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
          <Text className="text-[11px] text-gray-500 mt-2">
            A new name creates a team. One registration per loft name per season.
          </Text>
        </View>

        {/* Perches */}
        <View className="bg-white rounded-xl p-3 mb-3">
          <Text className="text-sm font-bold text-gray-800">Perches to reserve</Text>
          <Text className="text-[11px] text-gray-500">
            {maxBirds > 0 ? `Up to ${maxBirds} per registration. ` : ""}Birds can be named now or later.
          </Text>
          <View className="flex-row items-center mt-2">
            <TouchableOpacity
              onPress={() => setReserved(reservedBirds - 1)}
              className="w-10 h-10 rounded-lg border border-gray-300 items-center justify-center"
            >
              <Ionicons name="remove" size={20} color="#374151" />
            </TouchableOpacity>
            <TextInput
              className="mx-3 w-16 text-center text-lg font-bold text-black border-b border-gray-300"
              keyboardType="number-pad"
              value={String(reservedBirds)}
              onChangeText={(t) => setReserved(parseInt(t.replace(/\D/g, ""), 10) || 0)}
            />
            <TouchableOpacity
              onPress={() => setReserved(reservedBirds + 1)}
              className="w-10 h-10 rounded-lg border border-gray-300 items-center justify-center"
            >
              <Ionicons name="add" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Birds */}
        <View className="bg-white rounded-xl p-3 mb-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-gray-800">
              Birds ({selected.length}/{reservedBirds})
            </Text>
            <TouchableOpacity onPress={() => router.push("/bird-new" as any)} className="flex-row items-center">
              <Ionicons name="add-circle-outline" size={16} color="#189AB4" />
              <Text className="text-xs font-semibold text-primary ml-1">Add a bird</Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center border border-gray-200 rounded-lg px-3 mt-2">
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              className="flex-1 py-2 ml-2 text-sm text-black"
              placeholder="Search band or name"
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>
          {availableBirds.length === 0 ? (
            <Text className="text-xs text-gray-500 text-center py-6">
              {birds.length === 0 ? "You have no birds yet. Add one to enter it." : "No birds match your search."}
            </Text>
          ) : (
            availableBirds.map((b) => {
              const on = selected.includes(b.id);
              return (
                <View key={b.id} className="border-t border-gray-100 mt-2 pt-2">
                  <TouchableOpacity onPress={() => toggleBird(b.id)} className="flex-row items-center">
                    <Ionicons
                      name={on ? "checkbox" : "square-outline"}
                      size={20}
                      color={on ? "#189AB4" : "#9ca3af"}
                    />
                    <View className="ml-2 flex-1">
                      <Text className="text-sm font-semibold text-gray-800">{bandOf(b) || "No band"}</Text>
                      <Text className="text-xs text-gray-500">
                        {b.birdName || "Unnamed"} · {b.color || "-"} ·{" "}
                        {b.sex === 1 ? "Cock" : b.sex === 2 ? "Hen" : "Unknown"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {on && pools.length > 0 ? (
                    <View className="flex-row flex-wrap mt-2 ml-7">
                      {pools.map((p) => {
                        const key = poolKey(p);
                        const picked = (bets[b.id] ?? []).includes(key);
                        return (
                          <TouchableOpacity
                            key={key}
                            onPress={() => togglePool(b.id, key)}
                            className={`px-2 py-1 rounded-md mr-1.5 mb-1.5 border ${
                              picked ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300"
                            }`}
                          >
                            <Text className={`text-[11px] font-semibold ${picked ? "text-white" : "text-gray-700"}`}>
                              {CATEGORY_LABEL[p.category] ?? p.category} {p.tierIndex} · {money(p.amount)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
          {pools.length > 0 ? (
            <Text className="text-[11px] text-gray-500 mt-3">
              Betting pools are optional. A chosen pool is staked for that bird in each of the season&apos;s{" "}
              {races.length} race{races.length === 1 ? "" : "s"}.
            </Text>
          ) : null}
        </View>

        {/* Note */}
        <View className="bg-white rounded-xl p-3 mb-3">
          <Text className="text-sm font-bold text-gray-800 mb-2">Note to the organizer (optional)</Text>
          <TextInput
            className="border border-gray-300 rounded-lg px-3 py-2 text-black"
            style={{ minHeight: 64, textAlignVertical: "top" }}
            multiline
            value={note}
            onChangeText={setNote}
            placeholder="Anything the organizer should know"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Fees */}
        <View className="bg-white rounded-xl p-3 mb-3">
          <Text className="text-sm font-bold text-gray-800 mb-2">Fee summary</Text>
          {!feeScheme ? (
            <Text className="text-xs text-gray-500">This season has no fee scheme set.</Text>
          ) : !fees ? (
            <Text className="text-xs text-gray-500">Reserve perches to see the fees.</Text>
          ) : (
            <>
              <FeeLine label="Entry fee" value={fees.purgeFee} />
              <FeeLine label={`Perch fees (${reservedBirds})`} value={fees.perchFees} />
              <FeeLine label="Race fees" value={fees.raceFees} />
              <FeeLine label="Hot spot" value={fees.hotspotBilled} />
              <FeeLine label="Bet stakes" value={betStakes} />
              <View className="flex-row justify-between pt-2 mt-2 border-t border-gray-200">
                <Text className="text-base font-bold text-gray-900">Estimated total</Text>
                <Text className="text-base font-bold text-primary">{money(total)}</Text>
              </View>
              <Text className="text-[11px] text-gray-500 mt-1">
                The portal works out the final amount when the registration is made.
              </Text>
            </>
          )}
        </View>

        <TouchableOpacity
          onPress={registerAndPay}
          disabled={busy !== null || !isOpen}
          className={`py-4 rounded-lg items-center ${busy !== null || !isOpen ? "bg-gray-300" : "bg-[#FFC439]"}`}
        >
          {busy === "paypal" ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text className="text-black font-bold text-base">Register & Pay with PayPal</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={registerLater}
          disabled={busy !== null || !isOpen}
          className="border-2 border-primary py-4 rounded-lg items-center mt-3"
        >
          {busy === "later" ? (
            <ActivityIndicator color="#189AB4" />
          ) : (
            <Text className="text-primary font-bold text-base">
              {requiresPayment ? "Register & Pay Cash" : "Register & Pay Later"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

function FeeLine({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-xs text-gray-600">{label}</Text>
      <Text className="text-xs text-gray-800">{money(value)}</Text>
    </View>
  );
}

export default RegisterInEvent;
