import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
const carouselItems = [
  {
    id: "1",
    title: "Race 1",
    description: "Upcoming race in 2 days",
    image:
      "https://static.independent.co.uk/s3fs-public/thumbnails/image/2015/08/19/23/web-racing-pigeons-getty.jpg?quality=75&width=1250&crop=3%3A2%2Csmart&auto=webp",
  },
  {
    id: "2",
    title: "Race 2",
    description: "Starts in 5 days",
    image:
      "https://static.independent.co.uk/s3fs-public/thumbnails/image/2015/08/19/23/web-racing-pigeons-getty.jpg?quality=75&width=1250&crop=3%3A2%2Csmart&auto=webp",
  },
  {
    id: "3",
    title: "Race 3",
    description: "Next week",
    image:
      "https://static.independent.co.uk/s3fs-public/thumbnails/image/2015/08/19/23/web-racing-pigeons-getty.jpg?quality=75&width=1250&crop=3%3A2%2Csmart&auto=webp",
  },
  {
    id: "4",
    title: "Race 4",
    description: "This week",
    image:
      "https://static.independent.co.uk/s3fs-public/thumbnails/image/2015/08/19/23/web-racing-pigeons-getty.jpg?quality=75&width=1250&crop=3%3A2%2Csmart&auto=webp",
  },
];
const Result = () => {
  const router = useRouter();
  return (
    <SafeAreaView>
      <View className={`bg-primary px-2 py-4 flex-row justify-between w-full`}>
        <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-center text-xl font-bold w-[95%]">
          Result
        </Text>
      </View>
      <View className="p-2">
        <FlatList
          data={carouselItems}
          numColumns={2} // This will make it show 2 items per row
          columnWrapperStyle={{ justifyContent: "space-between" }} // This adds space between items
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 2 }} // Add some horizontal padding
          renderItem={({ item }) => (
            <View className="bg-white shadow rounded-lg mt-4 w-[48%] mb-4 justify-between">
              <Image
                source={{ uri: item.image }}
                className="w-full h-36 rounded-t-lg"
              />
              <View className="p-3">
                <Text className="font-semibold text-gray-800">
                  {item.title}
                </Text>
                <Text className="text-gray-500 text-xs mt-1">
                  {item.description}
                </Text>
                <TouchableOpacity className="mt-2 bg-white py-2 items-center border border-primary w-full">
                  <Text className="text-primary text-sm font-medium">
                    View Result
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
};

export default Result;
