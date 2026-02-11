import api from "@/service/api.service";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { Alert } from "react-native";

export interface PaymentType {
  paymentId: string;
  paidAt: Date;
  amountPaid: number;
  amountToPay: number;
  currency: string;
  method: string;
  status: string;
  paymentType: string;
  transactionId?: string;
  eventInventory?: {
    event: {
      eventId: string;
      name: string;
      startDate: Date;
    };
  };
}

interface PaymentContextType {
  payments: PaymentType[];
  loading: boolean;
  error: string | null;
  capturePayment: (orderId: string) => Promise<{ success: boolean; captureId?: string }>;
  createPaymentOrder: (paymentId: string) => Promise<{ orderId: string }>;
  cancelPayment: (orderId: string) => Promise<{ success: boolean }>;
  getMyPayments: () => Promise<PaymentType[]>;
  getPaymentDetails: (paymentId: string) => Promise<PaymentType | null>;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

export const PaymentProvider = ({ children }: { children: ReactNode }) => {
  const [payments, setPayments] = useState<PaymentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capturePayment = useCallback(async (orderId: string) => {
    // TODO: Implement when PayPal integration is ready
    console.warn("capturePayment: PayPal integration deferred");
    return { success: false };
  }, []);

  const createPaymentOrder = useCallback(async (paymentId: string) => {
    // TODO: Implement when PayPal integration is ready
    console.warn("createPaymentOrder: PayPal integration deferred");
    return { orderId: "" };
  }, []);

  const cancelPayment = useCallback(async (orderId: string) => {
    // TODO: Implement when PayPal integration is ready
    console.warn("cancelPayment: PayPal integration deferred");
    return { success: false };
  }, []);

  const getMyPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/breeder/payments");
      const data = response.data.payments || [];
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

  const getPaymentDetails = useCallback(async (paymentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/breeder/payments/${paymentId}`);
      return response.data.payment || null;
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
