import Header from "@/components/header";
import { getSexLabel } from "@/constants/bird";
import { useBirds, useToast } from "@/context";
import { BirdType } from "@/context/BirdContext";
import { downloadAndShare } from "@/service/download.service";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** What `GET /api/breeder/birds` adds to each bird on top of the stored row. */
type ListedBird = BirdType & {
  image?: string | null;
  totalRaces?: number;
  wins?: number;
  bestPosition?: number | null;
  currentStatus?: string | null;
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  REGISTERED: { bg: "#dbeafe", fg: "#1d4ed8" },
  LOFT_BASKETED: { bg: "#fef9c3", fg: "#a16207" },
  RELEASED: { bg: "#ffedd5", fg: "#c2410c" },
  ARRIVED: { bg: "#dcfce7", fg: "#15803d" },
  FOREIGN_BIRD: { bg: "#fee2e2", fg: "#b91c1c" },
};

type Filter = "all" | "cock" | "hen" | "racing" | "lost";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cock", label: "Cocks" },
  { key: "hen", label: "Hens" },
  { key: "racing", label: "In a race" },
  { key: "lost", label: "Lost" },
];

const EXPORTS = [
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "csv", label: "CSV (.csv)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "html", label: "Web page (.html)" },
] as const;

/**
 * My Birds — the portal's /birds table as a list.
 *
 * Same data, same columns (band, name, colour, sex, races / wins / best,
 * current status), with the portal's band and name filters folded into one
 * search box. Adding and editing happen on their own screen.
 */
const Birds = () => {
  const { birds, loading, fetchBirds } = useBirds();
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // On focus rather than on mount, so coming back from adding or editing a
  // bird shows the change.
  useFocusEffect(
    useCallback(() => {
      fetchBirds();
    }, [fetchBirds])
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (birds as ListedBird[]).filter((b) => {
      if (filter === "cock" && b.sex !== 1) return false;
      if (filter === "hen" && b.sex !== 2) return false;
      if (filter === "racing" && !b.currentStatus) return false;
      if (filter === "lost" && b.isLost !== 1) return false;
      if (!q) return true;
      return (
        (b.band ?? "").toLowerCase().includes(q) ||
        (b.birdName ?? "").toLowerCase().includes(q) ||
        (b.rfid ?? "").toLowerCase().includes(q)
      );
    });
  }, [birds, query, filter]);

  const runExport = async (format: (typeof EXPORTS)[number]["format"]) => {
    setExporting(true);
    const result = await downloadAndShare(
      `/breeder/export/birds?format=${format}`,
      `my-birds.${format}`
    );
    setExporting(false);
    if (!result.ok) toast.error(result.problem ?? "Could not export your birds.");
  };

  const chooseExport = () =>
    Alert.alert("Export my birds", "Choose a format", [
      ...EXPORTS.map((e) => ({ text: e.label, onPress: () => runExport(e.format) })),
      { text: "Cancel", style: "cancel" as const },
    ]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header title="My Birds" />

      <View className="px-3 pt-3">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center rounded-lg border border-gray-300 bg-white px-3">
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              className="flex-1 py-2 pl-2 text-black"
              placeholder="Search band, name or tag"
              placeholderTextColor="#9ca3af"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white"
            onPress={chooseExport}
            disabled={exporting}
            accessibilityLabel="Export my birds"
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#189AB4" />
            ) : (
              <Ionicons name="download-outline" size={18} color="#189AB4" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
          {FILTERS.map((f) => {
            const on = f.key === filter;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                className={`mr-2 rounded-full border px-3 py-1.5 ${
                  on ? "bg-primary border-primary" : "bg-white border-gray-300"
                }`}
              >
                <Text className={on ? "text-white text-xs font-semibold" : "text-gray-700 text-xs"}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Text className="mt-2 text-xs text-gray-500">
          {shown.length} of {birds.length} bird{birds.length === 1 ? "" : "s"}
        </Text>
      </View>

      {loading && birds.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : (
        <FlatList
          data={shown}
          contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
          keyExtractor={(item, index) => (item?.id != null ? String(item.id) : String(index))}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await fetchBirds();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <View className="items-center py-12">
              <Ionicons name="egg-outline" size={40} color="#9ca3af" />
              <Text className="mt-3 text-gray-500">
                {birds.length === 0 ? "No birds yet. Add your first bird." : "No birds match."}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const status = item.currentStatus ?? null;
            const tone = status ? STATUS_STYLE[status] ?? { bg: "#f3f4f6", fg: "#6b7280" } : null;
            return (
              <TouchableOpacity
                onPress={() =>
                  router.push({ pathname: "/bird-detail", params: { birdId: String(item.id) } })
                }
                className="mb-2 flex-row items-center rounded-xl border border-gray-200 bg-white p-3"
              >
                <Text className="w-7 text-xs text-gray-400">{index + 1}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900">
                    {item.birdName || "Unnamed"}
                  </Text>
                  <Text className="text-xs text-gray-500">{item.band || "-"}</Text>
                  <Text className="mt-1 text-xs text-gray-500">
                    {item.color || "-"} · {getSexLabel(item.sex)}
                    {item.totalRaces !== undefined
                      ? ` · ${item.totalRaces} races / ${item.wins ?? 0} wins / best ${
                          item.bestPosition != null ? `#${item.bestPosition}` : "—"
                        }`
                      : ""}
                  </Text>
                  <View className="mt-1 flex-row gap-2">
                    {tone && status ? (
                      <View style={{ backgroundColor: tone.bg }} className="rounded-full px-2 py-0.5">
                        <Text style={{ color: tone.fg }} className="text-[10px] font-semibold">
                          {status.replace(/_/g, " ")}
                        </Text>
                      </View>
                    ) : null}
                    {item.isLost === 1 ? (
                      <View className="rounded-full bg-rose-100 px-2 py-0.5">
                        <Text className="text-[10px] font-semibold text-rose-700">LOST</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() =>
                    router.push({ pathname: "/bird-new", params: { birdId: String(item.id) } })
                  }
                  accessibilityLabel="Edit bird"
                  className="px-2"
                >
                  <Ionicons name="pencil" size={16} color="#189AB4" />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <View className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-white border-t border-gray-100">
        <TouchableOpacity
          className="bg-primary py-3 px-6 rounded-full items-center"
          onPress={() => router.push("/bird-new" as any)}
        >
          <Text className="text-white font-semibold text-base">Add Birds</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default Birds;

export { ErrorBoundary } from "@/components/ErrorScreen";
