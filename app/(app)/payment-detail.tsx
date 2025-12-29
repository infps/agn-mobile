import { Ionicons } from "@expo/vector-icons";
import { Header } from "@react-navigation/elements";
import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PaymentDetail = () => {
  return (
    <SafeAreaView>
      <Header title="Payment Detail" />
      <View className="p-2 bg-primary flex-row justify-between">
        <Text className="text-white text-[10px]">Race Name</Text>
        <Text className="text-white text-[10px]">Loft Name</Text>
        <Text className="text-white text-[10px]">Band Number</Text>
        <Text className="text-white text-[10px]">Amount</Text>
        <Text className="text-white text-[10px]">Invoice</Text>
      </View>
      <View className="p-2 flex-row justify-between">
        <Text className="text-gray-400 text-[10px]">UFA Champion</Text>
        <Text className="text-gray-400 text-[10px]">Indrajit</Text>
        <Text className="text-gray-400 text-[10px]">DJCKD</Text>
        <Text className="text-gray-400 text-[10px]">$47.00</Text>
        <Ionicons name="file-tray-outline" size={24} color="black" />
      </View>
    </SafeAreaView>
  );
};

export default PaymentDetail;
