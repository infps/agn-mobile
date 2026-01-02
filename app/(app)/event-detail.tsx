import Header from "@/components/header";
import { useEvents } from "@/context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const EventDetail = () => {
  const { id } = useLocalSearchParams();
  const {
    getEvent,
    currentEvent,
    getEventParticipants,
    participants,
    loading,
  } = useEvents();
  useEffect(() => {
    if (id) {
      getEvent(id as string);
      getEventParticipants(id as string);
    }
  }, [id, getEvent, getEventParticipants]);
  console.log(participants);
  return (
    <SafeAreaView className="flex-1">
      <Header title={currentEvent ? currentEvent?.eventName : "Event Name"} />
      <View className="flex-row mx-4 py-4 justify-between border-b border-gray-400">
        <View>
          <Text className="text-sm font-bold text-black text-center">
            Entry Fee
          </Text>
          <Text className="text-center text-sm">
            ${currentEvent?.feeScheme?.entryFee ?? "N/A"}
          </Text>
        </View>
        <View>
          <Text className="text-sm font-bold text-black text-center">
            Perch Fee
          </Text>
          <Text className="text-center text-sm">
            ${currentEvent?.feeScheme.perchFeeItems[0].perchFee ?? "N/A"}
          </Text>
        </View>
        <View>
          <Text className="text-sm font-bold text-black">Final Race Fee</Text>
          <Text className="text-center text-sm">
            ${currentEvent?.feeScheme.hotSpotFinalFee ?? "N/A"}
          </Text>
        </View>
        <View>
          <Text className="text-sm font-bold ml-4">Race Date</Text>
          <Text className="text-center text-sm">
            {currentEvent
              ? format(new Date(currentEvent.eventDate), "MMM dd, yyyy")
              : ""}
          </Text>
        </View>
        <View>
          <Text className="text-sm font-bold text-black">Participants</Text>
          <Text className="text-center text-sm">
            {currentEvent?._count.eventInventories ?? "N/A"}
          </Text>
        </View>
      </View>
      <View className="flex-row p-4 justify-between">
        <View className="flex-row items-center">
          <Ionicons name="people-outline" size={24} />
          <Text className="text-lg ml-2">Registered Participants</Text>
        </View>
        <View className="rounded-2xl bg-primary px-4 py-2">
          <Text className="text-white text-sm">
            {currentEvent?._count.eventInventories ?? "0"} Breeders
          </Text>
        </View>
      </View>
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={participants}
          ListHeaderComponent={() => (
            <View className="flex-row justify-between bg-gray-100 p-3 border-b border-gray-200">
              <View className="w-12">
                <Text className="font-bold text-sm">#</Text>
              </View>
              <View className="w-32">
                <Text className="font-bold text-sm text-center">
                  Breeder Name
                </Text>
              </View>
              <View className="w-32">
                <Text className="font-bold text-sm text-center">Loft Name</Text>
              </View>
              <View className="w-18">
                <Text className="font-bold text-sm">Total Birds</Text>
              </View>
            </View>
          )}
          renderItem={({ item, index }) => (
            <View className="flex-row justify-between p-4 border-b border-gray-200">
              <View className="w-12">
                <Text className="text-sm">{index + 1}</Text>
              </View>
              <View className="w-32">
                <Text className="text-sm text-left">
                  {item?.breederName || "Unknown Breeder"}
                </Text>
              </View>
              <View className="w-32">
                <Text className="text-sm text-left">
                  {item?.loft || "Not specified"}
                </Text>
              </View>
              <View className="w-18">
                <Text className="text-sm text-center">
                  {item?.birds?.length || "0"}
                </Text>
              </View>
            </View>
          )}
          keyExtractor={(_, index) => index.toString()}
          ListEmptyComponent={() => (
            <View className="p-4 items-center">
              <Text className="text-gray-500">No participants found</Text>
            </View>
          )}
          className="flex-1"
        />
      )}
    </SafeAreaView>
  );
};

export default EventDetail;
