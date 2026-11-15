import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "@/service/api.service";

// Big lists kept on the phone so screens open instantly.
// Hard expiry 24h; cleared on sign-out (AuthContext). Keys carry the user id.
const PREFIX = "listcache:";
const TTL = 24 * 60 * 60 * 1000;
// Android AsyncStorage can't read back rows over ~2MB (CursorWindow) — skip those.
const MAX_CHARS = 1_500_000;

export type ListCacheRec<T> = { at: number; rows: T[] };

export async function readListCache<T>(key: string): Promise<ListCacheRec<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const rec = JSON.parse(raw) as ListCacheRec<T>;
    if (Date.now() - rec.at < TTL) return rec;
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {}
  return null;
}

export async function writeListCache<T>(key: string, rows: T[]): Promise<void> {
  try {
    const raw = JSON.stringify({ at: Date.now(), rows } satisfies ListCacheRec<T>);
    if (raw.length > MAX_CHARS) await AsyncStorage.removeItem(PREFIX + key);
    else await AsyncStorage.setItem(PREFIX + key, raw);
  } catch {}
}

export async function clearListCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {}
}

/** Every page of a cursor-paginated endpoint ({ [field]: T[], nextCursor }). */
export async function fetchAllPages<T>(path: string, field: string): Promise<T[]> {
  let rows: T[] = [];
  let cursor: string | null = null;
  do {
    const res: { data?: Record<string, any> } = await api.get(path, {
      params: { limit: 500, ...(cursor ? { cursor } : {}) },
    });
    rows = rows.concat(res.data?.[field] ?? []);
    cursor = res.data?.nextCursor != null ? String(res.data.nextCursor) : null;
  } while (cursor);
  return rows;
}
