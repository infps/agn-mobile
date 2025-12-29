import Header from "@/components/header";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { FlatList, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const OwnLoft = () => {
  return (
    <SafeAreaView>
      <Header title="Own Loft" />
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
