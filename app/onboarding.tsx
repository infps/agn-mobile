import { View, Text, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const Onboarding = () => {
  const router = useRouter();

  return (
    <View className="flex-1 bg-white px-6">
      {/* Illustration Area */}
      <View className="flex-1 justify-center items-center mt-20">
        {/* Placeholder for illustration - You can replace this with an actual image */}
        <View className="w-80 h-80 items-center justify-center">
          {/*
            To add the actual illustration from 3.png:
            <Image
              source={require('../assets/images/onboarding-illustration.png')}
              className="w-full h-full"
              resizeMode="contain"
            />
          */}
          <View className="w-full h-full bg-gray-100 rounded-3xl items-center justify-center">
            <Text className="text-6xl">🛵</Text>
            <Text className="text-4xl mt-4">👥</Text>
          </View>
        </View>
      </View>

      {/* Content Area */}
      <View className="mb-20">
        <Text className="text-4xl font-bold text-gray-900 mb-2">
          Explore the world easily
        </Text>
        <Text className="text-xl text-gray-500">
          To your desire
        </Text>

        {/* Pagination and Navigation */}
        <View className="flex-row justify-between items-center mt-12">
          {/* Pagination Dots */}
          <View className="flex-row gap-2">
            <View className="w-3 h-3 rounded-full bg-gray-800" />
            <View className="w-3 h-3 rounded-full bg-gray-300" />
            <View className="w-3 h-3 rounded-full bg-gray-300" />
          </View>

          {/* Next Button */}
          <TouchableOpacity
            className="bg-gray-900 rounded-full w-14 h-14 items-center justify-center"
            onPress={() => {
              // Navigate to next onboarding screen or login
              router.push('/login');
            }}
          >
            <Ionicons name="chevron-forward" size={28} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default Onboarding;
