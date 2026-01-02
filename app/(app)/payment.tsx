import Header from "@/components/header";
import { Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Payment = () => {
  return (
    <SafeAreaView>
      <Header title="Payment" />
      <View className="p-2 flex-row flex-wrap w-full mt-2">
        <View className="w-1/2 pr-2">
          <Text>Name</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 pr-2">
          <Text>Loft Name</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
        <Text>Loft ID</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>Race Name</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>Fess</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="$89.00"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default Payment;
