import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Profile = () => {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <View className={`bg-primary px-2 py-4 flex-row justify-between w-full`}>
        <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-center mr-4 text-xl font-bold w-[95%]">
          Profile
        </Text>
      </View>
      <View className="flex-row items-center justify-center py-28">
        <Image
          source={require("../assets/profile.png")}
          className="w-32 h-32 rounded-full"
        />
        <View className="absolute ml-32 mt-14 bg-primary p-2 border border-white rounded-full ">
          <Ionicons name="pencil" size={18} color={"#fff"} />
        </View>
      </View>
      <View className="flex-row justify-between mx-2 border-b p-2">
        <View>
          <Text className="text-xl font-bold">836</Text>
          <Text>Register Bird</Text>
        </View>
        <View>
          <Text className="text-xl font-bold">20</Text>
          <Text>Race Joined</Text>
        </View>
        <View>
          <Text className="text-xl font-bold">49</Text>
          <Text>Wins</Text>
        </View>
        <View>
          <Text className="text-xl font-bold">$ 20.00</Text>
          <Text>Payment</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default Profile;
