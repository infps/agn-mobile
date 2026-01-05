/* eslint-disable react/no-unescaped-entities */
import Header from "@/components/header";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ContactUs = () => {
  return (
    <SafeAreaView>
      <Header title="Contact Us" />
      <View className="px-4 pt-4">
        <Text className="text-xl font-bold text-gray-600">
          Let's talk with us
        </Text>
        <Text className="text-lg text-gray-600">
          Questions, comments, or suggestions? Simply fill in the form and we'll
          be in touch shortly.
        </Text>
        <Text className="text-lg font-bold text-gray-600">
          📍 1055 Arthur ave Elk Groot, 67. {"\n"}New Palmas South Carolina.
        </Text>
        <Text className="text-lg font-bold text-gray-600 mt-4">
          📞+1 234 678 9108 99
        </Text>
        <Text className="text-lg font-bold text-gray-600 mt-4">
          📧 info@racepavilion.com
        </Text>
        <View className="border-[0.5px] rounded border-gray-300 mt-4 px-2 py-4">
          <View className="flex-row justify-between items-center">
            <TextInput
              placeholder="First Name"
              className="border border-gray-300 rounded-md p-2 w-[48%]"
            />
            <TextInput
              placeholder="Last Name"
              className="border border-gray-300 rounded-md p-2 w-[48%]"
            />
          </View>
          <TextInput
            placeholder="Email"
            className="border border-gray-300 rounded-md p-2 mt-4"
          />
          <TextInput
            placeholder="Phone"
            className="border border-gray-300 rounded-md p-2 mt-4"
          />
          <TextInput
            placeholder="Your message ..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="border border-gray-300 rounded-md p-2 mt-4 h-[100px]"
          />
          <TouchableOpacity className="bg-primary px-2 py-2 rounded mt-4">
            <Text className="font-bold text-white text-center">
              Send Message
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default ContactUs;
