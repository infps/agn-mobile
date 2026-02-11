import Header from "@/components/header";
import { useEvents } from "@/context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
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
  return (
    <SafeAreaView className="flex-1">
      <Header title={currentEvent ? currentEvent?.name : "Event Name"} />
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
            ${currentEvent?.feeScheme.perchFeeItems[0]?.fee ?? "N/A"}
          </Text>
        </View>
        <View>
          <Text className="text-sm font-bold ml-4">Race Date</Text>
          <Text className="text-center text-sm">
            {currentEvent
              ? format(new Date(currentEvent.startDate), "MMM dd, yyyy")
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
      {currentEvent?.races?.some(r => r.isLive) && (
        <TouchableOpacity
          className="mx-4 mt-3 bg-red-500 py-3 rounded-lg flex-row items-center justify-center gap-2"
          onPress={() => {
            const liveRace = currentEvent.races?.find(r => r.isLive);
            if (liveRace) router.push({ pathname: "/live-race", params: { raceId: liveRace.raceId } });
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
          <Text className="text-white font-bold text-base">Watch Live Race</Text>
        </TouchableOpacity>
      )}
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
      <View className="flex-row bg-primary justify-between bg-gray-100 p-3 border-b border-gray-200">
        <View className="w-12">
          <Text className="font-bold text-sm text-white">#</Text>
        </View>
        <View className="w-32">
          <Text className="font-bold text-sm text-center text-white">
            Breeder Name
          </Text>
        </View>
        <View className="w-32">
          <Text className="font-bold text-sm text-center text-white">Loft Name</Text>
        </View>
        <View className="w-18">
          <Text className="font-bold text-sm text-white">Total Birds</Text>
        </View>
      </View>
      {loading ? (
        [1, 2, 3, 4, 5].map((_, index) => (
          <View className="p-2 mr-4 flex-row justify-between" key={index}>
            <View className="w-full h-8 bg-gray-200 rounded" />
            <View className="w-full h-8 bg-gray-200 rounded" />
            <View className="w-full h-8 bg-gray-200 rounded" />
            <View className="w-full h-8 bg-gray-200 rounded" />
            <View className="w-full h-8 bg-gray-200 rounded" />
            <View className="w-full h-8 bg-gray-200 rounded" />
          </View>
        ))
      ) : (
        <FlatList
          data={participants}
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
