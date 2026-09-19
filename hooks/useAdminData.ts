import { useCallback, useEffect, useState } from "react";
import api from "@/service/api.service";

export interface AdminData<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  /** Set when the server refused this person, as opposed to failing. */
  forbidden: boolean;
  error: string | null;
  refresh: () => void;
  reload: () => Promise<void>;
}

/**
 * One GET, with the three outcomes every admin section has to tell apart.
 *
 * Refusal is not failure. A 401 or 403 means this person was not granted the
 * section, which is a supported state and should read as a sentence about
 * access; anything else is a fault and should read as one. Collapsing the two
 * into "something went wrong" is how a permission system starts looking broken
 * to the people it is working correctly on.
 *
 * A 404 from these endpoints almost always means the event has no active
 * season yet rather than a wrong URL, so its message is passed through — the
 * server says it better than a generic string would.
 */
export function useAdminData<T = any>(
  path: string | null,
  deps: unknown[] = []
): AdminData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setForbidden(false);
    setError(null);
    try {
      const res = await api.get(path);
      setData(res.data ?? null);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setForbidden(true);
      } else {
        setError(err?.response?.data?.message ?? "Could not load this just now.");
      }
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // The caller decides what makes this stale — usually an event or season id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    forbidden,
    error,
    refresh: () => {
      setRefreshing(true);
      load();
    },
    reload: load,
  };
}
