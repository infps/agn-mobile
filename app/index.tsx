import { View, Text, TouchableOpacity } from "react-native";
import { Link } from "expo-router";

const Home = () => {
  return (
    <View className="flex-1 bg-white items-center justify-center px-6">
      <Text className="text-3xl font-bold text-gray-900 mb-8">
        Welcome to Pigeon Pulse
      </Text>
      <Text className="text-gray-600 mb-12 text-center">
        Choose a screen to navigate to:
      </Text>

      <View className="w-full gap-4">
        {/* Onboarding Button */}
        <Link href="/onboarding" asChild>
          <TouchableOpacity className="bg-cyan-600 rounded-xl py-4 px-6">
            <Text className="text-center text-lg font-semibold">
              Onboarding
            </Text>
          </TouchableOpacity>
        </Link>

        {/* Login Button */}
        <Link href="/login" asChild>
          <TouchableOpacity className="bg-gray-800 rounded-xl py-4 px-6">
            <Text className="text-center text-lg font-semibold">Login</Text>
          </TouchableOpacity>
        </Link>

        {/* Signup Button */}
        <Link href="/signup" asChild>
          <TouchableOpacity className="bg-gray-800 rounded-xl py-4 px-6">
            <Text className="text-center text-lg font-semibold">Sign Up</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
};

export default Home;
