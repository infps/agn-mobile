import Carousel from "@/components/carousel";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const RacePavilion = () => {
  const router = useRouter();
  return (
    <SafeAreaView>
      <ScrollView>
        <View
          className={`bg-primary px-2 py-4 flex-row justify-between w-full`}
        >
          <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-center text-xl font-bold w-[95%]">
            Race Pavilion
          </Text>
        </View>
        <LinearGradient
          colors={["#fff", "#dbeafe"]}
          start={{ x: 0, y: 0.5 }} // Start from the left center
          end={{ x: 1, y: 0.5 }} // End at the right center
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
            source={require("../assets/pigeon.png")}
            className="w-32 mt-4"
            style={{ objectFit: "contain" }}
          />
        </LinearGradient>
        <Carousel />
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
        <Carousel />
        <Carousel />
      </ScrollView>
    </SafeAreaView>
  );
};

export default RacePavilion;

const styles = StyleSheet.create({});
