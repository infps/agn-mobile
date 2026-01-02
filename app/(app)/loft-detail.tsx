import Header from '@/components/header'
import { Ionicons } from '@expo/vector-icons'
import { Image, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const SharedLoftDetail = () => {
  return (
    <SafeAreaView>
      <Header title="Shared Loft Detail" />
      <View className="flex-row items-center justify-between mx-2 p-2 border-b border-gray-300">
        <View className="w-[28%]">
          <Image
            source={require("../../assets/profile.png")}
            className="w-20 h-20 rounded-full"
          />
          <View className="absolute ml-[60px] mt-10 bg-primary p-1 border border-white rounded-full ">
            <Ionicons name="pencil" size={12} color={"#fff"} />
          </View>
        </View>
        <View className="w-[40%]">
          <Text className="text-lg font-bold">Bird Name</Text>
          <Text className="text-sm text-gray-400">ABC</Text>
        </View>
        <View className="w-[20%]">
          <Text className="text-lg font-bold">Races</Text>
          <Text className="text-sm text-gray-400">0</Text>
        </View>
      </View>
      <View className="p-2 flex-row flex-wrap w-full">
        <View className="w-1/2 pr-2">
          <Text>Bird Name</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 pr-2">
          <Text>XYZ</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>XYZ</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>XYZ</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>XYZ</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="$89.00"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
        <View className="w-1/2 mt-2 pr-2">
          <Text>Bird Status</Text>
          <View className="border-[0.5px] border-gray-400 rounded-sm px-1 py-0 bg-gray-50">
            <TextInput
              placeholder="xyz"
              placeholderTextColor="#9CA3AF"
              className="text-base text-black"
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

export default SharedLoftDetail

const styles = StyleSheet.create({})