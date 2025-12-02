import Carousel from "@/components/carousel";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  FlatList,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
const pedigree = [
  { id: "1", name: "XYZ" },
  { id: "2", name: "XYZ" },
  { id: "3", name: "XYZ" },
  { id: "4", name: "XYZ" },
  { id: "5", name: "XYZ" },
];
const races = [
  {
    id: "1",
    title: "2024 Pigeon Race Amsterdam VS USA",
    date: "November 22, 2023 12:07 PM",
    participants: "673",
    distance: "289 KM",
    image:
      "http://www.globaltimes.cn/Portals/0/attachment/2011/04d9b7ca-811d-4d5b-98cd-ece1fff81130.jpeg",
  },
  {
    id: "2",
    title: "2024 Pigeon Race Amsterdam VS USA",
    date: "November 22, 2023 12:07 PM",
    participants: "673",
    distance: "289 KM",
    image:
      "http://www.globaltimes.cn/Portals/0/attachment/2011/04d9b7ca-811d-4d5b-98cd-ece1fff81130.jpeg",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View className="px-4 pt-2 flex-row items-center justify-between">
          <View className="flex-row">
            <TouchableOpacity
              onPress={() => router.push("/settings")}
              className="mr-2"
            >
              <MaterialIcons name="menu" size={28} color="#000" />
            </TouchableOpacity>
            <Image
              source={{
                uri: "https://dummyimage.com/100x40/cccccc/000000.png&text=Logo",
              }}
              className="w-24 h-8"
            />
          </View>
          <TouchableOpacity>
            <Ionicons name="notifications-outline" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* SEARCH BOX */}
        <View className="px-4 mt-4">
          <View className="bg-white rounded-full border border-gray-300 px-4 py-3 flex-row items-center">
            <TextInput
              placeholder="Search here"
              className="flex-1 text-gray-700"
            />
          </View>
        </View>

        {/* BANNER */}
        <LinearGradient
          colors={["#fff", "#dbeafe"]}
          start={{ x: 0, y: 0.5 }} // Start from the left center
          end={{ x: 1, y: 0.5 }} // End at the right center
          className="mt-5 mx-4 rounded-2xl pl-5 flex-row justify-between items-center"
        >
          <View>
            <Text className="text-2xl text-gray-800">
              TRACK <Text className="text-primary">PIGEONS</Text>
              {"\n"}WATCH LIVE RESULTS
            </Text>
            <Text className="text-gray-600 mt-2 w-56">
              Experience the thrill of pigeon racing with real-time tracking and
              results.
            </Text>
          </View>

          <Image
            source={require("../assets/pigeon.png")}
            className="w-32 mt-4"
            style={{ objectFit: "contain" }}
          />
        </LinearGradient>

        {/* WIN PEDIGREE */}
        <Text className="text-lg font-bold px-4 mt-6">Win Pedigree</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={pedigree}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="items-center mx-3 mt-3">
              <View className="w-14 h-14 rounded-full bg-gray-200" />
              <Text className="text-xs mt-2 text-gray-600">{item.name}</Text>
            </View>
          )}
        />

        {/* UPCOMING RACES */}
        <Text className="text-xl font-semibold px-4 mt-6">Upcoming Races</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={races}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="bg-white shadow rounded-xl mx-3 mt-4 w-64 justify-between">
              <Image
                source={{ uri: item.image }}
                className="w-full h-36 rounded-t-xl"
              />

              <View className="p-3">
                <Text className="font-semibold text-gray-800">
                  {item.title}
                </Text>
                <Text className="text-gray-500 text-xs mt-1">{item.date}</Text>

                <View className="flex-row justify-between mt-2">
                  <Text className="text-gray-700 text-xs">
                    {item.participants} Participants
                  </Text>
                  <Text className="text-gray-700 text-xs">{item.distance}</Text>
                </View>

                <TouchableOpacity className="mt-2 bg-white py-2 items-center border border-primary w-32">
                  <Text className="text-primary text-sm font-medium">
                    Register
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />

        {/* LIVE SECTION */}
        <View className="mx-4 mt-8 bg-white flex-row shadow">
          <Image
            source={{
              uri: "https://images.pexels.com/photos/306407/pexels-photo-306407.jpeg",
            }}
            className="w-1/2 h-40"
          />

          <View className="pl-4">
            <Text className="text-lg font-bold">Live Pigeon Races</Text>
            <Text className="text-gray-600 mt-1">
              We are committed to providing accurate live race results with fast
              tracking.
            </Text>
          </View>
        </View>
        <View className="mt-10 px-8">
          <View className="flex-row justify-around w-full">
            <View className="w-1/2 items-center border-r border-gray-500 border-b p-4">
              <Text className="text-4xl font-bold">836M</Text>
              <Text className="text-gray-500 text-lg">Total Race</Text>
            </View>

            <View className="w-1/2 items-center border-b border-gray-500 py-4">
              <Text className="text-4xl font-bold">738M</Text>
              <Text className="text-gray-500 text-lg w-full text-center">
                Total Loft Manager
              </Text>
            </View>
          </View>
          <View className="flex-row justify-around mb-10 w-full">
            <View className="w-1/2 items-center border-r border-gray-500 p-4">
              <Text className="text-4xl font-bold">100M</Text>
              <Text className="text-gray-500 text-lg">Races Per Day</Text>
            </View>

            <View className="w-1/2 items-center py-4">
              <Text className="text-4xl font-bold">238M</Text>
              <Text className="text-gray-500 text-lg w-full text-center">
                Today Race
              </Text>
            </View>
          </View>
        </View>
        {/* STATS */}
        <Carousel />
      </ScrollView>
    </SafeAreaView>
  );
}
