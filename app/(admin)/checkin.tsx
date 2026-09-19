import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/context/ToastContext";
import { EventPicker } from "@/components/admin/EventPicker";

interface CheckinItem {
  id: number;
  birdId: number | null;
  bird: {
    id: number;
    band: string | null;
    birdName: string | null;
    rfid: string | null;
    color: string | null;
    sex: string | null;
    attention: string | null;
  } | null;
  breeder: { id: number; firstName: string | null; lastName: string | null } | null;
  isCheckedIn: boolean;
  hasRfid: boolean;
  hasPaid: boolean;
  loftBasketLabel: string | null;
}

/**
 * The scanning screen — the one thing the phone does better than the desktop.
 *
 * Two jobs share it because in practice one person does both with the same
 * hardware: linking a tag to a bird at intake, and clocking a bird as it comes
 * home. A raceId in the route means arrivals; otherwise it is intake.
 *
 * The input keeps focus and clears itself after every read, so a hardware
 * wedge scanner can fire straight down a basket without anyone touching the
 * screen. The last few reads stay visible because that list is the only way to
 * notice a scanner that has started reading the same tag twice.
 */

/** The scan endpoint wants YYYYMMDDHHMMSSsss in UTC. */
function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}` +
    `${p(d.getUTCMilliseconds(), 3)}`
  );
}

interface LogLine {
  key: string;
  text: string;
  detail: string;
  ok: boolean;
}

export default function AdminCheckin() {
  const { raceId } = useLocalSearchParams<{ raceId?: string }>();
  const { can } = usePermissions();
  const { gutter, isWide } = useResponsive();
  const toast = useToast();

  const isArrivals = Boolean(raceId);

  const [eventId, setEventId] = useState<number | null>(null);
  const [items, setItems] = useState<CheckinItem[]>([]);
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState("");
  const [selected, setSelected] = useState<CheckinItem | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(!isArrivals);
  const [sending, setSending] = useState(false);

  const scanRef = useRef<TextInput>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (isArrivals || eventId == null) return;
    try {
      const { data } = await api.get(`/admin/event/${eventId}/checkin-status`);
      setItems(data?.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, isArrivals]);

  useEffect(() => {
    if (isArrivals) return;
    setLoading(true);
    load();
  }, [load, isArrivals]);

  const note = (text: string, detail: string, ok: boolean) => {
    seq.current += 1;
    setLog((prev) => [{ key: `${seq.current}`, text, detail, ok }, ...prev].slice(0, 25));
  };

  const submit = async () => {
    const value = scan.trim();
    if (!value || sending) return;

    setSending(true);
    try {
      if (isArrivals) {
        await api.post(`/admin/race/${raceId}/scan`, {
          ringNo: value,
          timestamp: stamp(new Date()),
        });
        note(value, "clocked in", true);
      } else {
        if (!selected) {
          note(value, "pick the bird this tag belongs to first", false);
          return;
        }
        await api.post(`/admin/event/${eventId}/checkin`, {
          eventInventoryItemId: selected.id,
          rfid: value,
        });
        note(
          selected.bird?.band ?? `Item ${selected.id}`,
          `tag ${value} linked`,
          true
        );
        setSelected(null);
        load();
      }
      setScan("");
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "That scan was not accepted.";
      note(value, message, false);
      toast.error(message);
    } finally {
      setSending(false);
      // Keep the cursor where a wedge scanner expects it.
      scanRef.current?.focus();
    }
  };

  const visible = useMemo(() => {
    if (!query.trim()) return items.slice(0, 60);
    const q = query.toLowerCase();
    return items
      .filter((item) => {
        const breeder = `${item.breeder?.firstName ?? ""} ${item.breeder?.lastName ?? ""}`;
        return (
          (item.bird?.band ?? "").toLowerCase().includes(q) ||
          (item.bird?.birdName ?? "").toLowerCase().includes(q) ||
          breeder.toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [items, query]);

  if (!can("checkin.manage")) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Ionicons name="lock-closed-outline" size={28} color="#94a3b8" />
        <Text className="mt-3 text-center text-sm text-slate-500">
          Scanning is not part of your access.
        </Text>
      </View>
    );
  }

  const summary = {
    total: items.length,
    done: items.filter((i) => i.isCheckedIn).length,
  };

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">
        {isArrivals ? "Clock arrivals" : "Check in birds"}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">
        {isArrivals
          ? `Race ${raceId} · every read is timed at the moment it lands`
          : "Link each tag to the bird it belongs to"}
      </Text>

      {!isArrivals && (
        <View className="mt-3">
          <EventPicker value={eventId} onChange={(id) => setEventId(id)} />
        </View>
      )}

      <View className="mt-3 flex-row items-center gap-2 rounded-xl border-2 border-blue-500 bg-white px-3">
        <Ionicons name="scan-outline" size={18} color="#2563eb" />
        <TextInput
          ref={scanRef}
          value={scan}
          onChangeText={setScan}
          onSubmitEditing={submit}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder={isArrivals ? "Scan or type a band number" : "Scan or type a tag"}
          placeholderTextColor="#94a3b8"
          className="flex-1 py-3 text-base text-slate-900"
        />
        <Pressable
          onPress={submit}
          disabled={sending || scan.trim().length === 0}
          className={`rounded-lg px-3 py-1.5 ${
            sending || scan.trim().length === 0 ? "bg-slate-200" : "bg-blue-600"
          }`}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-sm font-medium text-white">Enter</Text>
          )}
        </Pressable>
      </View>

      {!isArrivals && selected && (
        <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5">
          <Ionicons name="arrow-forward" size={14} color="#2563eb" />
          <Text className="flex-1 text-sm text-blue-900">
            Next tag goes to {selected.bird?.band ?? `item ${selected.id}`}
          </Text>
          <Pressable onPress={() => setSelected(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#1e40af" />
          </Pressable>
        </View>
      )}

      <View className={isWide ? "mt-3 flex-1 flex-row" : "mt-3 flex-1"} style={{ gap: 12 }}>
        <View style={{ flex: isWide ? 3 : 1 }}>
          {!isArrivals && (
            <>
              <View className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                <Ionicons name="search" size={16} color="#94a3b8" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Band, bird or breeder"
                  placeholderTextColor="#94a3b8"
                  className="flex-1 py-2.5 text-sm text-slate-900"
                />
              </View>

              <Text className="mt-2 text-xs text-slate-500">
                {summary.done} of {summary.total} checked in
              </Text>

              {loading ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" />
                </View>
              ) : (
                <ScrollView className="mt-2 flex-1">
                  {visible.length === 0 ? (
                    <View className="rounded-xl border border-slate-200 bg-white p-8">
                      <Text className="text-center text-sm text-slate-500">
                        {items.length === 0
                          ? "Nothing registered for this event yet."
                          : "No bird matches that search."}
                      </Text>
                    </View>
                  ) : (
                    <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {visible.map((item, index) => {
                        const breeder = `${item.breeder?.firstName ?? ""} ${
                          item.breeder?.lastName ?? ""
                        }`.trim();
                        const active = selected?.id === item.id;
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              setSelected(active ? null : item);
                              scanRef.current?.focus();
                            }}
                            className={`flex-row items-center gap-3 px-4 py-3 ${
                              index > 0 ? "border-t border-slate-100" : ""
                            } ${active ? "bg-blue-50" : ""}`}
                          >
                            <Ionicons
                              name={
                                item.isCheckedIn
                                  ? "checkmark-circle"
                                  : "ellipse-outline"
                              }
                              size={18}
                              color={item.isCheckedIn ? "#059669" : "#cbd5e1"}
                            />
                            <View className="flex-1">
                              <Text className="text-sm font-medium text-slate-900">
                                {item.bird?.band ?? "No band"}
                                {item.bird?.birdName ? ` · ${item.bird.birdName}` : ""}
                              </Text>
                              <Text className="text-xs text-slate-500">
                                {breeder || "Unassigned"}
                                {item.loftBasketLabel ? ` · ${item.loftBasketLabel}` : ""}
                              </Text>
                            </View>
                            {!item.hasPaid && (
                              <View className="rounded-full bg-amber-100 px-2 py-0.5">
                                <Text className="text-[10px] font-medium text-amber-700">
                                  unpaid
                                </Text>
                              </View>
                            )}
                            {item.hasRfid && !item.hasPaid && (
                              <Text className="text-[10px] text-slate-400">tagged</Text>
                            )}
                          </Pressable>
                        );
                      })}
                      {items.length > visible.length && (
                        <Text className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-400">
                          Showing {visible.length} of {items.length} — search to narrow it down.
                        </Text>
                      )}
                    </View>
                  )}
                </ScrollView>
              )}
            </>
          )}
        </View>

        <View style={{ flex: isWide ? 2 : undefined, maxHeight: isWide ? undefined : 220 }}>
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Recent reads
          </Text>
          <ScrollView className="flex-1">
            {log.length === 0 ? (
              <Text className="text-xs text-slate-400">Nothing scanned yet.</Text>
            ) : (
              <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {log.map((line, index) => (
                  <View
                    key={line.key}
                    className={`flex-row items-start gap-2 px-3 py-2.5 ${
                      index > 0 ? "border-t border-slate-100" : ""
                    }`}
                  >
                    <Ionicons
                      name={line.ok ? "checkmark-circle" : "alert-circle"}
                      size={15}
                      color={line.ok ? "#059669" : "#e11d48"}
                    />
                    <View className="flex-1">
                      <Text className="text-xs font-medium text-slate-900">{line.text}</Text>
                      <Text
                        className={`text-[11px] ${
                          line.ok ? "text-slate-500" : "text-rose-600"
                        }`}
                      >
                        {line.detail}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
