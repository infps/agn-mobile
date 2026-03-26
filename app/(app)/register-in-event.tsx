import Header from "@/components/header";
import PayPalButton from "@/components/PayPalButton";
import { getSexLabel } from "@/constants/bird";
import { useAuth, useBirds, useToast } from "@/context";
import { BirdType } from "@/context/BirdContext";
import { EventType, useEvents } from "@/context/EventContext";
import api from "@/service/api.service";
import { calculateFees } from "@/utils/fee-calculator";
import { Picker } from "@react-native-picker/picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

const RegisterInEvent = () => {
  const { eventId } = useLocalSearchParams();
  const { currentEvent, getEvent, getMyEventInventories, loading } = useEvents();
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedBirds, setSelectedBirds] = useState<BirdType[]>([]);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const { user } = useAuth();
  const toast = useToast();

  useEffect(() => {
    getEvent(eventId.toString());
  }, [eventId]);

  useEffect(() => {
    const checkRegistration = async () => {
      try {
        const inventories = await getMyEventInventories();
        const registered = inventories.some(
          (inv: any) => String(inv.eventId) === eventId.toString()
        );
        setAlreadyRegistered(registered);
      } catch {
        // ignore - allow registration attempt
      } finally {
        setCheckingRegistration(false);
      }
    };
    if (user) checkRegistration();
  }, [eventId, user]);

  if (loading || checkingRegistration) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!currentEvent) {
    return <Text>No event selected</Text>;
  }
  const liveRace = currentEvent.races?.find(r => !!r.startTime && r.isClosed !== 1);
  if (liveRace) {
    return (
      <SafeAreaView className="flex-1 bg-[#f5f5f5]">
        <Header title="Register In Event" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-2xl font-bold text-red-600 mb-4">Race is Live</Text>
          <Text className="text-gray-600 text-center text-base mb-6">
            Registration is closed because a race is currently live for this event.
          </Text>
          <TouchableOpacity
            className="bg-red-500 px-6 py-3 rounded-lg"
            onPress={() => router.push({ pathname: "/live-race", params: { raceId: String(liveRace.id) } })}
          >
            <Text className="text-white font-semibold text-base">Watch Live</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (alreadyRegistered) {
    return (
      <SafeAreaView className="flex-1 bg-[#f5f5f5]">
        <Header title="Register In Event" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-2xl font-bold text-primary mb-4">Already Registered</Text>
          <Text className="text-gray-600 text-center text-base">
            You have already registered for this event. Check "My Events" to view your registration.
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <ScrollView>
        <Header title="Register In Event" />
        <EventCount event={currentEvent} />
        <View className="p-4">
          <Text className="font-bold text-xl mt-6 text-primary">
            Owner Information
          </Text>
          <View className="flex-row justify-between">
            <View className="w-[31%]">
              <Text className="mt-6">First Name</Text>
              <View className="border-2 border-cyan-600 rounded-xl px-2 py-2 bg-gray-50 mt-1">
                <TextInput
                  placeholder="First Name"
                  placeholderTextColor="#9CA3AF"
                  className="text-[12px] py-0 text-black"
                  autoCapitalize="none"
                  editable={false}
                  value={user?.name?.split(" ")[0] ?? ""}
                />
              </View>
            </View>
            <View className="w-[31%]">
              <Text className="mt-6">Last Name</Text>
              <View className="border-2 border-cyan-600 rounded-xl px-2 py-2 bg-gray-50 mt-1">
                <TextInput
                  placeholder="Last Name"
                  placeholderTextColor="#9CA3AF"
                  className="text-[12px] py-0 text-black"
                  autoCapitalize="none"
                  editable={false}
                  value={user?.lastName ?? user?.name?.split(" ").slice(1).join(" ") ?? ""}
                />
              </View>
            </View>
            <View className="w-[31%]">
              <Text className="mt-6">Email</Text>
              <View className="border-2 border-cyan-600 rounded-xl px-2 py-2 bg-gray-50 mt-1">
                <TextInput
                  placeholder="Email"
                  placeholderTextColor="#9CA3AF"
                  className="text-[12px] py-0 text-black"
                  autoCapitalize="none"
                  editable={false}
                  value={user?.email}
                />
              </View>
            </View>
          </View>
          <Text className="font-bold text-xl mt-6 text-primary">
            Team / Loft Information
          </Text>
          <Text className="mt-6">Select Team (Optional)</Text>
          <TeamSelect
            selectedValue={selectedTeam}
            onValueChange={(itemValue: any) => setSelectedTeam(itemValue)}
            breederId={user?.id || ""}
          />
          <SelectBirds
            event={currentEvent}
            setSelectedBirds={setSelectedBirds}
            selectedBirds={selectedBirds}
            toast={toast}
          />
        </View>
        {selectedBirds.length > 0 && (
          <PaymentInformation
            event={currentEvent}
            selectedBirds={selectedBirds}
            selectedTeam={selectedTeam}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default RegisterInEvent;

const EventCount = ({ event }: { event: EventType }) => {
  const [timeRemaining, setTimeRemaining] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  useEffect(() => {
    if (!event?.eventDate) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const eventTime = new Date(event.eventDate).getTime();
      const difference = eventTime - now;

      if (difference > 0) {
        const hours = Math.floor(difference / (1000 * 60 * 60));
        const minutes = Math.floor(
          (difference % (1000 * 60 * 60)) / (1000 * 60)
        );
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeRemaining({ hours, minutes, seconds });
      } else {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [event?.eventDate]);

  return (
    <View className="flex-row justify-between mt-4">
      <View className="border-r border-gray-400 px-2 w-[25%]">
        <Text className="text-lg font-bold mb-2 text-center">
          {event._count?.eventInventories ?? event.eventInventories?.length ?? 0}
        </Text>
        <Text className="text-xs text-gray-600 text-center">
          Total Registrations
        </Text>
      </View>
      <View className="border-r border-gray-400 px-2 w-[25%]">
        <Text className="text-lg font-bold mb-2 text-center">
          {timeRemaining.hours}
        </Text>
        <Text className="text-xs text-gray-600 text-center">Hours</Text>
      </View>
      <View className="border-r border-gray-400 px-2 w-[25%]">
        <Text className="text-lg font-bold mb-2 text-center">
          {timeRemaining.minutes}
        </Text>
        <Text className="text-xs text-gray-600 text-center">Minutes</Text>
      </View>
      <View className="px-2 border-gray-400 w-[25%]">
        <Text className="text-lg font-bold mb-2 text-center">
          {timeRemaining.seconds}
        </Text>
        <Text className="text-xs text-gray-600 text-center">Seconds</Text>
      </View>
    </View>
  );
};
const TeamSelect = ({ selectedValue, onValueChange, breederId }: any) => {
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    const getTeams = async () => {
      try {
        const res = await api.get("/breeder/teams", { params: { breederId } });
        setTeams(res.data.teams);
      } catch (err: any) {
        console.log(err.message);
      }
    };
    getTeams();
  }, [breederId]);
  return (
    <View className="mt-1 border-2 border-cyan-600 rounded-xl bg-gray-50">
      <Picker
        selectedValue={selectedValue}
        onValueChange={onValueChange}
        style={{ height: 50 }}
        dropdownIconColor="#000"
      >
        <Picker.Item label="Main Loft (Default)" value="" />
        {teams?.map((team: any) => (
          <Picker.Item
            key={team.id}
            label={team.name}
            value={team.id}
          />
        ))}
      </Picker>
    </View>
  );
};

const SelectBirds = ({
  event,
  setSelectedBirds,
  selectedBirds,
  toast,
}: any) => {
  const { birds, fetchBirds } = useBirds();
  const maxBirdCount = event?.feeScheme?.maxBirdCount || 0;
  useEffect(() => {
    fetchBirds();
  }, []);
  const handleAddBird = (bird: BirdType) => {
    if (selectedBirds.length >= maxBirdCount) {
      toast.error(`Maximum ${maxBirdCount} birds allowed for this event`);
      return;
    }

    if (!selectedBirds.find((b: BirdType) => b.id === bird.id)) {
      setSelectedBirds([...selectedBirds, bird]);
      toast.success(`${bird.birdName} added to registration`);
    } else {
      toast.info(`${bird.birdName} is already selected`);
    }
  };

  const handleRemoveBird = (birdId: number) => {
    const bird = selectedBirds.find((b: BirdType) => b.id === birdId);
    setSelectedBirds(
      selectedBirds.filter((bird: BirdType) => bird.id !== birdId)
    );
    if (bird) {
      toast.success(`${bird.birdName} removed from registration`);
    }
  };

  const handleClearAll = () => {
    setSelectedBirds([]);
    toast.success("All birds removed from registration");
  };
  return (
    <View>
      <Text className="font-bold text-xl mt-6 text-primary">
        Bird Information
      </Text>
      {maxBirdCount > 0 && (
        <View className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Text className="text-sm text-blue-800">
            <Text className="font-semibold">Note:</Text> You can register a
            maximum of <Text className="font-bold">{maxBirdCount}</Text> birds
            for this event.
            {selectedBirds.length > 0 && (
              <Text className="ml-2">
                ({selectedBirds.length} / {maxBirdCount} selected)
              </Text>
            )}
          </Text>
        </View>
      )}
      <View className="mb-8">
        <Text className="text-lg font-semibold mb-4">
          Select Birds to Register
        </Text>
        {birds.length === 0 ? (
          <Text className="text-gray-500">
            No birds available. Please add birds to your account first.
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-4 justify-between">
            {birds.map((bird) => {
              const isSelected = selectedBirds.find(
                (b: BirdType) => b.id === bird.id
              );
              const isDisabled =
                !isSelected && selectedBirds.length >= maxBirdCount;

              return (
                <TouchableOpacity
                  key={bird.id}
                  className={`border w-[48%] rounded-lg p-4 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 cursor-pointer"
                      : isDisabled
                        ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                        : "border-gray-200 hover:border-primary/50 cursor-pointer"
                  }`}
                  onPress={() => !isDisabled && handleAddBird(bird)}
                >
                  <View className="flex-row justify-between items-start">
                    <View>
                      <Text className="font-medium text-gray-900">
                        {bird.birdName}
                      </Text>
                      <Text className="text-sm text-gray-600">
                        Color: {bird.color}
                      </Text>
                      <Text className="text-sm text-gray-600">
                        Sex: {getSexLabel(bird.sex)}
                      </Text>
                    </View>
                    {!isSelected && <View className="w-14 h-4" />}
                    {isSelected && (
                      <Text className="text-primary text-sm font-medium">
                        ✓ Selected
                      </Text>
                    )}
                    {isDisabled && (
                      <Text className="text-gray-400 text-xs font-medium">
                        Limit reached
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Selected Birds Section */}
      {selectedBirds.length > 0 && (
        <View>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold">
              Selected Birds ({selectedBirds.length})
            </Text>
            <TouchableOpacity
              onPress={handleClearAll}
              className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 border border-red-200 rounded hover:bg-red-50 transition-colors"
            >
              <Text>Clear All</Text>
            </TouchableOpacity>
          </View>
          <View className="space-y-3">
            {selectedBirds.map((bird: BirdType) => (
              <View
                key={bird.id}
                className="flex-row items-center justify-between p-4 bg-gray-50 rounded-lg border mb-2"
              >
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">
                    {bird.birdName}
                  </Text>
                  <View className="flex gap-4 text-sm text-gray-600">
                    <Text>Color: {bird.color}</Text>
                    <Text>Sex: {getSexLabel(bird.sex)}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => bird.id != null && handleRemoveBird(bird.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 border border-red-200 rounded hover:bg-red-50 transition-colors ml-4"
                >
                  <Text>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

function PaymentInformation({
  event,
  selectedBirds,
  selectedTeam,
}: {
  event: EventType;
  selectedBirds: BirdType[];
  selectedTeam: string;
}) {
  const toast = useToast();
  const [payLaterLoading, setPayLaterLoading] = useState(false);

  const fees = useMemo(() => {
    if (!event?.feeScheme || selectedBirds.length === 0) return null;
    const fs = event.feeScheme;
    // Use birdFeeItems if available, fall back to perchFeeItems (legacy)
    const birdFeeItems = fs.birdFeeItems?.length
      ? fs.birdFeeItems.map((b: any) => ({ birdNo: b.birdNo, birdFee: b.birdFee }))
      : (fs.perchFeeItems || []).map((p: any) => ({ birdNo: p.birdNo, birdFee: p.perchFee }));
    return calculateFees({
      numBirds: selectedBirds.length,
      feeScheme: {
        entryFee: fs.entryFee ?? 0,
        raceFeeMode: fs.raceFeeMode ?? "PER_BIRD_PER_RACE",
        hotSpot1Fee: fs.hotSpot1Fee ?? null,
        hotSpot2Fee: fs.hotSpot2Fee ?? null,
        hotSpot3Fee: fs.hotSpot3Fee ?? null,
        hotSpotFinalFee: fs.hotSpotFinalFee ?? null,
        birdFeeItems,
        raceTypeFees: (fs.raceTypeFees || []).map((rt: any) => ({
          raceTypeId: rt.raceTypeId,
          fee: rt.fee,
        })),
      },
      races: (event.races || []).map((r: any) => ({ raceTypeId: r.raceTypeId })),
    });
  }, [event?.feeScheme, event?.races, selectedBirds.length]);
  const onApprove = async () => {
    try {
      if (selectedBirds.length === 0) {
        return toast.error("No birds selected for registration");
      }
      const birds: number[] = selectedBirds.map((bird) => {
        if (!bird.id) {
          toast.error("Bird ID is required for registration");
          return 0;
        }
        return bird.id;
      });
      const res = await api.post("/event-inventory", {
        eventId: event.id,
        birds,
        selectedTeam,
      });
      const orderId: string = res?.data?.data?.orderId;
      if (!orderId) {
        return toast.error("No order ID received");
      }
      toast.success("Event registered successfully");
    } catch (err) {
      console.log(err);
      toast.error("Failed to register event");
    }
  };
  const onCancel = async (data: Record<string, unknown>) => {
    try {
      const orderID = data.orderID as string;
      if(!orderID){
        return toast.error("No order ID received");
      }
      toast.info("Cancelling registration...");
      const res = await api.post(`/payments/cancel`, { orderID });
      const orderId = res?.data?.data?.orderId;
      if (!orderId) {
        return toast.error("No order ID received");
      }
      toast.success("Registration cancelled successfully");
    } catch (err) {
      console.log(err);
      toast.error("Failed to cancel registration");
    }
  };
  const handlePayLater = async () => {
    if (selectedBirds.length === 0) {
      return toast.error("No birds selected for registration");
    }
    setPayLaterLoading(true);
    try {
      const birds = selectedBirds.map((b) => ({
        name: b.birdName,
        color: b.color,
        sex: b.sex ?? 0,
        band1: b.band1 || "",
        band2: b.band2 || "",
        band3: b.band3 || "",
        band4: b.band4 || "",
      }));
      await api.post(`/breeder/event/${event.id}/register`, {
        loftName: selectedTeam || "Default",
        reservedBirds: birds.length,
        birds,
        payments: [],
      });
      Alert.alert(
        "Registered",
        "Registration successful! You can pay later from the Payments screen."
      );
      router.back();
    } catch (err: any) {
      const msg =
        err.response?.data?.message || err.message || "Registration failed";
      toast.error(msg);
    } finally {
      setPayLaterLoading(false);
    }
  };

  const totalAmount = fees?.total ?? 0;

  return (
    <View className="p-4 sm:p-6 lg:p-8 xl:p-10 w-full border-t bg-gray-50">
      <Text className="font-bold text-secondary mb-6 text-xl sm:text-2xl md:text-3xl lg:text-4xl">
        Payment Information
      </Text>

      <View className="bg-white rounded-lg p-4 sm:p-6 shadow-sm">
        <View className="space-y-4 mb-6">
          <View className="flex-row justify-between items-center py-2 border-b">
            <Text className="text-gray-600 text-sm sm:text-base">
              Number of Birds:
            </Text>
            <Text className="font-medium text-sm sm:text-base">
              {selectedBirds.length} / {event.feeScheme.maxBirdCount}
            </Text>
          </View>
        </View>

        {/* Fee Breakdown */}
        {fees && (
          <View className="space-y-2 mb-4">
            <View className="flex-row justify-between items-center py-1">
              <Text className="text-gray-600 text-sm">Purge Fee:</Text>
              <Text className="font-medium text-sm">${fees.purgeFee.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center py-1">
              <Text className="text-gray-600 text-sm">Perch Fees ({selectedBirds.length} birds):</Text>
              <Text className="font-medium text-sm">${fees.perchFees.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center py-1">
              <Text className="text-gray-600 text-sm">Race Fees:</Text>
              <Text className="font-medium text-sm">${fees.raceFees.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between items-center py-1">
              <Text className="text-gray-600 text-sm">Hotspot Fees:</Text>
              <Text className="font-medium text-sm">${fees.hotspotFees.toFixed(2)}</Text>
            </View>
          </View>
        )}

        <View className="space-y-3">
          <Text className="font-medium text-gray-700 mb-3 text-sm sm:text-base">
            Registered Birds:
          </Text>
          <View className="max-h-48 overflow-y-auto space-y-2">
            {selectedBirds.map((bird, index) => {
              const perchFee = fees?.perBirdBreakdown[index]?.perchFee ?? 0;

              return (
                <View
                  key={bird.id}
                  className="flex-row justify-between items-center py-2 px-3 bg-gray-50 rounded text-sm"
                >
                  <Text
                    className="text-black"
                    style={{ color: "black", fontSize: 14 }}
                  >
                    Bird #{index + 1}: {bird.birdName || "Unknown"} - (
                    {bird.color || "Unknown"})
                  </Text>
                  <Text className="font-medium text-green-600 ml-2">
                    ${perchFee.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
        <View className="flex-row justify-between items-center py-3 border-b-2 border-t mt-2 border-secondary">
          <Text className="text-base sm:text-lg font-semibold text-secondary">
            Total Amount:
          </Text>
          <Text className="text-lg sm:text-xl font-bold text-secondary">
            ${totalAmount.toFixed(2)}
          </Text>
        </View>
        <View className="mt-8 flex w-full justify-center">
          <View className="w-full max-w-md gap-3">
            <PayPalButton
              eventId={event.id}
              selectedBirds={selectedBirds}
              selectedTeam={selectedTeam}
              totalAmount={totalAmount}
              onConfirm={onApprove}
              onSuccess={onApprove}
              onCancel={onCancel}
              onError={(error: string) => {
                toast.error(error);
              }}
            />
            <TouchableOpacity
              onPress={handlePayLater}
              disabled={payLaterLoading}
              className="border-2 border-primary py-4 rounded-lg items-center"
            >
              {payLaterLoading ? (
                <ActivityIndicator color="#189AB4" />
              ) : (
                <Text className="text-primary font-bold text-lg">
                  Register & Pay Later
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 text-center">
          <Text className="text-xs text-gray-500">
            Pay later option available • View pending payments in Payments tab
          </Text>
        </View>
      </View>
    </View>
  );
}
