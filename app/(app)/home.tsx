import Carousel from "@/components/carousel";
import { useEvents } from "@/context";
import { EventType } from "@/context/EventContext";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import {
  FlatList,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
const pedigree = [
  { id: "1", name: "XYZ" },
  { id: "2", name: "XYZ" },
  { id: "3", name: "XYZ" },
  { id: "4", name: "XYZ" },
  { id: "5", name: "XYZ" },
];

export default function HomeScreen() {
  const { events, loading, error } = useEvents();
  const router = useRouter();

  // Split events into ongoing and upcoming
  const categorizeEvents = (events: EventType[]) => {
    const now = new Date();
    const ongoing: EventType[] = [];
    const upcoming: EventType[] = [];

    events.forEach((event) => {
      const eventDate = new Date(event.eventDate);
      if (eventDate >= now) {
        upcoming.push(event);
      } else {
        ongoing.push(event);
      }
    });

    return { ongoing, upcoming };
  };

  const { ongoing, upcoming } = categorizeEvents(events || []);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View className="px-4 flex-row items-center justify-between">
          <View className="flex-row">
            <TouchableOpacity
              onPress={() => router.push("/settings")}
              className="mr-2 mt-2"
            >
              <MaterialIcons name="menu" size={28} color="#000" />
            </TouchableOpacity>
            <View className="justify-center items-center w-12 h-12 rounded-full bg-black">
              <Text className=" text-white  text-center">AGN</Text>
            </View>
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
              className="flex-1 text-gray-700 p-0 my-0 mx-0"
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
            source={require("../../assets/pigeon.png")}
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

        <View className="mt-8">
          <View className="flex-row justify-between items-center px-4 mb-3">
            <Text className="text-xl font-bold">Ongoing Races</Text>
            <Link href="/events">
              <Text className="text-blue-500">See All</Text>
            </Link>
          </View>
          {loading ? (
            <Carousel data={[]} loading={true} />
          ) : error ? (
            <Text className="text-red-500">Error loading events: {error}</Text>
          ) : (
            <Carousel data={ongoing?.slice(0, 5)} />
          )}
        </View>

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
        {upcoming.length > 0 && (
          <View className="mt-8">
            <View className="flex-row justify-between items-center px-4 mb-3">
              <Text className="text-xl font-bold">Upcoming Races</Text>
              <TouchableOpacity>
                <Text className="text-blue-500">See All</Text>
              </TouchableOpacity>
            </View>
          {loading ? (
            <Carousel data={[]} loading={true} />
          ) : error ? (
            <Text className="text-red-500">Error loading events: {error}</Text>
          ) : (
            <Carousel data={upcoming?.slice(0, 5)} />
          )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
