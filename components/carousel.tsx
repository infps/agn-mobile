import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const CARD_WIDTH = (Dimensions.get("window").width - 148) / 1.5; // For 2.5 items
const CARD_SPACING = 12;
const CARD_FULL_WIDTH = CARD_WIDTH + CARD_SPACING;
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
const Carousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const scrollToIndex = (direction: "prev" | "next") => {
    const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex <= carouselItems.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: newIndex,
        animated: true,
      });
      setCurrentIndex(newIndex);
    }
  };
  return (
    <View className="mt-8">
      <View className="flex-row justify-between items-center px-4 mb-3">
        <Text className="text-xl font-bold">Ongoing Races</Text>
        <TouchableOpacity>
          <Text className="text-blue-500">See All</Text>
        </TouchableOpacity>
      </View>

      <View className="relative">
        <FlatList
          ref={flatListRef}
          data={carouselItems}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingLeft: CARD_SPACING / 2,
            paddingRight: CARD_SPACING / 2,
          }}
          snapToInterval={CARD_FULL_WIDTH}
          decelerationRate="fast"
          getItemLayout={(data, index) => ({
            length: CARD_FULL_WIDTH,
            offset: CARD_FULL_WIDTH * index,
            index,
          })}
          renderItem={({ item }) => (
            <View
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              style={{
                width: CARD_WIDTH,
                marginRight: CARD_SPACING,
                marginBottom: CARD_SPACING,
              }}
            >
              <View className="relative">
                <Image
                  source={{ uri: item.image }}
                  className="w-full h-40"
                  resizeMode="cover"
                />
              </View>
              <View className="p-3">
                <Text className="text-base font-semibold" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-base mt-1">{item.description}</Text>
                <TouchableOpacity className="mt-2 bg-white py-2 items-center border border-primary w-32">
                  <Text className="text-primary text-sm font-medium">
                    View Details
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          onScroll={(event) => {
            const newIndex = Math.round(
              event.nativeEvent.contentOffset.x / CARD_FULL_WIDTH
            );
            if (newIndex !== currentIndex) {
              setCurrentIndex(newIndex);
            }
          }}
          scrollEventThrottle={16}
        />
        <TouchableOpacity
          onPress={() => {
            if (currentIndex > 0) scrollToIndex("prev");
          }}
          className="absolute left-0 top-1/2 -translate-y-6 bg-primary shadow-md rounded-tr-lg rounded-br-lg p-2"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (currentIndex < carouselItems.length - 1) scrollToIndex("next");
          }}
          className="absolute right-0 top-1/2 -translate-y-6 bg-primary shadow-md rounded-bl-lg rounded-tl-lg p-2"
        >
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* <View className="flex-row justify-center mt-3">
            {carouselItems.map((_, index) => (
              <View
                key={index}
                className={`h-1.5 rounded-full mx-1 ${
                  index === currentIndex
                    ? "w-4 bg-blue-500"
                    : "w-1.5 bg-gray-300"
                }`}
              />
            ))}
          </View> */}
    </View>
  );
};

export default Carousel;
