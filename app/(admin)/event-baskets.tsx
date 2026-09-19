import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Empty,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
} from "@/components/admin/ui";

interface Assignment {
  id: number;
  inventoryItem?: {
    id: number;
    bird?: { id: number; band: string | null; birdName: string | null; rfid: string | null } | null;
    eventInventory?: {
      loft: string | null;
      breeder?: { firstName: string | null; lastName: string | null } | null;
    } | null;
  } | null;
}

interface Basket {
  id: number;
  basketNo: number;
  capacity: number;
  phase: string;
  label: string | null;
  raceId: number | null;
  _count?: { assignments?: number };
  assignments?: Assignment[];
}

/**
 * Baskets, and how full they are.
 *
 * A basket is really a number and a fill level, which is what the row shows.
 * The two phases are kept apart because a loft basket and a race basket can
 * share a number without being the same thing — the database allows it, and
 * mixing them on one list would make a real basket look double-booked.
 */
export default function EventBaskets() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [phase, setPhase] = useState<"LOFT" | "RACE">("LOFT");
  const [open, setOpen] = useState<number | null>(null);

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    baskets?: Basket[];
  }>(eventId ? `/admin/event/${eventId}/baskets` : null, [eventId]);

  const all = data?.baskets ?? [];
  const baskets = useMemo(
    () => all.filter((b) => b.phase === phase).sort((a, b) => a.basketNo - b.basketNo),
    [all, phase]
  );

  if (forbidden) return <NoAccess what="Baskets" />;

  const filled = (b: Basket) => b._count?.assignments ?? b.assignments?.length ?? 0;
  const placed = baskets.reduce((s, b) => s + filled(b), 0);
  const space = baskets.reduce((s, b) => s + b.capacity, 0);

  return (
    <Screen
      title="Baskets"
      subtitle={name ?? undefined}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
          {(["LOFT", "RACE"] as const).map((p) => {
            const active = p === phase;
            return (
              <Pressable
                key={p}
                onPress={() => {
                  setPhase(p);
                  setOpen(null);
                }}
                className={`flex-1 rounded-lg py-2 ${active ? "bg-blue-600" : ""}`}
              >
                <Text
                  className={`text-center text-sm font-medium ${
                    active ? "text-white" : "text-slate-600"
                  }`}
                >
                  {p === "LOFT" ? "Loft baskets" : "Race baskets"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Baskets" value={baskets.length} basis="31%" />
            <Figure label="Birds placed" value={placed} basis="31%" />
            <Figure
              label="Spaces left"
              value={Math.max(0, space - placed)}
              tone={space - placed <= 0 ? "text-rose-600" : "text-slate-900"}
              basis="31%"
            />
          </FigureRow>

          <View className="mt-4" style={{ gap: 10 }}>
            {baskets.length === 0 ? (
              <Empty>
                No {phase === "LOFT" ? "loft" : "race"} baskets have been created for this season.
              </Empty>
            ) : (
              baskets.map((basket) => {
                const count = filled(basket);
                const full = count >= basket.capacity;
                const isOpen = open === basket.id;
                return (
                  <View
                    key={basket.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : basket.id)}
                      className="flex-row items-center gap-3 px-4 py-3"
                    >
                      <View className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                        <Text className="text-sm font-bold text-slate-700">{basket.basketNo}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-medium text-slate-900">
                          {basket.label ?? `Basket ${basket.basketNo}`}
                        </Text>
                        <Text className={`text-xs ${full ? "text-rose-600" : "text-slate-500"}`}>
                          {count} of {basket.capacity}
                          {full ? " · full" : ""}
                        </Text>
                      </View>
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#94a3b8"
                      />
                    </Pressable>

                    {isOpen && (
                      <View className="border-t border-slate-100 p-3">
                        {(basket.assignments ?? []).length === 0 ? (
                          <Text className="px-1 text-xs text-slate-500">Empty.</Text>
                        ) : (
                          <Rows>
                            {(basket.assignments ?? []).slice(0, 40).map((a) => {
                              const b = a.inventoryItem?.bird;
                              const who = `${
                                a.inventoryItem?.eventInventory?.breeder?.firstName ?? ""
                              } ${a.inventoryItem?.eventInventory?.breeder?.lastName ?? ""}`.trim();
                              return (
                                <Row
                                  key={a.id}
                                  title={b?.band ?? "No band"}
                                  subtitle={
                                    who || a.inventoryItem?.eventInventory?.loft || undefined
                                  }
                                  leading={
                                    <Ionicons
                                      name={b?.rfid ? "radio" : "radio-outline"}
                                      size={14}
                                      color={b?.rfid ? "#059669" : "#cbd5e1"}
                                    />
                                  }
                                />
                              );
                            })}
                          </Rows>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
