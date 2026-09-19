import Carousel from "@/components/carousel";
import Header from "@/components/header";
import { useEvents } from "@/context";
import { EventType } from "@/context/EventContext";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Race Pavilion.
 *
 * The three carousels here were placeholders rendered with no data at all, so
 * the screen showed its banner and then two empty bands. They now carry the
 * events they were always standing in for — what is running, and what is open
 * to enter — which is the only reason to arrive on this screen.
 */
const RacePavilion = () => {
  const { events, loading, error } = useEvents();

  const now = new Date();
  const ongoing: EventType[] = [];
  const upcoming: EventType[] = [];

  (events ?? []).forEach((event) => {
    const hasLiveRace = event.races?.some((r) => !!r.startTime && r.isClosed !== 1);
    if (hasLiveRace || new Date(event.eventDate) < now) ongoing.push(event);
    else upcoming.push(event);
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView>
        <Header title="Race Pavilion" />
        <LinearGradient
          colors={["#fff", "#dbeafe"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          className="rounded-2xl pl-5 flex-row justify-between items-center"
        >
          <View>
            <Text className="text-2xl text-gray-800">
              TRACK <Text className="text-primary">PIGEONS</Text>
              {"\n"}WATCH LIVE RESULTS
            </Text>
            <Text className="text-gray-600 mt-2 w-56">
              Experience the thrill of pigeon racing with real-time tracking and
              results.
            </Text>
          </View>

          <Image
            source={require("../../assets/pigeon.png")}
            className="w-32 mt-4"
            style={{ objectFit: "contain" }}
          />
        </LinearGradient>

        <Text className="text-xl font-bold px-4 mt-8 mb-3">Running now</Text>
        {error ? (
          <Text className="px-4 text-red-500">Error loading events: {error}</Text>
        ) : (
          <Carousel data={ongoing} loading={loading} />
        )}

        <View className="mx-4 mt-8 bg-white flex-row shadow">
          <Image
            source={{
              uri: "https://images.pexels.com/photos/306407/pexels-photo-306407.jpeg",
            }}
            className="w-1/2 h-40"
          />

          <View className="pl-4">
            <Text className="text-lg font-bold">Live Pigeon Races</Text>
            <Text className="text-gray-600 mt-1">
              We are committed to providing accurate live race results with fast
              tracking.
            </Text>
          </View>
        </View>

        <Text className="text-xl font-bold px-4 mt-8 mb-3">Open to enter</Text>
        {error ? null : <Carousel data={upcoming} loading={loading} />}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default RacePavilion;
