import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";

const API_BASE = "https://your-api.com/payment";

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

      const res = await api.post(`/event-inventory`, {
        eventId,
        birds: selectedBirds.map((b: any) => b.idBird),
        loft: selectedTeam || undefined,
      });
      const result = await res.data.data;
      const response = await api.post("/payments/capture", {
        orderId: result.orderId,
      });
      console.log(response.data);
      if (!result?.approvalUrl || !result?.orderId) {
        throw new Error("Failed to create PayPal order");
      }

      // ✅ Open PayPal in WebView
      router.push({
        pathname: "/paypal-checkout",
        params: {
          approvalUrl: result.approvalUrl,
          orderId: result.orderId,
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
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
