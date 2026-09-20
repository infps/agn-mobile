import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
 * hidden screen and a forged request end at the same guard. That is also why
 * the last answer can safely be cached: the worst a stale cache does is show
 * somebody a screen whose every call then refuses them.
 *
 * Caching matters because the alternative was worse. A failed fetch used to
 * fall through to "no permissions", which is indistinguishable from "you are a
 * breeder" — so one slow request on a cold server dropped an event organiser
 * into the breeder app and looked like their access had been taken away. The
 * server's last answer is kept per account and reused when the fetch fails.
 */
interface PermissionState {
  permissions: string[];
  role: string | null;
  isApproved: boolean;
  isAdminCapable: boolean;
  isLoading: boolean;
  /** True when these came from the cache because the server could not be asked. */
  isStale: boolean;
  /** True when there is nothing to fall back on either — the shell is a guess. */
  isUnknown: boolean;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  refresh: () => Promise<void>;
}

const PermissionContext = createContext<PermissionState | undefined>(undefined);

interface Cached {
  permissions: string[];
  role: string | null;
  isApproved: boolean;
  isAdminCapable: boolean;
}

/** Keyed by user so a shared device never hands one account another's shell. */
const cacheKey = (userId: string) => `pigeon_plus_permissions_${userId}`;

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(true);
  const [isAdminCapable, setIsAdminCapable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [isUnknown, setIsUnknown] = useState(false);

  const apply = useCallback((next: Cached, stale: boolean) => {
    setPermissions(next.permissions);
    setRole(next.role);
    setIsApproved(next.isApproved);
    setIsAdminCapable(next.isAdminCapable);
    setIsStale(stale);
    setIsUnknown(false);
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setPermissions([]);
      setRole(null);
      setIsApproved(true);
      setIsAdminCapable(false);
      setIsStale(false);
      setIsUnknown(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await api.get("/me/permissions");
      const fresh: Cached = {
        permissions: data?.permissions ?? [],
        role: data?.role ?? user.role ?? null,
        isApproved: data?.isApproved !== false,
        // The server works this out; recomputing it here would mean the rule
        // lived in two places and could drift.
        isAdminCapable: data?.isAdminCapable === true,
      };
      apply(fresh, false);
      await AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(fresh)).catch(() => undefined);
    } catch {
      // Could not ask. Reuse the server's last answer for this account rather
      // than inventing "no permissions", which reads as a demotion.
      try {
        const raw = await AsyncStorage.getItem(cacheKey(user.id));
        if (raw) {
          apply(JSON.parse(raw) as Cached, true);
          return;
        }
      } catch {
        // fall through to unknown
      }
      setPermissions([]);
      setRole(user.role ?? null);
      setIsApproved(true);
      setIsAdminCapable(false);
      setIsStale(false);
      setIsUnknown(true);
    } finally {
      setIsLoading(false);
    }
  }, [user, apply]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<PermissionState>(() => {
    const held = new Set(permissions);
    return {
      permissions,
      role,
      isApproved,
      isAdminCapable,
      isLoading,
      isStale,
      isUnknown,
      can: (permission: string) => held.has(permission),
      canAny: (...list: string[]) => list.some((p) => held.has(p)),
      refresh: load,
    };
  }, [permissions, role, isApproved, isAdminCapable, isLoading, isStale, isUnknown, load]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionState {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePermissions must be used inside a PermissionProvider");
  }
  return ctx;
}
