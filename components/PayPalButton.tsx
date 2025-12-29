import { useToast } from '@/context/ToastContext';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity } from 'react-native';

interface PayPalButtonProps {
  eventId: number;
  selectedBirds: any[];
  selectedTeam: string;
  totalAmount: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const PayPalButton: React.FC<PayPalButtonProps> = ({
  eventId,
  selectedBirds,
  selectedTeam,
  totalAmount,
  onSuccess,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handlePayPalPayment = async () => {
    try {
      setIsLoading(true);

      // For now, we'll simulate PayPal integration
      // In production, you would integrate with PayPal SDK here
      
      // Option 1: Open PayPal in web browser
      const paypalUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=your-business-email@example.com&item_name=Event Registration&amount=${totalAmount}&currency_code=USD`;
      
      Alert.alert(
        'PayPal Payment',
        'You will be redirected to PayPal to complete your payment.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setIsLoading(false),
          },
          {
            text: 'Continue',
            onPress: () => {
              Linking.openURL(paypalUrl).then(() => {
                toast.success('Redirected to PayPal');
                onSuccess?.();
              }).catch((error) => {
                toast.error('Failed to open PayPal');
                onError?.('Failed to open PayPal');
              });
              setIsLoading(false);
            },
          },
        ]
      );

    } catch (error: any) {
      console.error('PayPal payment error:', error);
      const errorMessage = error.message || 'Payment failed. Please try again.';
      toast.error(errorMessage);
      onError?.(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePayPalPayment}
      disabled={isLoading}
      className={`w-full py-4 rounded-lg flex-row items-center justify-center ${
        isLoading
          ? 'bg-gray-400'
          : 'bg-[#FFC439] hover:bg-[#FFB300]'
      } transition-colors`}
    >
      {isLoading ? (
        <ActivityIndicator color="#000" size="small" />
      ) : (
        <>
          <Text className="text-black font-bold text-lg mr-2">Pay</Text>
          <Text className="text-black font-bold text-lg">Pal</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

export default PayPalButton;
