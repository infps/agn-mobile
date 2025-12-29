import Header from "@/components/header";
import PayPalButton from "@/components/PayPalButton";
import { useAuth, useBirds, useToast } from "@/context";
import { BirdType } from "@/context/BirdContext";
import { EventType, useEvents } from "@/context/EventContext";
import api from "@/service/api.service";
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const RegisterInEvent = () => {
  const { eventId } = useLocalSearchParams();
  const { currentEvent, getEvent, loading } = useEvents();
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedBirds, setSelectedBirds] = useState<BirdType[]>([]);
  const { user } = useAuth();
  const toast = useToast();

  useEffect(() => {
    getEvent(Number(eventId));
  }, [eventId]);
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!currentEvent) {
    return <Text>No event selected</Text>; // or null
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
            <View className="w-[48%]">
              <Text className="mt-6">Name</Text>
              <View className="border-2 border-cyan-600 rounded-xl px-2 py-2 bg-gray-50 mt-1">
                <TextInput
                  placeholder="Last Name"
                  placeholderTextColor="#9CA3AF"
                  className="text-[12px] py-0"
                  autoCapitalize="none"
                  value={`${user?.firstName} ${user?.lastName}`}
                />
              </View>
            </View>
            <View className="w-[48%]">
              <Text className="mt-6">Email</Text>
              <View className="border-2 border-cyan-600 rounded-xl px-2 py-2 bg-gray-50 mt-1">
                <TextInput
                  placeholder="Email"
                  placeholderTextColor="#9CA3AF"
                  className="text-[12px] py-0"
                  autoCapitalize="none"
                  value={user?.loginName}
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
            breederId={user?.idBreeder.toString() || ""}
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
          {event._count.eventInventories}
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
        const res = await api.get(
          `https://api.infps-demo.com/api/users/teams/${breederId}`
        );
        setTeams(res.data.data);
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
            key={team.teamId}
            label={team.teamName}
            value={team.teamId}
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

    if (!selectedBirds.find((b: BirdType) => b.idBird === bird.idBird)) {
      setSelectedBirds([...selectedBirds, bird]);
      toast.success(`${bird.birdName} added to registration`);
    } else {
      toast.info(`${bird.birdName} is already selected`);
    }
  };

  const handleRemoveBird = (birdId: string) => {
    const bird = selectedBirds.find((b: BirdType) => b.idBird === birdId);
    setSelectedBirds(
      selectedBirds.filter((bird: BirdType) => bird.idBird !== birdId)
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
                (b: BirdType) => b.idBird === bird.idBird
              );
              const isDisabled =
                !isSelected && selectedBirds.length >= maxBirdCount;

              return (
                <TouchableOpacity
                  key={bird.idBird}
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
                        Sex: {bird.sex}
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
                key={bird.idBird}
                className="flex-row items-center justify-between p-4 bg-gray-50 rounded-lg border"
              >
                <View className="flex-1">
                  <Text className="font-medium text-gray-900">
                    {bird.birdName}
                  </Text>
                  <View className="flex gap-4 text-sm text-gray-600">
                    <Text>Color: {bird.color}</Text>
                    <Text>Sex: {bird.sex}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => bird.idBird && handleRemoveBird(bird.idBird)}
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
  console.log(event);
  // Calculate total based on individual perch fees for each bird position
  const calculateTotalAmount = () => {
    let total = 0;
    selectedBirds.forEach((_, index) => {
      const perchFeeItem = event?.feeScheme?.perchFeeItems.find(
        (item) => item.birdNo === index + 1
      );
      if (perchFeeItem) {
        total += perchFeeItem.perchFee;
      }
    });
    return total;
  };

  const totalAmount = calculateTotalAmount();

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

        <View className="space-y-3">
          <Text className="font-medium text-gray-700 mb-3 text-sm sm:text-base">
            Registered Birds:
          </Text>
          <View className="max-h-48 overflow-y-auto space-y-2">
            {selectedBirds.map((bird, index) => {
              const perchFeeItem = event.feeScheme.perchFeeItems.find(
                (item) => item.birdNo === index + 1
              );
              const perchFee = perchFeeItem?.perchFee || 0;

              return (
                <View
                  key={bird.idBird}
                  className="flex-row justify-between items-center py-2 px-3 bg-gray-50 rounded text-sm"
                >
                  <Text className="text-black" style={{color: 'black', fontSize: 14}}>
                    Bird #{index + 1}: {bird.birdName || 'Unknown'} - ({bird.color || 'Unknown'})
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
          <View className="w-full max-w-md">
            <PayPalButton 
              eventId={event.idEvent} 
              selectedBirds={selectedBirds}
              selectedTeam={selectedTeam}
              totalAmount={totalAmount}
              onSuccess={() => {
                toast.success('Payment successful! Registration completed.');
                // Navigate to success page or reset form
              }}
              onError={(error: string) => {
                toast.error(error);
              }}
            />
          </View>
        </View>

        <View className="mt-4 text-center">
          <Text className="text-xs text-gray-500">
            Secure payment processing • All payments are encrypted and secure
          </Text>
        </View>
      </View>
    </View>
  );
}
