import { useCallback, useEffect, useState } from "react";
import { fetchAllPages, readListCache, writeListCache } from "@/service/listCache.service";

const STALE = 5 * 60 * 1000;

/**
 * Whole paginated list: phone copy shown at once, refreshed in the background
 * when older than 5 min (or on reload()). Filter the rows locally.
 */
export function useCachedList<T>(path: string | null, field: string, cacheKey: string) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    if (!path) return;
    setError(null);
    setForbidden(false);
    try {
      const rows = await fetchAllPages<T>(path, field);
      setData(rows);
      writeListCache(cacheKey, rows);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) setForbidden(true);
      else setError(err?.response?.data?.message ?? "Could not load this just now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [path, field, cacheKey]);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    readListCache<T>(cacheKey).then((rec) => {
      if (!live) return;
      if (rec) {
        setData(rec.rows);
        setLoading(false);
      }
      if (!rec || Date.now() - rec.at > STALE) reload();
    });
    return () => {
      live = false;
    };
  }, [path, cacheKey, reload]);

  return {
    data,
    loading,
    error,
    forbidden,
    refreshing,
    reload,
    refresh: () => {
      setRefreshing(true);
      reload();
    },
  };
}
