import Header from "@/components/header";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Bird = {
  band1: string;
  band2: string;
  band3: string;
  band4: string;
  birdName: string;
  color: string;
  sex: string;
};

type ListingItem = {
  inventoryItem: { bird: Bird };
};

type Listing = {
  id: number;
  listingPrice: number;
  status: string;
  createdAt: string;
  originalBreeder: { firstName: string; lastName: string };
  items: ListingItem[];
};

const EventStore = () => {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const toast = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/breeder/event/${eventId}/store`);
      setListings(res.data.listings ?? []);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Failed to load store");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handlePurchase = (listing: Listing) => {
    Alert.alert(
      "Confirm Purchase",
      `Buy ${listing.items.length} bird(s) from ${listing.originalBreeder.firstName} ${listing.originalBreeder.lastName} for $${listing.listingPrice}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Purchase",
          onPress: async () => {
            setPurchasing(listing.id);
            try {
              await api.post(
                `/breeder/event/${eventId}/store/${listing.id}/purchase`
              );
              toast.success("Purchase successful!");
              fetchListings();
            } catch (err: any) {
              toast.error(
                err.response?.data?.message ?? "Purchase failed"
              );
            } finally {
              setPurchasing(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Event Store" />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center mt-16">
              <Text className="text-gray-500 text-base">
                No birds available in store
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              className="bg-white rounded-xl p-4"
              style={{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
            >
              <View className="flex-row justify-between items-start mb-3">
                <View>
                  <Text className="text-xs text-gray-500 mb-0.5">Seller</Text>
                  <Text className="font-semibold text-gray-800">
                    {item.originalBreeder.firstName} {item.originalBreeder.lastName}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-gray-500 mb-0.5">Price</Text>
                  <Text className="text-lg font-bold text-primary">
                    ${item.listingPrice}
                  </Text>
                </View>
              </View>

              <View className="border-t border-gray-100 pt-3 mb-3">
                <Text className="text-xs text-gray-500 mb-2">
                  Birds ({item.items.length})
                </Text>
                {item.items.map((li, idx) => {
                  const b = li.inventoryItem.bird;
                  const band = [b.band1, b.band2, b.band3, b.band4]
                    .filter(Boolean)
                    .join("-");
                  return (
                    <View
                      key={idx}
                      className="flex-row justify-between items-center py-1.5 border-b border-gray-50"
                    >
                      <Text className="text-sm font-medium text-gray-800">
                        {b.birdName || "Unnamed"}
                      </Text>
                      <View className="items-end">
                        <Text className="text-xs text-gray-500">{band}</Text>
                        <Text className="text-xs text-gray-400">{b.color}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                className="bg-primary rounded-lg py-3 items-center"
                onPress={() => handlePurchase(item)}
                disabled={purchasing === item.id}
              >
                {purchasing === item.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-semibold text-sm">
                    Purchase
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

export default EventStore;
