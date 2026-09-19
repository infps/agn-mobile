import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { Empty, Loading, NoAccess, Notice, Screen } from "@/components/admin/ui";

interface Station {
  id: number;
  name: string | null;
  miles: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  stationRaceTypes?: { raceType?: { id: number; name: string | null } | null }[];
}

/**
 * Liberation points, sorted by how far out they are.
 *
 * Distance is the ordering because that is how a season is built — short
 * trainers first, then out. Coordinates open the phone's map app rather than
 * being drawn here: somebody looking at this on the road wants directions, and
 * an embedded map is the slowest possible way to get them.
 */
export default function EventStations() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    stations?: Station[];
  }>(eventId ? `/admin/event/${eventId}/stations` : null, [eventId]);

  const stations = data?.stations ?? [];

  if (forbidden) return <NoAccess what="Stations" />;

  const openMap = (s: Station) => {
    if (s.latitude == null || s.longitude == null) return;
    Linking.openURL(`https://maps.google.com/?q=${s.latitude},${s.longitude}`);
  };

  return (
    <Screen
      title="Stations"
      subtitle={name ? `${name} · ${stations.length} liberation points` : `${stations.length} liberation points`}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4" style={{ gap: 10 }}>
            {stations.length === 0 ? (
              <Empty>No liberation points have been set up for this season.</Empty>
            ) : (
              stations.map((s) => {
                const types = (s.stationRaceTypes ?? [])
                  .map((t) => t.raceType?.name)
                  .filter(Boolean)
                  .join(", ");
                const hasCoords = s.latitude != null && s.longitude != null;
                return (
                  <View key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="min-w-0 flex-1">
                        <Text className="font-medium text-slate-900">
                          {s.name ?? `Station ${s.id}`}
                        </Text>
                        {s.address ? (
                          <Text className="mt-0.5 text-xs text-slate-500">{s.address}</Text>
                        ) : null}
                        {types ? (
                          <Text className="mt-1 text-xs text-slate-400">{types}</Text>
                        ) : null}
                      </View>
                      <Text className="text-lg font-bold text-slate-900">
                        {s.miles != null ? `${Math.round(s.miles)} mi` : "—"}
                      </Text>
                    </View>

                    {hasCoords && (
                      <Pressable
                        onPress={() => openMap(s)}
                        className="mt-3 flex-row items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-1.5"
                      >
                        <Ionicons name="navigate-outline" size={14} color="#2563eb" />
                        <Text className="text-xs font-medium text-blue-600">Directions</Text>
                      </Pressable>
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
