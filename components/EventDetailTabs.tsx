import { bandOf, htmlToText, isLiveRace, raceRoute } from "@/components/EventShared";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import api from "@/service/api.service";
import { downloadAndShare } from "@/service/download.service";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, UrlTile } from "react-native-maps";
import { MAPS_AVAILABLE, MapUnavailable } from "@/components/MapUnavailable";

/**
 * The tabs of an event, one component each.
 *
 * They follow the portal's event page tab for tab — Breeders, Birds, Result,
 * Stations, Messages, History — and each loads its own data from the same
 * route the portal's tab does, so a tab nobody opens costs nothing.
 */

const PRIMARY = "#189AB4";

function Loading() {
  return <ActivityIndicator style={{ marginTop: 32 }} color={PRIMARY} />;
}

function Problem({ text }: { text: string }) {
  return <Text className="text-red-500 text-center mt-8 px-6">{text}</Text>;
}

function Empty({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View className="items-center justify-center py-16 px-6">
      <Ionicons name={icon} size={40} color="#9ca3af" />
      <Text className="text-gray-500 text-center mt-3">{text}</Text>
    </View>
  );
}

function useLoad<T>(path: string, pick: (data: any) => T, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .get(path)
      .then((r) => alive && setData(pick(r.data)))
      .catch((e) => alive && setError(e?.response?.data?.message ?? "Could not load this."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // `pick` is a stable inline selector at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return { data, loading, error };
}

function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose} />
      <View style={{ backgroundColor: "white", borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "80%" }}>
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
          <Text className="text-base font-bold text-gray-900 flex-1" numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

function sexText(sex: unknown): string {
  if (sex === 1 || sex === "1") return "Cock";
  if (sex === 2 || sex === "2") return "Hen";
  if (sex == null || sex === 0 || sex === "0") return "—";
  return String(sex);
}

function BirdRows({ birds }: { birds: any[] }) {
  if (birds.length === 0) return <Text className="text-gray-500 text-sm">No birds entered yet.</Text>;
  return (
    <View>
      <View className="flex-row bg-primary px-2 py-2 rounded-t">
        <Text className="text-white text-xs font-bold flex-1">Band</Text>
        <Text className="text-white text-xs font-bold flex-1">Name</Text>
        <Text className="text-white text-xs font-bold w-14">Color</Text>
        <Text className="text-white text-xs font-bold w-12">Sex</Text>
      </View>
      {birds.map((b, i) => (
        <View key={b?.id ?? i} className="flex-row px-2 py-2 border-b border-gray-100">
          <Text className="text-xs flex-1 font-mono">{bandOf(b) || "-"}</Text>
          <Text className="text-xs flex-1">{b?.birdName || "-"}</Text>
          <Text className="text-xs w-14">{b?.color || "-"}</Text>
          <Text className="text-xs w-12">{sexText(b?.sex)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Breeders ────────────────────────────────────────────────────────────────

export function BreedersTab({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const { data: inventories, loading, error } = useLoad<any[]>(
    `/breeder/event/${eventId}/inventory`,
    (d) => d.eventInventory ?? [],
    []
  );
  const { data: defaulters } = useLoad<any[]>(
    `/breeder/event/${eventId}/defaulters`,
    (d) => d.defaulters ?? [],
    []
  );
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<any | null>(null);
  const [openDefaulter, setOpenDefaulter] = useState<number | null>(null);

  const isMine = (inv: any) => !!user?.id && String(inv?.breeder?.userId) === String(user.id);

  const rows = useMemo(() => {
    const mine = inventories.filter(isMine);
    const others = inventories.filter((inv) => !isMine(inv));
    const q = query.trim().toLowerCase();
    return [...mine, ...others].filter((inv) => {
      if (!q) return true;
      const name = `${inv?.breeder?.firstName ?? ""} ${inv?.breeder?.lastName ?? ""}`.toLowerCase();
      return name.includes(q) || String(inv?.loft ?? "").toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventories, query, user?.id]);

  const myInventory = inventories.find(isMine);

  if (loading) return <Loading />;
  if (error) return <Problem text={error} />;

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(inv) => String(inv.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-2">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-base font-bold text-gray-900">
                Registered Breeders ({inventories.length})
              </Text>
              {myInventory && (
                <TouchableOpacity
                  onPress={() => setPicked(myInventory)}
                  className="flex-row items-center border border-primary rounded-lg px-3 py-1.5"
                >
                  <Ionicons name="person-outline" size={14} color={PRIMARY} />
                  <Text className="text-primary text-xs font-semibold ml-1">My Loft</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search breeder or loft…"
              placeholderTextColor="#9ca3af"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-black"
            />
          </View>
        }
        renderItem={({ item }) => {
          const name = [item?.breeder?.firstName, item?.breeder?.lastName].filter(Boolean).join(" ") || "Unknown";
          const image = item?.breeder?.user?.image ?? item?.breeder?.image;
          const place = [item?.breeder?.state1, item?.breeder?.country].filter(Boolean).join(", ");
          return (
            <TouchableOpacity
              onPress={() => setPicked(item)}
              className="flex-row items-center py-3 border-b border-gray-100"
            >
              {image ? (
                <Image source={{ uri: image }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#e0f2fe", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: PRIMARY, fontWeight: "700" }}>{name.slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <View className="flex-1 ml-3">
                <View className="flex-row items-center">
                  <Text className="text-sm font-semibold text-gray-900">{name}</Text>
                  {isMine(item) && (
                    <View className="bg-primary rounded-full px-2 py-0.5 ml-2">
                      <Text className="text-white text-[10px]">You</Text>
                    </View>
                  )}
                  {isMine(item) && item.approvalStatus && item.approvalStatus !== "APPROVED" && (
                    <View className="bg-amber-100 rounded-full px-2 py-0.5 ml-1">
                      <Text className="text-amber-700 text-[10px]">{String(item.approvalStatus).toLowerCase()}</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-gray-500">
                  {item.loft || "—"}
                  {place ? ` · ${place}` : ""}
                </Text>
              </View>
              <Text className="text-sm font-bold text-gray-800">{item.items?.length ?? 0}</Text>
              <Ionicons name="chevron-forward" size={14} color="#9ca3af" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Empty icon="people-outline" text="No breeders registered yet." />}
        ListFooterComponent={
          defaulters.length > 0 ? (
            <View className="mt-6 border border-red-200 rounded-xl overflow-hidden">
              <View className="flex-row items-center px-3 py-3 bg-red-50">
                <Ionicons name="warning-outline" size={18} color="#dc2626" />
                <Text className="text-red-600 font-bold ml-2">Defaulters ({defaulters.length})</Text>
              </View>
              {defaulters.map((d) => {
                const open = openDefaulter === d.eventInventoryId;
                return (
                  <View key={d.eventInventoryId} className="border-t border-red-100">
                    <TouchableOpacity
                      className="flex-row items-center px-3 py-3"
                      onPress={() => setOpenDefaulter(open ? null : d.eventInventoryId)}
                      disabled={!d.birds?.length}
                    >
                      <Ionicons
                        name={open ? "chevron-down" : "chevron-forward"}
                        size={14}
                        color={d.birds?.length ? "#6b7280" : "transparent"}
                      />
                      <Text className="flex-1 text-sm font-medium ml-2">{d.breederName || "Unknown"}</Text>
                      <Text className="text-xs text-gray-500 mr-3">{d.loft ?? "-"}</Text>
                      <Text className="text-sm text-red-500">{d.birds?.length ?? 0}</Text>
                    </TouchableOpacity>
                    {open && (
                      <View className="px-3 pb-3">
                        <BirdRows birds={d.birds ?? []} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null
        }
      />

      <Sheet
        open={!!picked}
        onClose={() => setPicked(null)}
        title={
          picked
            ? `${[picked?.breeder?.firstName, picked?.breeder?.lastName].filter(Boolean).join(" ") || "Breeder"} · ${picked?.loft ?? ""}`
            : ""
        }
      >
        <Text className="font-semibold text-gray-800 mb-2">Birds ({picked?.items?.length ?? 0})</Text>
        <BirdRows birds={(picked?.items ?? []).map((i: any) => i.bird).filter(Boolean)} />
      </Sheet>
    </>
  );
}

// ── Birds ───────────────────────────────────────────────────────────────────

const EXPORT_FORMATS = [
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "csv", label: "CSV (.csv)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "html", label: "Web Page (.html)" },
] as const;

export function BirdsTab({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data: items, loading, error } = useLoad<any[]>(
    `/breeder/event/${eventId}/inventory-items`,
    (d) => d.eventInventoryItems ?? [],
    []
  );
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<any | null>(null);
  const [loftOpen, setLoftOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const isMine = (item: any) =>
    !!user?.id && String(item?.eventInventory?.breeder?.userId) === String(user.id);

  const myBirds = useMemo(() => items.filter(isMine), [items, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const others = items.filter((i) => !isMine(i));
    const q = query.trim().toLowerCase();
    return [...myBirds, ...others].filter((i) => {
      if (!q) return true;
      const b = i?.eventInventory?.breeder;
      return (
        String(i?.bird?.birdName ?? "").toLowerCase().includes(q) ||
        bandOf(i?.bird).toLowerCase().includes(q) ||
        `${b?.firstName ?? ""} ${b?.lastName ?? ""}`.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, myBirds, query]);

  const runExport = async (kind: "results" | "baskets", fmt: string) => {
    const key = `${kind}-${fmt}`;
    setExporting(key);
    const result = await downloadAndShare(
      `/breeder/export/${kind}?format=${fmt}&eventId=${eventId}`,
      `${kind}-event-${eventId}.${fmt}`
    );
    setExporting(null);
    if (!result.ok) toast.error(result.problem ?? "Export failed");
    else setExportOpen(false);
  };

  // The newest race this bird actually came home from.
  const latestArrived = (item: any) => {
    const arrived = (item?.raceItems ?? []).filter(
      (ri: any) => ri.status === "ARRIVED" && ri.result?.arrivalTime
    );
    if (arrived.length === 0) return null;
    return arrived.reduce((latest: any, ri: any) =>
      new Date(ri.result.arrivalTime).getTime() > new Date(latest.result.arrivalTime).getTime() ? ri : latest
    );
  };

  if (loading) return <Loading />;
  if (error) return <Problem text={error} />;

  const latest = picked ? latestArrived(picked) : null;

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="mb-2">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-base font-bold text-gray-900">Registered Birds ({items.length})</Text>
              <View className="flex-row" style={{ gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setExportOpen(true)}
                  className="flex-row items-center border border-gray-300 rounded-lg px-3 py-1.5"
                >
                  <Ionicons name="download-outline" size={14} color="#374151" />
                  <Text className="text-gray-700 text-xs font-semibold ml-1">Export</Text>
                </TouchableOpacity>
                {myBirds.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setLoftOpen(true)}
                    className="flex-row items-center border border-primary rounded-lg px-3 py-1.5"
                  >
                    <Ionicons name="person-outline" size={14} color={PRIMARY} />
                    <Text className="text-primary text-xs font-semibold ml-1">My Loft</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search bird, band or breeder…"
              placeholderTextColor="#9ca3af"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-black"
            />
          </View>
        }
        renderItem={({ item }) => {
          const b = item?.eventInventory?.breeder;
          const mine = isMine(item);
          return (
            <TouchableOpacity onPress={() => setPicked(item)} className="py-3 border-b border-gray-100 flex-row items-center">
              <View className="flex-1">
                <Text className={`text-sm text-cyan-700 ${mine ? "font-bold" : "font-medium"}`}>
                  {item?.bird?.birdName || "-"}
                </Text>
                <Text className="text-xs text-gray-500 font-mono">{bandOf(item?.bird) || "No band"}</Text>
              </View>
              <View className="items-end">
                <View className="flex-row items-center">
                  <Text className={`text-xs text-gray-800 ${mine ? "font-bold" : ""}`}>
                    {[b?.firstName, b?.lastName].filter(Boolean).join(" ") || "-"}
                  </Text>
                  {mine && (
                    <View className="bg-primary rounded-full px-2 py-0.5 ml-1">
                      <Text className="text-white text-[10px]">You</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-gray-500">{item?.eventInventory?.loft || "-"}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Empty icon="egg-outline" text="No birds registered yet." />}
      />

      <Sheet open={!!picked} onClose={() => setPicked(null)} title="Bird Details">
        {picked?.bird?.image ? (
          <Image
            source={{ uri: picked.bird.image }}
            style={{ width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: "#f3f4f6" }}
            contentFit="cover"
          />
        ) : (
          <View style={{ width: "100%", height: 160, borderRadius: 12, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="egg-outline" size={48} color="#9ca3af" />
          </View>
        )}
        <Text className="text-xl font-bold mt-3">{picked?.bird?.birdName || "Unnamed Bird"}</Text>
        <Text className="text-sm text-gray-500 font-mono">{bandOf(picked?.bird) || "No band"}</Text>
        <View className="border-t border-gray-200 mt-3 pt-3">
          <Text className="text-[11px] uppercase text-gray-500 mb-1">Latest Race</Text>
          {latest ? (
            <Text className="text-sm">
              {latest.result?.birdPosition ? `Position #${latest.result.birdPosition}` : "Arrived"}
              {latest.race?.name ? ` — ${latest.race.name}` : ""}
            </Text>
          ) : (
            <Text className="text-sm text-gray-500">No race results yet</Text>
          )}
        </View>
      </Sheet>

      <Sheet open={loftOpen} onClose={() => setLoftOpen(false)} title={`My Loft · ${myBirds[0]?.eventInventory?.loft ?? ""}`}>
        <Text className="font-semibold text-gray-800 mb-2">Birds ({myBirds.length})</Text>
        <BirdRows birds={myBirds.map((i) => i.bird).filter(Boolean)} />
      </Sheet>

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title="Export">
        {(["results", "baskets"] as const).map((kind) => (
          <View key={kind} className="mb-4">
            <Text className="font-semibold text-gray-800 mb-2">
              {kind === "results" ? "Race Results" : "Baskets"}
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {EXPORT_FORMATS.map((f) => {
                const key = `${kind}-${f.format}`;
                return (
                  <TouchableOpacity
                    key={key}
                    disabled={exporting !== null}
                    onPress={() => runExport(kind, f.format)}
                    className="border border-gray-300 rounded-lg px-3 py-2"
                  >
                    {exporting === key ? (
                      <ActivityIndicator size="small" color={PRIMARY} />
                    ) : (
                      <Text className="text-sm text-gray-700">{f.label}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        <Text className="text-xs text-gray-500">Exports cover your own birds in this event.</Text>
      </Sheet>
    </>
  );
}

// ── Result ──────────────────────────────────────────────────────────────────

function isTraining(race: any): boolean {
  const n = String(race?.raceType?.name ?? "").toUpperCase();
  return n === "T" || n === "TRAINING";
}

function RaceCard({ race }: { race: any }) {
  return (
    <TouchableOpacity
      className="border border-gray-200 rounded-xl p-4 mb-3"
      onPress={() => router.push(raceRoute(race) as any)}
    >
      <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
        <Text className="font-semibold text-gray-900 text-base" numberOfLines={1}>
          {race.description ?? race.name ?? "Race"}
        </Text>
        {isLiveRace(race) && (
          <View className="bg-red-500 rounded-full px-2 py-0.5">
            <Text className="text-white text-[10px] font-bold">LIVE</Text>
          </View>
        )}
        {race.status === "ENDED" && (
          <View className="bg-gray-200 rounded-full px-2 py-0.5">
            <Text className="text-gray-700 text-[10px]">Ended</Text>
          </View>
        )}
        {race.raceType?.name ? (
          <View className="border border-gray-300 rounded-full px-2 py-0.5">
            <Text className="text-gray-600 text-[10px]">{race.raceType.name}</Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row flex-wrap mt-2" style={{ gap: 12 }}>
        {race.startTime ? (
          <Text className="text-xs text-gray-500">{race.startTime ? format(new Date(race.startTime), "MMM dd, yyyy HH:mm") : "-"}</Text>
        ) : null}
        {race.location ? <Text className="text-xs text-gray-500">{race.location}</Text> : null}
        {race.distance != null ? <Text className="text-xs text-gray-500">{race.distance} mi</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function ResultTab({ eventId, races }: { eventId: string; races: any[] }) {
  const [sub, setSub] = useState<"races" | "training" | "average">("races");
  const training = useMemo(() => races.filter(isTraining), [races]);
  const competition = useMemo(() => races.filter((r) => !isTraining(r)), [races]);
  const shown = sub === "races" ? competition : training;

  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row px-3 pt-3" style={{ gap: 8 }}>
        {(
          [
            ["races", `Races (${competition.length})`],
            ["training", `Training (${training.length})`],
            ["average", "Average"],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setSub(key)}
            className={`px-3 py-1.5 rounded-full border ${sub === key ? "bg-primary border-primary" : "border-gray-300"}`}
          >
            <Text className={`text-xs font-semibold ${sub === key ? "text-white" : "text-gray-600"}`}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {sub === "average" ? (
        <AveragesList eventId={eventId} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          renderItem={({ item }) => <RaceCard race={item} />}
          ListEmptyComponent={<Empty icon="flag-outline" text="No races in this category." />}
        />
      )}
    </View>
  );
}

function AveragesList({ eventId }: { eventId: string }) {
  const { data: configs, loading, error } = useLoad<any[]>(
    `/breeder/event/${eventId}/averages`,
    (d) => (Array.isArray(d) ? d : []),
    []
  );
  if (loading) return <Loading />;
  if (error) return <Problem text="Could not load averages." />;
  return (
    <FlatList
      data={configs}
      keyExtractor={(c) => String(c.id)}
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      renderItem={({ item }) => (
        <TouchableOpacity
          className="border border-gray-200 rounded-xl p-4 mb-3 flex-row justify-between items-center"
          onPress={() =>
            router.push({
              pathname: "/averages-detail",
              params: { avgId: String(item.id), eventId, name: item.name },
            })
          }
        >
          <View>
            <Text className="font-semibold text-gray-900">{item.name}</Text>
            {item.filterMode ? <Text className="text-xs text-gray-500 mt-0.5">{item.filterMode}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Empty icon="stats-chart-outline" text="No public averages configured." />}
    />
  );
}

// ── Stations ────────────────────────────────────────────────────────────────

const TYPE_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d"];

/** The organiser's colour for a race type when there is one, else a stable pick. */
function typeColor(raceTypeId: number, color?: string | null): string {
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) return color;
  return TYPE_COLORS[Math.abs(raceTypeId) % TYPE_COLORS.length];
}

export function StationsTab({ eventId, event }: { eventId: string; event: any }) {
  const { data: stations, loading, error } = useLoad<any[]>(
    `/breeder/event/${eventId}/stations`,
    (d) => d.stations ?? [],
    []
  );
  const [query, setQuery] = useState("");
  const [typeTab, setTypeTab] = useState<"all" | "untyped" | number>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const present = useMemo(() => {
    const map = new Map<number, { id: number; name: string; color: string }>();
    let hasUntyped = false;
    for (const s of stations) {
      const types: any[] = s.stationRaceTypes ?? [];
      if (types.length === 0) {
        hasUntyped = true;
        continue;
      }
      for (const srt of types) {
        if (!map.has(srt.raceTypeId)) {
          map.set(srt.raceTypeId, {
            id: srt.raceTypeId,
            name: srt.raceType?.name ?? `Type ${srt.raceTypeId}`,
            color: typeColor(srt.raceTypeId, srt.raceType?.color),
          });
        }
      }
    }
    return { types: [...map.values()], hasUntyped };
  }, [stations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations.filter((s) => {
      const types: any[] = s.stationRaceTypes ?? [];
      if (typeTab === "untyped" && types.length > 0) return false;
      if (typeof typeTab === "number" && !types.some((t) => t.raceTypeId === typeTab)) return false;
      return !q || String(s.name ?? "").toLowerCase().includes(q);
    });
  }, [stations, query, typeTab]);

  if (loading) return <Loading />;
  if (error) return <Problem text="Failed to load stations." />;
  if (stations.length === 0) {
    return <Empty icon="location-outline" text="No release stations listed for this event." />;
  }

  const mappable = filtered.filter((s) => s.latitude != null && s.longitude != null);
  const base =
    event?.latitude != null && event?.longitude != null
      ? { latitude: event.latitude as number, longitude: event.longitude as number }
      : null;
  const centre = mappable.find((s) => s.id === selectedId) ?? mappable[0];
  const start = centre
    ? { latitude: centre.latitude as number, longitude: centre.longitude as number }
    : base;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-base font-bold text-gray-900">Release Station Map</Text>
          <Text className="text-xs text-gray-500">{stations.length} stations available</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/event-stations", params: { eventId } } as any)}
          className="border border-primary rounded-lg px-3 py-1.5"
        >
          <Text className="text-primary text-xs font-semibold">Coordinates</Text>
        </TouchableOpacity>
      </View>

      {start && !MAPS_AVAILABLE ? (
        <View className="mt-3">
          <MapUnavailable height={280} />
        </View>
      ) : start ? (
        <View className="overflow-hidden rounded-xl border border-slate-200 mt-3" style={{ height: 280 }}>
          <MapView
            // Re-centre when a different station is picked from the list.
            key={`map-${selectedId ?? "all"}`}
            style={{ flex: 1 }}
            mapType="none"
            maxZoomLevel={17}
            initialRegion={{ ...start, latitudeDelta: selectedId ? 0.5 : 4, longitudeDelta: selectedId ? 0.5 : 4 }}
          >
            <UrlTile
              urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maximumZ={17}
              shouldReplaceMapContent
              zIndex={-1}
            />
            {base ? (
              <Marker coordinate={base} title={event?.name ?? "Event"} description="Loft" pinColor="#059669" />
            ) : null}
            {mappable.map((s) => {
              const first = s.stationRaceTypes?.[0];
              return (
                <Marker
                  key={s.id}
                  coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                  title={s.name}
                  description={s.miles != null ? `${Number(s.miles).toFixed(2)} MI` : undefined}
                  pinColor={first ? typeColor(first.raceTypeId, first.raceType?.color) : "#64748b"}
                  onPress={() => setSelectedId(s.id)}
                />
              );
            })}
          </MapView>
        </View>
      ) : (
        <View className="items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-6 mt-3" style={{ height: 120 }}>
          <Text className="text-center text-sm text-slate-500">
            None of these stations has coordinates, so there is nothing to map.
          </Text>
        </View>
      )}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search stations..."
        placeholderTextColor="#9ca3af"
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-black mt-3"
      />

      {(present.types.length > 0 || present.hasUntyped) && (
        <View className="flex-row flex-wrap mt-2" style={{ gap: 6 }}>
          <TouchableOpacity
            onPress={() => setTypeTab("all")}
            className={`px-3 py-1 rounded border ${typeTab === "all" ? "bg-primary border-primary" : "border-gray-300"}`}
          >
            <Text className={`text-xs ${typeTab === "all" ? "text-white" : "text-gray-700"}`}>All</Text>
          </TouchableOpacity>
          {present.types.map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTypeTab(t.id)}
              className="px-3 py-1 rounded border flex-row items-center"
              style={{
                borderColor: typeTab === t.id ? t.color : "#d1d5db",
                backgroundColor: typeTab === t.id ? t.color : "transparent",
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: typeTab === t.id ? "#fff" : t.color, marginRight: 6 }} />
              <Text className={`text-xs ${typeTab === t.id ? "text-white" : "text-gray-700"}`}>{t.name}</Text>
            </TouchableOpacity>
          ))}
          {present.hasUntyped && (
            <TouchableOpacity
              onPress={() => setTypeTab("untyped")}
              className={`px-3 py-1 rounded border ${typeTab === "untyped" ? "bg-primary border-primary" : "border-gray-300"}`}
            >
              <Text className={`text-xs ${typeTab === "untyped" ? "text-white" : "text-gray-700"}`}>Untyped</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View className="border border-gray-200 rounded-xl mt-3 overflow-hidden">
        {filtered.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
            className={`px-3 py-3 border-b border-gray-100 ${selectedId === s.id ? "bg-cyan-50" : ""}`}
          >
            <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
              <Text className="font-medium text-gray-900">{s.name}</Text>
              {(s.stationRaceTypes ?? []).map((srt: any) => (
                <View
                  key={srt.raceTypeId}
                  style={{ backgroundColor: typeColor(srt.raceTypeId, srt.raceType?.color), borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>
                    {srt.raceType?.name ?? `Type ${srt.raceTypeId}`}
                  </Text>
                </View>
              ))}
              {s.isActive ? (
                <View className="bg-primary rounded-full px-2 py-0.5">
                  <Text className="text-white text-[10px]">active</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-gray-500 mt-1">
              {s.miles != null ? `${Number(s.miles).toFixed(2)} MI` : "— MI"}
            </Text>
          </TouchableOpacity>
        ))}
        <Text className="text-xs text-gray-500 p-2">
          Showing {filtered.length} of {stations.length} stations
        </Text>
      </View>

      <Text className="text-xs text-gray-500 mt-3">
        GPS coordinates are informational. Contact handler to verify actual release point.
      </Text>
    </ScrollView>
  );
}

// ── Messages ────────────────────────────────────────────────────────────────

const VIDEO_RE = /\.(mp4|webm|ogg|mov)$/i;

export function MessageCard({ message, eventLabel }: { message: any; eventLabel?: string }) {
  const author = [message?.author?.name, message?.author?.lastName].filter(Boolean).join(" ") || "Unknown";
  const media: string[] = message?.mediaUrls ?? [];
  return (
    <View className="border border-gray-200 rounded-xl mb-3 overflow-hidden bg-white">
      <View className="flex-row items-center bg-gray-50 border-b border-gray-200 px-3 py-3">
        {message?.author?.image ? (
          <Image source={{ uri: message.author.image }} style={{ width: 36, height: 36, borderRadius: 18 }} />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#e0f2fe", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: PRIMARY, fontWeight: "700" }}>{author[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        <View className="flex-1 ml-3">
          {message?.title ? (
            <Text className="font-bold text-gray-900" numberOfLines={2}>
              {message.title}
            </Text>
          ) : null}
          <Text className="text-xs text-gray-500">
            {eventLabel ? `${eventLabel} · ` : ""}
            {author}
            {message?.createdAt ? ` · ${format(new Date(message.createdAt), "MMM dd, yyyy HH:mm")}` : ""}
          </Text>
        </View>
      </View>
      <View className="p-3">
        <Text className="text-sm text-gray-700" style={{ lineHeight: 20 }}>
          {htmlToText(message?.body)}
        </Text>
        {media.length > 0 && (
          <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
            {media.map((url, i) =>
              VIDEO_RE.test(url) ? (
                <TouchableOpacity
                  key={i}
                  onPress={() => Linking.openURL(url)}
                  style={{ width: "48%", aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="play-circle" size={40} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 11, marginTop: 2 }}>Play video</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity key={i} onPress={() => Linking.openURL(url)} style={{ width: "48%" }}>
                  <Image
                    source={{ uri: url }}
                    style={{ width: "100%", aspectRatio: 1, borderRadius: 8, backgroundColor: "#f3f4f6" }}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export function MessagesTab({ eventId }: { eventId: string }) {
  const { data: messages, loading, error } = useLoad<any[]>(
    `/breeder/event/${eventId}/messages`,
    (d) => d.messages ?? [],
    []
  );
  if (loading) return <Loading />;
  if (error) return <Problem text={error} />;
  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => String(m.id)}
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      renderItem={({ item }) => <MessageCard message={item} />}
      ListEmptyComponent={<Empty icon="chatbubble-ellipses-outline" text="No messages yet." />}
    />
  );
}

// ── History ─────────────────────────────────────────────────────────────────

function seasonLabel(race: any): string {
  if (typeof race?.season === "string" && race.season.trim()) return race.season.trim();
  if (race?.startTime) return `YB${String(new Date(race.startTime).getFullYear()).slice(2)}`;
  return "Unknown";
}

export function HistoryTab({ eventId }: { eventId: string }) {
  const { data: races, loading, error } = useLoad<any[]>(
    `/breeder/event/${eventId}/history`,
    (d) => d.races ?? [],
    []
  );

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of races) {
      const key = seasonLabel(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (a.startTime ? new Date(a.startTime).getTime() : 0) -
          (b.startTime ? new Date(b.startTime).getTime() : 0)
      );
    }
    return Array.from(map.entries());
  }, [races]);

  if (loading) return <Loading />;
  if (error) return <Problem text="Failed to load history." />;
  if (grouped.length === 0) return <Empty icon="time-outline" text="No races recorded yet for this event." />;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-base font-bold text-gray-900">List Archived Races</Text>
        <View className="flex-row" style={{ gap: 6 }}>
          <TouchableOpacity
            onPress={() => router.push("/race-calendar" as any)}
            className="border border-gray-300 rounded-lg px-3 py-1.5"
          >
            <Text className="text-gray-700 text-xs font-semibold">Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/event-archive", params: { eventId } } as any)}
            className="border border-primary rounded-lg px-3 py-1.5"
          >
            <Text className="text-primary text-xs font-semibold">All seasons</Text>
          </TouchableOpacity>
        </View>
      </View>
      {grouped.map(([season, list]) => (
        <View key={season} className="border border-gray-200 rounded-xl mb-4 overflow-hidden">
          <View className="bg-gray-100 px-3 py-2">
            <Text className="font-bold text-gray-800">Year: {season}</Text>
          </View>
          {list.map((r, i) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => router.push(raceRoute(r) as any)}
              className="flex-row px-3 py-3 border-t border-gray-100 items-center"
            >
              <Text className="w-6 text-xs text-gray-500">{i + 1}</Text>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-900">{r.description ?? r.name ?? "-"}</Text>
                <Text className="text-xs text-gray-500">
                  {r.startTime ? format(new Date(r.startTime), "yyyy-MM-dd HH:mm:ss") : "-"}
                </Text>
                <Text className="text-xs text-gray-500">
                  {r.location ?? "-"} · {r.distance ?? "-"} mi · {r.raceType?.name ?? "-"}
                </Text>
              </View>
              <Text className="text-xs text-cyan-700 font-semibold">Results</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
