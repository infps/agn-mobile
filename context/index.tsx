// context/index.tsx
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { AuthProvider, useAuth } from './AuthContext';
import { BirdProvider, useBirds } from './BirdContext';
import { EventProvider, useEvents } from './EventContext';
import { PaymentProvider, usePayments } from './PaymentContext';
import { ToastProvider, useToast } from './ToastContext';

export const AppProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <BottomSheetModalProvider>
      <ToastProvider>
        <AuthProvider>
          <BirdProvider>
            <EventProvider>
              <PaymentProvider>
                {children}
              </PaymentProvider>
            </EventProvider>
          </BirdProvider>
        </AuthProvider>
      </ToastProvider>
    </BottomSheetModalProvider>
  );
};

// Re-export all hooks for easier imports
export { useAuth, useBirds, useEvents, usePayments, useToast };

