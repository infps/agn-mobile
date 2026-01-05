import Header from "@/components/header";
import { LinearGradient } from "expo-linear-gradient";
import { Text, TouchableOpacity } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

const AboutUs = () => {
  return (
    <SafeAreaView>
      <Header title="About Us" />
      <LinearGradient
        colors={["#fff", "#aad4df", "#1a9ab4"]}
        start={{ x: 0, y: 0.5 }} // Start from the left center
        end={{ x: 1, y: 0.5 }} // End at the right center
        className="mt-5 mx-0 px-4 py-6 rounded-2xl pl-5"
      >
        <Text className="text-2xl text-center text-gray-800">About Us</Text>
        <Text className="w-full text-gray-600 mt-2 text-center">
          We are a team of passionate individuals dedicated to revolutionizing
          pigeon racing with cutting-edge technology and real-time tracking
          solutions.
        </Text>
      </LinearGradient>
      <LinearGradient
        colors={["#fff", "#aad4df"]}
        start={{ x: 0, y: 0.5 }} // Start from the left center
        end={{ x: 1, y: 0.5 }} // End at the right center
        className="mt-5 mx-2 p-4 rounded-xl"
      >
        <Text className="text-xl text-gray-800">
          Are You Looking {"\n"}for Loft Manager?
        </Text>
        <Text className="w-full text-gray-600 mt-2 leading-relaxed">
          We are committed to providing our customers with exceptional service.
        </Text>
        <TouchableOpacity className="bg-primary w-[100px] px-2 py-1 rounded mt-2">
          <Text className="text-blue-500 text-white text-center">
            Get Started
          </Text>
        </TouchableOpacity>
      </LinearGradient>
      <LinearGradient
        colors={["#fff", "#fce7f3"]}
        start={{ x: 0, y: 0.5 }} // Start from the left center
        end={{ x: 1, y: 0.5 }} // End at the right center
        className="mt-5 mx-2 p-4 rounded-xl"
      >
        <Text className="text-xl text-gray-800">
          Best Place for {"\n"}Pigeon Race
        </Text>
        <Text className="w-full text-gray-600 mt-2 leading-relaxed">
          We are committed to providing our customers with exceptional service.
        </Text>
        <TouchableOpacity className="bg-primary w-[100px] px-2 py-1 rounded mt-2">
          <Text className="text-blue-500 text-white text-center">
            Get Started
          </Text>
        </TouchableOpacity>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default AboutUs;
