import Header from "@/components/header";
import { useAuth } from "@/context";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Profile = () => {
  const { user } = useAuth();
  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <ScrollView>
        <Header title="Profile" />
        <View className="items-center py-6 bg-white mb-4">
          <Image
            source={
              user?.idPicture
                ? { uri: user.idPicture }
                : require("../../assets/profile.png")
            }
            className="w-32 h-32 rounded-full"
          />
          <View className="absolute ml-[85px] mt-[100px] bg-primary p-2 border-2 border-white rounded-full">
            <Ionicons name="pencil" size={18} color={"#fff"} />
          </View>
          <Text className="pt-4 text-2xl font-bold">
            {user?.firstName} {user?.lastName}
          </Text>
          <Text className="text-gray-500">
            {user?.email || user?.loginName}
          </Text>
          <Text className="text-gray-500">Breeder ID: {user?.idBreeder}</Text>
        </View>

        {/* Contact Information */}
        <View className="bg-white mx-4 mb-4 p-4 rounded-lg shadow-sm">
          <Text className="text-lg font-bold mb-3 text-gray-700">
            Contact Information
          </Text>

          <View className="mb-3">
            <Text className="text-gray-500 text-sm">Primary Email</Text>
            <Text className="text-base">{user?.email || "Not provided"}</Text>
          </View>

          <View className="mb-3">
            <Text className="text-gray-500 text-sm">Secondary Email</Text>
            <Text className="text-base">{user?.email2 || "Not provided"}</Text>
          </View>

          <View className="flex-row justify-between">
            <View className="flex-1 mr-2">
              <Text className="text-gray-500 text-sm">Phone</Text>
              <Text className="text-base">{user?.phone || "Not provided"}</Text>
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-gray-500 text-sm">Mobile</Text>
              <Text className="text-base">{user?.cell || "Not provided"}</Text>
            </View>
          </View>
        </View>

        {/* Address */}
        <View className="bg-white mx-4 mb-4 p-4 rounded-lg shadow-sm">
          <Text className="text-lg font-bold mb-3 text-gray-700">Address</Text>

          <View className="mb-2">
            <Text className="text-gray-500 text-sm">Address Line 1</Text>
            <Text className="text-base">
              {user?.address1 || "Not provided"}
            </Text>
          </View>

          <View className="mb-2">
            <Text className="text-gray-500 text-sm">Address Line 2</Text>
            <Text className="text-base">
              {user?.address2 || "Not provided"}
            </Text>
          </View>

          <View className="flex-row justify-between mb-2">
            <View className="flex-1 mr-2">
              <Text className="text-gray-500 text-sm">City</Text>
              <Text className="text-base">{user?.city1 || "Not provided"}</Text>
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-gray-500 text-sm">State/Province</Text>
              <Text className="text-base">
                {user?.state1 || "Not provided"}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between">
            <View className="flex-1 mr-2">
              <Text className="text-gray-500 text-sm">Postal Code</Text>
              <Text className="text-base">{user?.zip1 || "Not provided"}</Text>
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-gray-500 text-sm">Country</Text>
              <Text className="text-base">
                {user?.country || "Not provided"}
              </Text>
            </View>
          </View>
        </View>

        {/* Additional Information */}
        <View className="bg-white mx-4 mb-4 p-4 rounded-lg shadow-sm">
          <Text className="text-lg font-bold mb-3 text-gray-700">
            Additional Information
          </Text>

          <View className="flex-row justify-between mb-3">
            <View className="flex-1 mr-2">
              <Text className="text-gray-500 text-sm">Tax Number</Text>
              <Text className="text-base">
                {user?.taxNumber || "Not provided"}
              </Text>
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-gray-500 text-sm">SSN</Text>
              <Text className="text-base">
                {user?.socialSecurityNumber ? "•••••••••" : "Not provided"}
              </Text>
            </View>
          </View>

          <View className="mb-3">
            <Text className="text-gray-500 text-sm">Website</Text>
            <Text
              className="text-base text-blue-500"
              onPress={() =>
                user?.webAddress && Linking.openURL(user.webAddress)
              }
            >
              {user?.webAddress || "Not provided"}
            </Text>
          </View>

          <View className="mb-3">
            <Text className="text-gray-500 text-sm">Notes</Text>
            <Text className="text-base">
              {user?.note || "No notes available"}
            </Text>
          </View>
        </View>

        {/* Account Status */}
        <View className="bg-white mx-4 mb-6 p-4 rounded-lg shadow-sm">
          <Text className="text-lg font-bold mb-3 text-gray-700">
            Account Status
          </Text>
          <View className="flex-row items-center">
            <View
              className={`h-3 w-3 rounded-full mr-2 ${user?.statusDate ? "bg-green-500" : "bg-gray-400"}`}
            />
            <Text className="text-base">
              {user?.statusDate ? "Active" : "Inactive"}
              {user?.statusDate &&
                ` since ${new Date(user.statusDate).toLocaleDateString()}`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;
