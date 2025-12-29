import Header from "@/components/header";
import React from "react";
import {
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View
} from "react-native";
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
const Race = () => {
  return (
    <SafeAreaView>
      <Header title="Race" />
      <View className="p-2">
        <View className="flex-row justify-between border-b border-gray-500">
          <View>
            <Text>Join Race</Text>
            <Text>12</Text>
          </View>
          <View>
            <Text>Races</Text>
            <Text>0</Text>
          </View>
        </View>
        <Text className="font-bold">Races</Text>
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

export default Race;
