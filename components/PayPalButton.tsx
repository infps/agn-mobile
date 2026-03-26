import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ActivityIndicator, Text, TouchableOpacity, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

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
      console.log("[PayPalButton] Starting payment flow");

      // Step 1: Register birds in the event
      const birds = selectedBirds.map((b: any) => ({
        name: b.birdName,
        color: b.color,
        sex: b.sex ?? 0,
        band1: b.band1 || "",
        band2: b.band2 || "",
        band3: b.band3 || "",
        band4: b.band4 || "",
      }));

      console.log("[PayPalButton] Registering birds:", birds.length);
      const registerRes = await api.post(`/breeder/event/${eventId}/register`, {
        loftName: selectedTeam || "Default",
        reservedBirds: birds.length,
        birds,
      });

      const eventInventoryId = registerRes.data.data.eventInventory.id;
      console.log("[PayPalButton] EventInventoryId:", eventInventoryId);

      const paymentRes = await api.get(`/breeder/event/${eventId}/payment-status`);
      const totalAmount = paymentRes.data.totalDue || 0;
      console.log("[PayPalButton] Total amount:", totalAmount);

      if (totalAmount <= 0) {
        Alert.alert("Success", "Registration successful (no payment required)!");
        router.back();
        return;
      }

      // Step 2: Create PayPal order
      console.log("[PayPalButton] Creating PayPal order");
      const orderRes = await api.post("/payment/paypal/create-order", {
        eventInventoryId,
        amount: totalAmount,
        currency: "USD",
      });

      const { orderID } = orderRes.data;
      const approvalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${orderID}`;
      console.log("[PayPalButton] Order created:", orderID);

      // Step 3: Open PayPal browser
      console.log("[PayPalButton] Opening PayPal browser");
      WebBrowser.openBrowserAsync(approvalUrl);

      // Poll PayPal to check if payment approved
      const pollInterval = setInterval(async () => {
        try {
          console.log("[PayPalButton] Polling PayPal order status");
          const statusRes = await api.post("/payment/paypal/check-status", {
            orderID,
          });

          console.log("[PayPalButton] Status check:", statusRes.data);

          if (statusRes.data.isApproved || statusRes.data.isCompleted) {
            console.log("[PayPalButton] Payment approved! Auto-capturing...");
            clearInterval(pollInterval);

            // Auto-capture payment
            try {
              const captureRes = await api.post("/payment/paypal/capture-order", {
                orderID,
                eventInventoryId,
              });

              console.log("[PayPalButton] Capture response:", captureRes.data);

              if (captureRes.data.status === "COMPLETED") {
                console.log("[PayPalButton] Payment completed successfully");
                Alert.alert("Success", "Payment confirmed! Registration complete.");
                router.back();
              } else {
                console.log("[PayPalButton] Payment not completed, status:", captureRes.data.status);
                toast.error("Payment incomplete. Please try again.");
              }
            } catch (captureErr: any) {
              console.error("[PayPalButton] Capture error:", captureErr);
              const msg = captureErr.response?.data?.message || "Failed to capture payment";
              toast.error(msg);
            } finally {
              setLoading(false);
            }
          }
        } catch (pollErr: any) {
          console.error("[PayPalButton] Poll error:", pollErr);
          // Continue polling even if one check fails
        }
      }, 3000); // Poll every 3 seconds

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (loading) {
          console.log("[PayPalButton] Polling timeout");
          Alert.alert(
            "Payment Timeout",
            "We couldn't verify your payment. Please check your PayPal account or contact support.",
            [
              {
                text: "OK",
                onPress: () => {
                  setLoading(false);
                  router.back();
                },
              },
            ]
          );
        }
      }, 300000); // 5 minutes
    } catch (err: any) {
      console.error("[PayPalButton] Error:", err);
      const msg = err.response?.data?.message || err.message || "Payment failed";
      toast.error(msg);
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
        <Text className="text-black font-bold text-lg">Pay with PayPal</Text>
      )}
    </TouchableOpacity>
  );
}
