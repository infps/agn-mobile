import Header from "@/components/header";
import api from "@/service/api.service";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const MyEvent = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const getUserEvent = async () => {
      const res = await api.get("/event-inventory/my-events");
      if (res.data.success) {
        setEvents(res.data.data);
        setLoading(false);
      } else {
        setLoading(false);
      }
    };
    getUserEvent();
  }, []);
  return (
    <SafeAreaView className="flex-1">
      <Header title="My Event" />
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={events}
          ListHeaderComponent={() => (
            <View className="flex-row justify-between bg-primary p-3 mt-4 border-b border-gray-200">
              <View className="w-12">
                <Text className="font-bold text-sm text-white">SI. No.</Text>
              </View>
              <View className="w-30">
                <Text className="font-bold text-sm text-center text-white">
                  Event Name
                </Text>
              </View>
              <View className="w-30">
                <Text className="font-bold text-sm text-center text-white">
                  Event Date
                </Text>
              </View>
              <View className="w-18">
                <Text className="font-bold text-sm text-white">
                  Reserved Birds
                </Text>
              </View>
              <View className="w-18">
                <Text className="font-bold text-sm text-white">Loft</Text>
              </View>
            </View>
          )}
          renderItem={({ item, index }) => (
            <View className="flex-row justify-between p-4 border-b border-gray-200">
              <View className="w-16">
                <Text className="text-sm">{index + 1}</Text>
              </View>
              <View className="w-30">
                <Text className="text-sm text-left">
                  {format(new Date(item?.event?.eventDate), "MMM dd, yyyy") ||
                    "Unknown Date"}
                </Text>
              </View>
              <View className="w-32">
                <Text className="text-sm text-center">
                  {item?.event?.eventName || "Not specified"}
                </Text>
              </View>
              <View className="w-[20%]">
                <Text className="text-sm text-center">
                  {item?.reservedBirds || "0"}
                </Text>
              </View>
              <View className="w-[20%]">
                <Text className="text-sm text-center">{item?.loft || "0"}</Text>
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

export default MyEvent;
