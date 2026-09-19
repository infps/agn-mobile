import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import api from "@/service/api.service";
import { useAuth } from "@/context/AuthContext";

/**
 * What the signed-in account may do, fetched from the same endpoint the web
 * portal uses.
 *
 * This is what decides which shell a person sees. Holding any admin permission
 * means the admin shell is available; holding none means the breeder app is the
 * whole experience. Because it comes from the server, a permission revoked in
 * the ERP reshapes the app on next load with nothing to keep in sync.
 *
 * It is not a security boundary. Every request is re-checked server-side, so a
 * hidden screen and a forged request end at the same guard.
 */
interface PermissionState {
  permissions: string[];
  role: string | null;
  isApproved: boolean;
  isAdminCapable: boolean;
  isLoading: boolean;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  refresh: () => Promise<void>;
}

const PermissionContext = createContext<PermissionState | undefined>(undefined);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setPermissions([]);
      setRole(null);
      setIsApproved(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await api.get("/me/permissions");
      setPermissions(data?.permissions ?? []);
      setRole(data?.role ?? user.role ?? null);
      setIsApproved(data?.isApproved !== false);
    } catch {
      // An unreachable server must not strand somebody in a half-built shell,
      // so we fall back to no admin access and let the breeder app run.
      setPermissions([]);
      setRole(user.role ?? null);
      setIsApproved(true);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<PermissionState>(() => {
    const held = new Set(permissions);
    return {
      permissions,
      role,
      isApproved,
      isAdminCapable: permissions.length > 0,
      isLoading,
      can: (permission: string) => held.has(permission),
      canAny: (...list: string[]) => list.some((p) => held.has(p)),
      refresh: load,
    };
  }, [permissions, role, isApproved, isLoading, load]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionState {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePermissions must be used inside a PermissionProvider");
  }
  return ctx;
}
