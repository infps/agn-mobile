import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ActivityIndicator, Text, TouchableOpacity } from "react-native";

export default function PayPalButton({
  eventId,
  selectedBirds,
  selectedTeam,
}: any) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const startPayment = async () => {
    try {
      setLoading(true);

      // Register birds in the event
      const birds = selectedBirds.map((b: any) => ({
        name: b.birdName,
        color: b.color,
        sex: b.sex || "UNKNOWN",
        band1: b.band1 || "",
        band2: b.band2 || "",
        band3: b.band3 || "",
        band4: b.band4 || "",
      }));

      const res = await api.post(`/breeder/event/${eventId}/register`, {
        loftName: selectedTeam || "Default",
        reservedBirds: birds.length,
        birds,
        payments: [],
      });

      Alert.alert("Success", "Registration successful!");
      router.back();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Registration failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={startPayment}
      disabled={loading}
      className="bg-[#FFC439] py-4 rounded-lg items-center"
    >
      {loading ? (
        <ActivityIndicator color="#000" />
      ) : (
        <Text className="text-black font-bold text-lg">PayPal</Text>
      )}
    </TouchableOpacity>
  );
}
