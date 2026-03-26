import Header from "@/components/header";
import SkeletonCard from "@/components/skeletonCard";
import { EventType, useEvents } from "@/context/EventContext";
import { format } from "date-fns";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const EventsList = () => {
  const { events, loading, error, listEvents, getEvent } = useEvents();
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = async () => {
    try {
      await listEvents();
    } catch (err) {
      console.error("Error loading events:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);
  const handleRefresh = () => {
    setRefreshing(true);
    loadEvents();
  };
  const skeletonData = Array.from({ length: 10 }, (_, index) => ({
    id: `skeleton-${index}`,
    isSkeleton: true,
  }));

  const displayData = loading ? skeletonData : events;
  const renderEventItem = ({
    item,
  }: {
    item: EventType | { id: string; isSkeleton: boolean };
  }) => {
    if ("isSkeleton" in item && item.isSkeleton) {
      return <SkeletonCard width="48%" marginBottom={16} />;
    }
      const eventItem = item as EventType;
      const hasLiveRace = eventItem.races?.some(r => !!r.startTime && r.isClosed !== 1);
      const liveRace = eventItem.races?.find(r => !!r.startTime && r.isClosed !== 1);
      const liveRaceId = liveRace?.id;
    return (
      <View
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
        className="w-[48%] bg-white rounded-[8px] mb-[16px] overflow-hidden "
      >
        <Pressable
          onPress={() => router.push(`/(app)/event-detail?id=${eventItem.id}`)}
          style={{ position: "relative" }}
        >
          <Image
            source={{
              uri: "https://static.independent.co.uk/s3fs-public/thumbnails/image/2015/08/19/23/web-racing-pigeons-getty.jpg?quality=75&width=1250&crop=3%3A2%2Csmart&auto=webp",
            }}
            className="w-full h-40"
            resizeMode="cover"
          />
          <View
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: hasLiveRace
                ? "rgba(220, 38, 38, 0.95)"
                : eventItem.isOpen === 1
                  ? "rgba(76, 175, 80, 0.9)"
                  : "rgba(244, 67, 54, 0.9)",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            {hasLiveRace && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
            )}
            <Text style={{ color: "white", fontWeight: "600", fontSize: 12 }}>
              {hasLiveRace ? "LIVE" : eventItem.isOpen === 1 ? "Registration Open" : "Closed"}
            </Text>
          </View>
        </Pressable>
        <View className="px-2 py-2">
          <Text className="text-lg text-gray-600">
            {format(new Date(eventItem.eventDate), "PPP")}
          </Text>
          <Text className="text-lg text-gray-600">
            {eventItem?._count?.eventInventories ?? eventItem?.eventInventories?.length ?? 0} Participants
          </Text>
          <Text className="text-lg font-semibold">{eventItem.name}</Text>
          {hasLiveRace ? (
            <TouchableOpacity
              className="mt-2 py-2 items-center border w-full border-red-500 bg-red-500"
              onPress={() => {
                router.push({
                  pathname: "/live-race",
                  params: { raceId: liveRaceId! },
                });
              }}
            >
              <Text className="text-sm font-medium text-white">Watch Live</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className={`mt-2 py-2 items-center border w-full ${
                eventItem.isOpen === 1
                  ? "bg-white border-primary"
                  : "bg-gray-200 border-gray-400"
              }`}
              onPress={() => {
                if (eventItem.isOpen === 1) {
                  router.push({
                    pathname: "/register-in-event",
                    params: { eventId: eventItem.id },
                  });
                }
              }}
              disabled={eventItem.isOpen !== 1}
            >
              <Text
                className={`text-sm font-medium ${
                  eventItem.isOpen === 1 ? "text-primary" : "text-gray-500"
                }`}
              >
                {eventItem.isOpen === 1 ? "Register" : "Registration Closed"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // if (loading && !refreshing) {
  //   return (
  //     <View style={styles.centered}>
  //       <ActivityIndicator size="large" />
  //     </View>
  //   );
  // }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadEvents}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView>
      <Header title="Events" />
      <FlatList
        data={displayData}
        renderItem={renderEventItem}
        keyExtractor={(item) =>
          "isSkeleton" in item ? item.id : String(item.id)
        }
        numColumns={2}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text>No events found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  listContent: {
    padding: 8,
    paddingBottom: 50,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  eventType: {
    fontSize: 14,
    color: "#666",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventDate: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  eventStatus: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "500",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#d32f2f",
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  retryButtonText: {
    color: "white",
    fontWeight: "500",
  },
});

export default EventsList;
