import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Payment = () => {
  const router = useRouter();
  return (
    <SafeAreaView>
      <View className={`bg-primary px-2 py-4 flex-row justify-between w-full`}>
        <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-center text-xl font-bold w-[95%]">
          Payment
        </Text>
      </View>
      <View className="p-2 flex-row flex-wrap w-full mt-2">
        <View className="w-1/2 pr-2">
          <Text>Name</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base"
            />
          </View>
        </View>
        <View className="w-1/2 pr-2">
          <Text>Loft Name</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
        <Text>Loft ID</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>Race Name</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>Fess</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="$89.00"
              placeholderTextColor="#9CA3AF"
              className="text-base"
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default Payment;
