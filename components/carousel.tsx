import { EventType } from "@/context/EventContext";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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

const Carousel = ({ data }: { data: EventType[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const transformEventData = (events: EventType[]) => {
    return events?.map((event) => ({
      id: event.idEvent.toString(),
      title: event.eventShortName,
      date: new Date(event.eventDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      participants: event._count?.eventInventories?.toString() || "0",
      distance: "289 KM", // You may need to add distance to EventType
      image:
        "http://www.globaltimes.cn/Portals/0/attachment/2011/04d9b7ca-811d-4d5b-98cd-ece1fff81130.jpeg", // Default image
      eventType: event.eventType,
      isOpen: event.isOpen,
    }));
  };
  const scrollToIndex = (direction: "prev" | "next") => {
    const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex <= data.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: newIndex,
        animated: true,
      });
      setCurrentIndex(newIndex);
    }
  };
  return (
    <View className="relative">
      <FlatList
        ref={flatListRef}
        data={transformEventData(data)}
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
              <View
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  backgroundColor: item.isOpen
                    ? "rgba(76, 175, 80, 0.9)"
                    : "rgba(244, 67, 54, 0.9)",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 12 }}
                >
                  {item.isOpen ? "Registration Open" : "Closed"}
                </Text>
              </View>
            </View>
            <View className="px-2 py-2">
              <Text className="text-sm text-gray-600">
                {item.date}
              </Text>
              <Text className="text-sm text-gray-600">
                {item.participants} Participants
              </Text>
              <Text className="text-lg font-semibold">{item.title}</Text>
              <TouchableOpacity
                className={`mt-2 py-2 items-center border w-full ${
                  item.isOpen
                    ? "bg-white border-primary"
                    : "bg-gray-200 border-gray-400"
                }`}
                onPress={() => {
                  if (item.isOpen) {
                    router.push({
                      pathname: "/register-in-event",
                      params: { eventId: item.id },
                    });
                  }
                }}
                disabled={!item.isOpen}
              >
                <Text
                  className={`text-sm font-medium ${
                    item.isOpen ? "text-primary" : "text-gray-500"
                  }`}
                >
                  {item.isOpen ? "Register" : "Registration Closed"}
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
          if (currentIndex < data.length - 1) scrollToIndex("next");
        }}
        className="absolute right-0 top-1/2 -translate-y-6 bg-primary shadow-md rounded-bl-lg rounded-tl-lg p-2"
      >
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default Carousel;
