import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SharedLoft = () => {
  const router = useRouter();
  return (
    <SafeAreaView>
      <View className={`bg-primary px-2 py-4 flex-row justify-between w-full`}>
        <TouchableOpacity onPress={() => router.back()} className="w-[5%]">
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-center text-xl font-bold w-[95%]">
          Shared Loft
        </Text>
      </View>
      <View className="flex-row items-center justify-between mx-2 p-2 border-b border-gray-300">
        <View className="w-[33%]">
          <Text className="text-lg font-bold">Loft Name</Text>
          <Text className="text-sm text-gray-400">Indrjit Loft</Text>
        </View>
        <View className="w-[33%]">
          <Text className="text-lg font-bold">Bird Count</Text>
          <Text className="text-sm text-gray-400">ABC</Text>
        </View>
        <View className="w-[33%]">
          <Text className="text-lg font-bold">Races</Text>
          <Text className="text-sm text-gray-400">0</Text>
        </View>
      </View>
      <TouchableOpacity
        className={`flex-row items-center justify-between py-2 border-b border-gray-200 pl-2 mt-2`}
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

export default SharedLoft;

const styles = StyleSheet.create({});
