// context/index.tsx
import { AuthProvider, useAuth } from "./AuthContext";
import { BirdProvider, useBirds } from "./BirdContext";
import { EventProvider, useEvents } from "./EventContext";
import { PaymentProvider, usePayments } from "./PaymentContext";
import { PermissionProvider, usePermissions } from "./PermissionContext";
import { ToastProvider, useToast } from "./ToastContext";

export const AppProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <ToastProvider>
      <AuthProvider>
        <PermissionProvider>
          <BirdProvider>
            <EventProvider>
              <PaymentProvider>{children}</PaymentProvider>
            </EventProvider>
          </BirdProvider>
        </PermissionProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

// Re-export all hooks for easier imports
export { useAuth, useBirds, useEvents, usePayments, usePermissions, useToast };
