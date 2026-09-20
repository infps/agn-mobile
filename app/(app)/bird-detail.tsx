import Header from "@/components/header";
import api from "@/service/api.service";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Relative {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
}

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
  isLost: number | null;
  note: string | null;
  healthStatus: string | null;
  breeder?: { firstName: string | null; lastName: string | null } | null;
  father?: Relative | null;
  mother?: Relative | null;
  childrenAsFather?: Relative[];
  childrenAsMother?: Relative[];
  siblings?: Relative[];
}

const SEX = (n: number | null) => (n === 1 ? "Cock" : n === 2 ? "Hen" : "Unknown");

/**
 * One bird, with its pedigree.
 *
 * This was a form of empty inputs with a pencil icon that saved nothing — it
 * looked like an editor and was a picture of one. It now loads the real bird
 * and shows what a breeder actually looks up: the identifying details and the
 * family around it, since pedigree is most of why anybody opens a bird at all.
 *
 * Editing stays in the portal. A row of text inputs that quietly discard what
 * you type is worse than no inputs.
 */
/**
 * Two pieces the bird page repeats.
 *
 * At module scope rather than inside the screen: components declared during
 * render are a new type each time, so every fact and every relative row was
 * discarded and rebuilt on each render of the page.
 */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 py-2 pr-3">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900">{value}</Text>
    </View>
  );
}

function Relatives({
  title,
  list,
  router,
}: {
  title: string;
  list: Relative[];
  router: ReturnType<typeof useRouter>;
}) {
  if (list.length === 0) return null;
  return (
    <View className="mt-4">
      <Text className="mb-2 text-sm font-semibold text-gray-900">{title}</Text>
      <View className="overflow-hidden rounded-xl border border-gray-200">
        {list.map((r, index) => (
          <Pressable
            key={r.id}
            onPress={() =>
              router.push({ pathname: "/bird-detail", params: { birdId: String(r.id) } })
            }
            className={`flex-row items-center gap-3 px-4 py-3 ${
              index > 0 ? "border-t border-gray-100" : ""
            }`}
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-900">
                {r.band ?? "No band"}
                {r.birdName ? ` · ${r.birdName}` : ""}
              </Text>
              {r.color ? <Text className="text-xs text-gray-500">{r.color}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export default function BirdDetail() {
  const { birdId, id } = useLocalSearchParams<{ birdId?: string; id?: string }>();
  const { gutter } = useResponsive();
  const router = useRouter();

  const key = birdId ?? id;

  const [bird, setBird] = useState<Bird | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!key) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data } = await api.get(`/breeder/birds/${key}`);
      setBird(data?.bird ?? null);
      setIsOwner(Boolean(data?.isOwner));
    } catch (err: any) {
      setError(
        err?.response?.status === 403
          ? "This bird's owner keeps it private."
          : err?.response?.status === 404
            ? "That bird could not be found."
            : "Could not load this bird just now."
      );
      setBird(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  const children = [
    ...(bird?.childrenAsFather ?? []),
    ...(bird?.childrenAsMother ?? []),
  ];

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Bird" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!bird) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Bird" />
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-center text-sm text-gray-500">
            {error ?? "That bird could not be found."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const owner = `${bird.breeder?.firstName ?? ""} ${bird.breeder?.lastName ?? ""}`.trim();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={bird.band ?? "Bird"} />

      <ScrollView
        style={{ paddingHorizontal: gutter }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View className="flex-row items-center gap-4 border-b border-gray-200 py-4">
          <Image
            source={require("../../assets/profile.png")}
            className="h-20 w-20 rounded-full"
          />
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900">
              {bird.birdName || bird.band || "Unnamed"}
            </Text>
            <Text className="text-sm text-gray-500">{bird.band ?? "No band"}</Text>
            {owner ? <Text className="text-xs text-gray-400">{owner}</Text> : null}
          </View>
        </View>

        {bird.isLost === 1 && (
          <View className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <Text className="text-sm text-rose-800">This bird is recorded as lost.</Text>
          </View>
        )}

        <View className="mt-2 flex-row flex-wrap">
          <Fact label="Colour" value={bird.color ?? "—"} />
          <Fact label="Sex" value={SEX(bird.sex)} />
          <Fact label="Tag" value={bird.rfid ?? "not tagged"} />
          <Fact
            label="Health"
            value={(bird.healthStatus ?? "healthy").toLowerCase()}
          />
        </View>

        {bird.note ? (
          <View className="mt-2 rounded-xl border border-gray-200 p-4">
            <Text className="text-xs text-gray-500">Note</Text>
            <Text className="mt-1 text-sm text-gray-700">{bird.note}</Text>
          </View>
        ) : null}

        <Relatives router={router}
          title="Parents"
          list={[bird.father, bird.mother].filter(Boolean) as Relative[]}
        />
        <Relatives router={router} title="Siblings" list={bird.siblings ?? []} />
        <Relatives router={router} title="Offspring" list={children} />

        {isOwner && (
          <Text className="mt-6 text-center text-xs text-gray-400">
            This is your bird. Details are edited in the web portal.
          </Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
