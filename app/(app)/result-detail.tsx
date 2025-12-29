import Header from "@/components/header";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ResultDetail = () => {
  return (
    <SafeAreaView>
      <Header title="Result" />
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
