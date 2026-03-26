// import Carousel from "@/components/carousel";
// import Header from "@/components/header";
// import { Ionicons } from "@expo/vector-icons";
// import { LinearGradient } from "expo-linear-gradient";
// import React from "react";
// import {
//   Image,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   View,
// } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";

// const Payments = () => {
//   return (
//     <SafeAreaView className="flex-1 bg-[#f5f5f5]">
//       <ScrollView showsVerticalScrollIndicator={false}>
//         <Header title="Payments" />
//         {/* BANNER */}
//         <LinearGradient
//           colors={["#189AB4", "#64bacb", "#dbeafe", "#f4f5f6"]}
//           start={{ x: 0, y: 0.5 }} // Start from the left center
//           end={{ x: 1, y: 0.5 }} // End at the right center
//           className="pl-5 flex-row justify-between items-center"
//         >
//           <View className="w-66">
//             <Text className="text-2xl text-white">Requirements</Text>
//             <Text className="text-white mt-2 text-sm">
//               <Ionicons name="checkmark-outline" /> You get 24/7 roadside
//               assistance
//             </Text>
//             <Text className="text-white mt-2 text-sm">
//               <Ionicons name="checkmark-outline" /> We fixe 4 out of 5 Cars at
//               the roadside
//             </Text>
//           </View>

//           <Image
//             source={require("../../assets/pigeon.png")}
//             className="w-32 mt-4"
//             style={{ objectFit: "contain" }}
//           />
//         </LinearGradient>
//         <View className="bg-gray-200 flex-row justify-between mt-2">
//           {/* Section 1 */}
//           <View className="">
//             <View>
//               <Text className="text-[10px]">Race Route</Text>
//               <Text className="text-xs">UA TO USA</Text>
//             </View>
//           </View>
//           {/* Section 2 */}
//           <View className="">
//             <View>
//               <Text className="text-[10px]">Entry FEE</Text>
//               <Text className="text-xs">$89.00/</Text>
//             </View>
//           </View>

//           {/* Section 3 */}
//           <View className="">
//             <View>
//               <Text className="text-[10px]"> Registration Deadline</Text>
//               <Text className="text-xs">23/02/2025</Text>
//             </View>
//           </View>

//           {/* Section 4 */}
//           <View>
//             <View>
//               <Text className="text-[10px]">Spot Available</Text>
//               <Text className="text-xs">32</Text>
//             </View>
//           </View>
//           <TouchableOpacity
//             className="bg-primary"
//             onPress={() => {
//               // handle press
//             }}
//           >
//             <Text className="text-white text-center text-[10px]">
//               Register Now
//             </Text>
//           </TouchableOpacity>
//         </View>
//         <View className="mt-8 p-2">
//           <Text className="text-xl font-bold tracking-wider">Rules Regulation</Text>
//           <Text className="mt-2 tracking-wider text-lg">
//             From they fine john he give of rich he. They age and draw mrs like.
//             Improving end distrusts may instantly was household applauded
//             incommode. Why kept very ever home mrs. Considered sympathize ten
//             uncommonly occasional assistance sufficient not.
//           </Text>
//         </View>
//         <Carousel/>
//       </ScrollView>
//     </SafeAreaView>
//   );
// };

// export default Payments;

// const styles = StyleSheet.create({});

import Header from "@/components/header";
import { usePayments } from "@/context";
import { PaymentType } from "@/context/PaymentContext";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Text, View, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import api from "@/service/api.service";
import { useToast } from "@/context/ToastContext";

const statusLabel = (status: number) => {
  switch (status) {
    case 1: return "Paid";
    case 2: return "Partial";
    case 0: return "Pending";
    case 3: return "Failed";
    case 4: return "Refunded";
    default: return String(status);
  }
};

const statusColor = (status: number) => {
  switch (status) {
    case 1: return "text-green-600";
    case 2: return "text-yellow-600";
    case 0: return "text-red-500";
    case 3: return "text-red-700";
    case 4: return "text-gray-500";
    default: return "text-gray-600";
  }
};

