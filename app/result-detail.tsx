import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ResultDetail = () => {
  const router = useRouter();
  return (
    <SafeAreaView>
      <View className={`bg-primary px-2 py-4 flex-row justify-between w-full`}>
        <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-center text-xl font-bold w-[95%]">
          Result
        </Text>
      </View>
      <View className="p-2 bg-primary flex-row justify-between mt-2">
        <Text className="text-white text-[10px]">Bird Name</Text>
        <Text className="text-white text-[10px]">Loft Name</Text>
        <Text className="text-white text-[10px]">Band Number</Text>
        <Text className="text-white text-[10px]">Color</Text>
        <Text className="text-white text-[10px]">Race Name</Text>
        <Text className="text-white text-[10px]">Position</Text>
      </View>
      <View className="p-2 flex-row justify-between">
        <Text className="text-gray-400 text-[10px]">Indrajit</Text>
        <Text className="text-gray-400 text-[10px]">Indrajit</Text>
        <Text className="text-gray-400 text-[10px]">787843758</Text>
        <Text className="text-gray-400 text-[10px]">RED</Text>
        <Text className="text-gray-400 text-[10px]">UFA Champion</Text>
        <Text className="text-gray-400 text-[10px]">2</Text>
      </View>
    </SafeAreaView>
  );
};

export default ResultDetail;
