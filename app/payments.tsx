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

const Payments = () => {
  const router = useRouter();
  const sectionBg = "#E6EEF2"; // light grey/blue seen in image
  const borderColor = "#bfc9ce";
  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View
          className={`bg-primary px-2 py-4 flex-row justify-between w-full`}
        >
          <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-center text-xl font-bold w-[95%]">
            Payments
          </Text>
        </View>
        {/* BANNER */}
        <LinearGradient
          colors={["#189AB4", "#64bacb", "#dbeafe", "#f4f5f6"]}
          start={{ x: 0, y: 0.5 }} // Start from the left center
          end={{ x: 1, y: 0.5 }} // End at the right center
          className="pl-5 flex-row justify-between items-center"
        >
          <View className="w-66">
            <Text className="text-2xl text-white">Requirements</Text>
            <Text className="text-white mt-2 text-sm">
              <Ionicons name="checkmark-outline" /> You get 24/7 roadside
              assistance
            </Text>
            <Text className="text-white mt-2 text-sm">
              <Ionicons name="checkmark-outline" /> We fixe 4 out of 5 Cars at
              the roadside
            </Text>
          </View>

          <Image
            source={require("../assets/pigeon.png")}
            className="w-32 mt-4"
            style={{ objectFit: "contain" }}
          />
        </LinearGradient>
        <View className="bg-gray-200 flex-row justify-between mt-2">
          {/* Section 1 */}
          <View className="">
            <View>
              <Text className="text-[10px]">Race Route</Text>
              <Text className="text-xs">UA TO USA</Text>
            </View>
          </View>
          {/* Section 2 */}
          <View className="">
            <View>
              <Text className="text-[10px]">Entry FEE</Text>
              <Text className="text-xs">$89.00/</Text>
            </View>
          </View>

          {/* Section 3 */}
          <View className="">
            <View>
              <Text className="text-[10px]"> Registration Deadline</Text>
              <Text className="text-xs">23/02/2025</Text>
            </View>
          </View>

          {/* Section 4 */}
          <View>
            <View>
              <Text className="text-[10px]">Spot Available</Text>
              <Text className="text-xs">32</Text>
            </View>
          </View>
          <TouchableOpacity
            className="bg-primary"
            onPress={() => {
              // handle press
            }}
          >
            <Text className="text-white text-center text-[10px]">
              Register Now
            </Text>
          </TouchableOpacity>
        </View>
        <View className="mt-8 p-2">
          <Text className="text-xl font-bold tracking-wider">Rules Regulation</Text>
          <Text className="mt-2 tracking-wider text-lg">
            From they fine john he give of rich he. They age and draw mrs like.
            Improving end distrusts may instantly was household applauded
            incommode. Why kept very ever home mrs. Considered sympathize ten
            uncommonly occasional assistance sufficient not.
          </Text>
        </View>
        <Carousel/>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Payments;

const styles = StyleSheet.create({});
