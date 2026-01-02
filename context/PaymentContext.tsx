// context/PaymentContext.tsx
import api from '@/service/api.service';
import * as SecureStore from 'expo-secure-store';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { Alert } from 'react-native';

export interface PaymentType {
  idPayment: number;
  paymentDate: Date;
  paymentValue: number;
  status: number; // 0: Pending, 1: Completed, 2: Pending Confirmation, 3: Failed
  paymentType: number; // 0: Perch Fee, 1: Entry Fee, etc.
  transactionId?: string;
  eventInventory?: {
    event: {
      idEvent: number;
      eventName: string;
      eventDate: Date;
    };
  };
}

interface PaymentContextType {
  payments: PaymentType[];
  loading: boolean;
  error: string | null;
  capturePayment: (orderId: string) => Promise<{ success: boolean; captureId?: string }>;
  createPaymentOrder: (paymentId: number) => Promise<{ orderId: string }>;
  cancelPayment: (orderId: string) => Promise<{ success: boolean }>;
  getMyPayments: () => Promise<PaymentType[]>;
  getPaymentDetails: (paymentId: number) => Promise<PaymentType | null>;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

export const PaymentProvider = ({ children }: { children: ReactNode }) => {
  const [payments, setPayments] = useState<PaymentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_URL = "YOUR_API_BASE_URL"; // Replace with your actual API base URL

  const capturePayment = useCallback(async (orderId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`${API_URL}/api/payments/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
        },
        body: JSON.stringify({ orderId }),
      });

      if (!response.data.success) {
        const errorData = await response.data.data;
        throw new Error(errorData.message || "Failed to capture payment");
      }

      const data = await response.data.data;
      return { success: true, captureId: data.captureId };
    } catch (err: any) {
      setError(err.message || "Failed to capture payment");
      Alert.alert("Error", err.message || "Failed to capture payment");
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, []);

  const createPaymentOrder = useCallback(async (paymentId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/payments/${paymentId}/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create payment order");
      }

      const data = await response.json();
      return { orderId: data.orderId };
    } catch (err: any) {
      setError(err.message || "Failed to create payment order");
      Alert.alert("Error", err.message || "Failed to create payment order");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelPayment = useCallback(async (orderId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/payments/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
        },
        body: JSON.stringify({ orderId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to cancel payment");
      }

      return { success: true };
    } catch (err: any) {
      setError(err.message || "Failed to cancel payment");
      Alert.alert("Error", err.message || "Failed to cancel payment");
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, []);

  const getMyPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/payments/my`);
      if (!response.data.success) {
        throw new Error("Failed to fetch payments");
      }

      const data = await response.data.data;
      setPayments(data);
      return data;
    } catch (err: any) {
      setError(err.message || "Failed to fetch payments");
      Alert.alert("Error", "Failed to fetch payments");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getPaymentDetails = useCallback(async (paymentId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${await SecureStore.getItemAsync("auth_token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Payment not found");
      }

      return await response.json();
    } catch (err: any) {
      setError(err.message || "Failed to fetch payment details");
      Alert.alert("Error", "Failed to fetch payment details");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <PaymentContext.Provider
      value={{
        payments,
        loading,
        error,
        capturePayment,
        createPaymentOrder,
        cancelPayment,
        getMyPayments,
        getPaymentDetails,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
};

export const usePayments = (): PaymentContextType => {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error("usePayments must be used within a PaymentProvider");
  }
  return context;
};