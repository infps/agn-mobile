import React, { useState } from "react";
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

interface Vaccination {
  id: number;
  name: string | null;
  vaccinationDate: string | null;
  notes: string | null;
}

interface Member {
  id: number;
  bird: { id: number; band: string | null; color: string | null } | null;
  eventInventory?: { loft: string | null } | null;
}

interface Group {
  id: number;
  name: string | null;
  type: string | null;
  hasCapacity: boolean | null;
  capacity: number | null;
  statusCode?: { code: string | null; label: string | null; color: string | null } | null;
  _count?: { members?: number; vaccinations?: number };
  vaccinations?: Vaccination[];
  members?: Member[];
}

/**
 * Loft sections, and what has been done to the birds in them.
 *
 * Groups matter mostly as an answer to "where is this bird and has it had its
 * shots", so each one opens in place to show its vaccination record and its
 * members rather than pushing to another screen. Expanding beats navigating
 * when you are comparing two sections.
 */
export default function EventGroups() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [open, setOpen] = useState<number | null>(null);

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    groups?: Group[];
  }>(eventId ? `/admin/event/${eventId}/groups` : null, [eventId]);

  const groups = data?.groups ?? [];

  if (forbidden) return <NoAccess what="Groups" />;

  const members = groups.reduce((s, g) => s + (g._count?.members ?? g.members?.length ?? 0), 0);
  const shots = groups.reduce((s, g) => s + (g._count?.vaccinations ?? g.vaccinations?.length ?? 0), 0);

  return (
    <Screen
      title="Groups"
      subtitle={name ? `${name} · ${groups.length} sections` : `${groups.length} sections`}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Sections" value={groups.length} basis="31%" />
            <Figure label="Birds placed" value={members} basis="31%" />
            <Figure label="Vaccinations" value={shots} basis="31%" />
          </FigureRow>

          <View className="mt-4" style={{ gap: 10 }}>
            {groups.length === 0 ? (
              <Empty>No groups have been created for this season.</Empty>
            ) : (
              groups.map((group) => {
                const count = group._count?.members ?? group.members?.length ?? 0;
                const isOpen = open === group.id;
                return (
                  <View
                    key={group.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : group.id)}
                      className="flex-row items-center gap-3 px-4 py-3"
                    >
                      <View className="flex-1">
                        <Text className="font-medium text-slate-900">
                          {group.name ?? `Group ${group.id}`}
                        </Text>
                        <Text className="text-xs text-slate-500">
                          {count} birds
                          {group.hasCapacity && group.capacity ? ` of ${group.capacity}` : ""}
                          {group.type ? ` · ${group.type.toLowerCase()}` : ""}
                        </Text>
                      </View>
                      {group.statusCode?.label ? (
                        <View className="rounded-full bg-slate-100 px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-slate-600">
                            {group.statusCode.label}
                          </Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#94a3b8"
                      />
                    </Pressable>

                    {isOpen && (
                      <View className="border-t border-slate-100 px-4 py-3">
                        <Text className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Vaccinations
                        </Text>
                        {(group.vaccinations ?? []).length === 0 ? (
                          <Text className="text-xs text-slate-500">Nothing recorded.</Text>
                        ) : (
                          (group.vaccinations ?? []).slice(0, 8).map((v) => (
                            <Text key={v.id} className="text-xs text-slate-600">
                              {v.name ?? "Vaccination"}
                              {v.vaccinationDate
                                ? ` · ${new Date(v.vaccinationDate).toLocaleDateString()}`
                                : ""}
                            </Text>
                          ))
                        )}

                        <Text className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Birds
                        </Text>
                        {(group.members ?? []).length === 0 ? (
                          <Text className="text-xs text-slate-500">Empty.</Text>
                        ) : (
                          <Rows>
                            {(group.members ?? []).slice(0, 40).map((m) => (
                              <Row
                                key={m.id}
                                title={m.bird?.band ?? "No band"}
                                subtitle={
                                  [m.bird?.color, m.eventInventory?.loft]
                                    .filter(Boolean)
                                    .join(" · ") || undefined
                                }
                              />
                            ))}
                          </Rows>
                        )}
                        {(group.members ?? []).length > 40 && (
                          <Text className="mt-2 text-xs text-slate-400">
                            Showing 40 of {(group.members ?? []).length}.
                          </Text>
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