const PaymentsList = () => {
  const { payments, loading, getMyPayments } = usePayments();
  const [selectedPayments, setSelectedPayments] = useState<Set<number>>(new Set());
  const [paying, setPaying] = useState(false);
  const toast = useToast();

  useEffect(() => {
    getMyPayments();
  }, []);

  const totalAmount = useMemo(
    () => payments.reduce((sum, p) => sum + (p.paymentValue || 0), 0),
    [payments]
  );
  const totalPaid = useMemo(
    () => payments.filter(p => p.status === 1).reduce((sum, p) => sum + (p.paymentValue || 0), 0),
    [payments]
  );
  const totalRemaining = totalAmount - totalPaid;

  const pendingPayments = useMemo(
    () => payments.filter(p => p.status === 0),
    [payments]
  );

  const selectedTotal = useMemo(() => {
    return Array.from(selectedPayments).reduce((sum, id) => {
      const payment = payments.find(p => p.id === id);
      return sum + (payment?.paymentValue || 0);
    }, 0);
  }, [selectedPayments, payments]);

  const togglePaymentSelection = (paymentId: number) => {
    setSelectedPayments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const handlePayPending = async () => {
    if (selectedPayments.size === 0) {
      toast.error("No payments selected");
      return;
    }

    console.log("[Payment] Starting payment flow, selected:", selectedPayments.size);

    try {
      setPaying(true);
      console.log("[Payment] Set paying to true");

      // Create bulk PayPal order for selected payments
      const paymentIds = Array.from(selectedPayments);
      console.log("[Payment] Creating PayPal order for IDs:", paymentIds);

      const orderRes = await api.post("/payment/paypal/create-bulk", {
        paymentIds,
        currency: "USD",
      });

      console.log("[Payment] Order created:", orderRes.data);
      const { orderID } = orderRes.data;
      const approvalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${orderID}`;

      // Open PayPal immediately
      console.log("[Payment] Opening PayPal browser");
      WebBrowser.openBrowserAsync(approvalUrl);

      // Poll PayPal to check if payment approved
      const pollInterval = setInterval(async () => {
        try {
          console.log("[Payment] Polling PayPal order status");
          const statusRes = await api.post("/payment/paypal/check-status", {
            orderID,
          });

          console.log("[Payment] Status check:", statusRes.data);

          if (statusRes.data.isApproved || statusRes.data.isCompleted) {
            console.log("[Payment] Payment approved! Auto-capturing...");
            clearInterval(pollInterval);

            // Auto-capture payment
            try {
              const captureRes = await api.post("/payment/paypal/capture-bulk", {
                orderID,
                paymentIds: Array.from(selectedPayments),
              });

              console.log("[Payment] Capture response:", captureRes.data);

              if (captureRes.data.status === "COMPLETED") {
                console.log("[Payment] Payment completed successfully");
                Alert.alert("Success", `Payment of $${selectedTotal.toFixed(2)} completed!`);
                setSelectedPayments(new Set());
                getMyPayments();
              } else {
                console.log("[Payment] Payment not completed, status:", captureRes.data.status);
                toast.error("Payment incomplete. Please try again.");
              }
            } catch (captureErr: any) {
              console.error("[Payment] Capture error:", captureErr);
              const msg = captureErr.response?.data?.message || "Failed to capture payment";
              toast.error(msg);
            } finally {
              setPaying(false);
            }
          }
        } catch (pollErr: any) {
          console.error("[Payment] Poll error:", pollErr);
          // Continue polling even if one check fails
        }
      }, 3000); // Poll every 3 seconds

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (paying) {
          console.log("[Payment] Polling timeout");
          Alert.alert(
            "Payment Timeout",
            "We couldn't verify your payment. Please check your PayPal account or contact support.",
            [
              {
                text: "OK",
                onPress: () => {
                  setPaying(false);
                  getMyPayments(); // Refresh to see if payment went through
                },
              },
            ]
          );
        }
      }, 300000); // 5 minutes
    } catch (err: any) {
      console.error("[Payment] Error in payment flow:", err);
      const msg = err.response?.data?.message || err.message || "Payment failed";
      toast.error(msg);
      setPaying(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="Payments" />

      {/* Summary */}
      {!loading && payments.length > 0 && (
        <View className="mx-2 mt-2 p-3 bg-white rounded-lg flex-row justify-between">
          <View className="items-center">
            <Text className="text-[10px] text-gray-500">Total Amount</Text>
            <Text className="text-sm font-bold">${totalAmount.toFixed(2)}</Text>
          </View>
          <View className="items-center">
            <Text className="text-[10px] text-gray-500">Total Paid</Text>
            <Text className="text-sm font-bold text-green-600">${totalPaid.toFixed(2)}</Text>
          </View>
          <View className="items-center">
            <Text className="text-[10px] text-gray-500">Remaining</Text>
            <Text className={`text-sm font-bold ${totalRemaining > 0 ? "text-red-500" : "text-green-600"}`}>
              ${totalRemaining.toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      {/* Table header */}
      <View className="p-2 bg-primary flex-row mt-2 mx-2">
        <Text className="text-white text-[10px] w-[8%]"></Text>
        <Text className="text-white text-[10px] w-[6%]">#</Text>
        <Text className="text-white text-[10px] w-[22%]">Event</Text>
        <Text className="text-white text-[10px] w-[14%]">Type</Text>
        <Text className="text-white text-[10px] w-[28%] text-right">Amount</Text>
        <Text className="text-white text-[10px] w-[22%] text-center">Status</Text>
      </View>

      <View className="mx-2 flex-1">
        {loading ? (
          [1, 2, 3, 4, 5].map((_, index) => (
            <View className="p-2 flex-row" key={index}>
              <View className="w-full h-8 bg-gray-200 rounded" />
            </View>
          ))
        ) : payments.length > 0 ? (
          <FlatList
            data={payments}
            keyExtractor={(item: PaymentType) => String(item.id)}
            renderItem={({
              item,
              index,
            }: {
              item: PaymentType;
              index: number;
            }) => {
              const isPending = item.status === 0;
              const isSelected = selectedPayments.has(item.id);

              return (
                <TouchableOpacity
                  className="p-2 flex-row border-b border-gray-200 items-center"
                  onPress={() => isPending && togglePaymentSelection(item.id)}
                  disabled={!isPending}
                  activeOpacity={isPending ? 0.7 : 1}
                >
                  {/* Checkbox */}
                  <View className="w-[8%] items-center">
                    {isPending && (
                      <Ionicons
                        name={isSelected ? "checkbox" : "square-outline"}
                        size={18}
                        color={isSelected ? "#189AB4" : "#999"}
                      />
                    )}
                  </View>

                  <Text className="text-[10px] w-[6%]">{index + 1}</Text>
                  <Text className="text-[10px] w-[22%]" numberOfLines={1}>
                    {item?.eventInventory?.event?.name || "N/A"}
                  </Text>
                  <Text className="text-[10px] w-[14%]">
                    {item.paymentType === 1 ? "Perch" : item.paymentType === 2 ? "Bird" : String(item.paymentType)}
                  </Text>
                  <Text className="text-[10px] w-[28%] text-right">
                    ${(item.paymentValue || 0).toFixed(2)}
                  </Text>
                  <Text className={`text-[10px] w-[22%] text-center font-semibold ${statusColor(item.status)}`}>
                    {statusLabel(item.status)}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          <Text className="text-center py-4">No Payment Transaction</Text>
        )}
      </View>

      {/* Fixed Pay Pending Button */}
      {pendingPayments.length > 0 && selectedPayments.size > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm text-gray-600">
              {selectedPayments.size} payment{selectedPayments.size > 1 ? "s" : ""} selected
            </Text>
            <Text className="text-lg font-bold text-primary">
              ${selectedTotal.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            className="bg-[#FFC439] py-3 rounded-lg items-center"
            onPress={handlePayPending}
            disabled={paying}
          >
            {paying ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text className="text-black font-bold text-base">Pay with PayPal</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

export default PaymentsList;
