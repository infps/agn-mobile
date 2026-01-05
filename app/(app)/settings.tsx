import { useAuth } from "@/context";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  Image,
  Share,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const settingOption1: {
  title: string;
  icon: React.ReactNode;
  link?: "/events" | "/teams" | "/birds" | "my-events";
  //"/own-loft" | "/shared-loft" | "/result" |
}[] = [
  // {
  //   title: "Races",
  //   icon: (
  //     <Image source={require("../../assets/journey.png")} className="w-8 h-8" />
  //   ),
  //   link: "/races",
  // },
  {
    title: "Events",
    icon: (
      <Image source={require("../../assets/journey.png")} className="w-8 h-8" />
    ),
    link: "/events",
  },
  {
    title: "My Events",
    icon: <Ionicons name="calendar-outline" size={24} />,
    link: "my-events",
  },
  {
    title: " Teams",
    icon: <Ionicons name="people-outline" size={24} />,
    link: "/teams",
  },
  {
    title: "Birds",
    icon: (
      <Image
        source={require("../../assets/pigeon-icon.png")}
        className="w-8 h-8 mr-[1px]"
      />
    ),
    link: "/birds",
  },
  // {
  //   title: "Own Loft",
  //   icon: (
  //     <Image source={require("../../assets/parcel.png")} className="w-8 h-8" />
  //   ),
  //   link: "/own-loft",
  // },
  // {
  //   title: "Shared Loft",
  //   icon: (
  //     <Image source={require("../../assets/money-bag.png")} className="w-8 h-8" />
  //   ),
  //   link: "/shared-loft",
  // },
  // {
  //   title: "Result",
  //   icon: (
  //     <Image source={require("../../assets/quality.png")} className="w-8 h-8" />
  //   ),
  //   link: "/result",
  // },
];

const settingOption2: {
  title: string;
  icon: React.ReactNode;
  link:
    | "/payments"
    | "/about-us"
    | "/privacy-policy"
    | "/contact-us"
    | "/terms-condition";
}[] = [
  {
    title: "Payments",
    icon: <Ionicons name="card-outline" size={24} color="black" />,
    link: "/payments",
  },
  {
    title: "About Us",
    icon: <Ionicons name="home-outline" size={24} color="black" />,
    link: "/about-us",
  },
  {
    title: "Privacy Policy",
    icon: <Ionicons name="shield-checkmark-outline" size={24} color="black" />,
    link: "/privacy-policy",
  },
  {
    title: "Contact Us",
    icon: <Ionicons name="call-outline" size={24} color="black" />,
    link: "/contact-us",
  },
  {
    title: "Terms & Conditions",
    icon: <Ionicons name="list-outline" size={24} color="black" />,
    link: "/terms-condition",
  },
];
const Settings = () => {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const handleShare = async () => {
    try {
      await Share.share({
        message:
          "🚀 Check out this awesome app!\nDownload now:\nhttps://play.google.com/store/apps/details?id=com.yourapp",
        // iOS only
        url: "https://yourwebsite.com",
        title: "Share App",
      });
    } catch (error) {
      console.log("Share error:", error);
    }
  };
  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <View className={`bg-primary p-4 flex-row justify-between`}>
        <View>
          <View className="flex-row">
            <TouchableOpacity onPress={() => router.back()} className="mr-0">
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text className="text-white text-xl font-bold">
              Hi {user?.firstName} {user?.lastName}
            </Text>
          </View>
          <Link href="/profile-update" className="text-white ml-8">
            Edit Profile
          </Link>
        </View>
        <Link href="/profile" className="bg-white p-1 rounded-full w-14 h-14">
          <Image
            source={require("../../assets/profile.png")}
            className="w-full h-full"
          />
        </Link>
      </View>
      <View className="mt-8 bg-white p-4">
        <FlatList
          data={settingOption1}
          keyExtractor={(item) => item.title}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              className={`flex-row items-center justify-between py-2 ${
                index !== settingOption1.length - 1
                  ? "border-b border-gray-200"
                  : ""
              }`}
              onPress={() => router.push(item.link as any)}
            >
              <View className="flex-row items-center">
                {item.icon}
                <Text className="ml-2 text-lg font-semibold">{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="black" />
            </TouchableOpacity>
          )}
        />
      </View>
      <View className="mt-8 bg-white p-4">
        <Text className="text-xl font-bold border-b border-gray-200 pb-2">
          Race Pavilion
        </Text>
        <FlatList
          data={settingOption2}
          keyExtractor={(item) => item.title}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              className={`flex-row items-center justify-between py-2 ${
                index !== settingOption2.length - 1
                  ? "border-b border-gray-200"
                  : ""
              }`}
              onPress={() => router.push(item.link as any)}
            >
              <View className="flex-row items-center">
                {item.icon}
                <Text className="ml-2 text-lg font-semibold">{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="black" />
            </TouchableOpacity>
          )}
        />
      </View>
      <TouchableOpacity
        className="mt-8 bg-white p-4 flex-row items-center mb-4"
        onPress={handleShare}
      >
        <Image
          source={require("../../assets/share.png")}
          className="w-8 h-8 mr-2"
        />
        <Text className="text-xl font-bold">Share This App</Text>
      </TouchableOpacity>

      {/* This empty view pushes the logout button to the bottom */}
      <View className="flex-1" />

      <TouchableOpacity
        onPress={signOut}
        className="bg-white p-4 border-t border-gray-200"
      >
        <View className="flex-row items-center">
          <Ionicons
            name="log-out-outline"
            size={28}
            color="red"
            className="mr-2"
          />
          <Text className="text-xl font-bold text-red-500">Logout</Text>
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default Settings;
