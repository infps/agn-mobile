import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const OwnLoft = () => {
  const router = useRouter();
  return (
    <SafeAreaView>
      <View className={`bg-primary px-2 py-4 flex-row justify-between w-full`}>
        <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-center text-xl font-bold w-[95%]">
          Own Loft
        </Text>
      </View>
      <TouchableOpacity
        className={`flex-row items-center justify-between py-2 border-b border-gray-200 pl-2 mt-4`}
      >
        <Text className="text-lg font-bold">Create New Loft</Text>
        <Ionicons name="chevron-forward" size={24} color="black" />
      </TouchableOpacity>
      <FlatList
        data={[1, 2, 3]}
        keyExtractor={(item) => item.toString()}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            className={`flex-row items-center justify-between py-2 border-b border-gray-200 pl-2`}
          >
            <Text>Indrajit Loft</Text>
            <Ionicons name="chevron-forward" size={24} color="black" />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
};

export default OwnLoft;
