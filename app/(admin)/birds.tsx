import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  Truncated,
} from "@/components/admin/ui";

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
  isLost: number | null;
  breeder?: { firstName: string | null; lastName: string | null } | null;
}

/**
 * Every bird on record, across all events.
 *
 * This is a lookup, not a list — there are tens of thousands, and nobody reads
 * them. So nothing renders until the search narrows it, beyond a first page to
 * prove the screen works. The question it answers is "whose bird is this band
 * number", asked by somebody holding a bird that should not be where it is.
 */
export default function AdminBirds() {
  const { can } = usePermissions();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    birds?: Bird[];
  }>("/admin/birds");

  const birds = data?.birds ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return birds;
    return birds.filter((b) => {
      const who = `${b.breeder?.firstName ?? ""} ${b.breeder?.lastName ?? ""}`.toLowerCase();
      return (
        (b.band ?? "").toLowerCase().includes(q) ||
        (b.birdName ?? "").toLowerCase().includes(q) ||
        (b.rfid ?? "").toLowerCase().includes(q) ||
        who.includes(q)
      );
    });
  }, [birds, query]);

  if (forbidden || (!can("birds.view") && !can("birds.manage"))) {
    return <NoAccess what="Bird records" />;
  }

  return (
    <Screen
      title="Birds"
      subtitle={`${birds.length.toLocaleString()} on record`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={<SearchBar value={query} onChange={setQuery} placeholder="Band, tag, name or breeder" />}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4">
            {results.length === 0 ? (
              <Empty>No bird matches that search.</Empty>
            ) : (
              <Rows>
                {results.slice(0, 100).map((b) => {
                  const who =
                    `${b.breeder?.firstName ?? ""} ${b.breeder?.lastName ?? ""}`.trim();
                  return (
                    <Row
                      key={b.id}
                      title={`${b.band ?? "No band"}${b.birdName ? ` · ${b.birdName}` : ""}`}
                      subtitle={[who, b.color].filter(Boolean).join(" · ") || undefined}
                      leading={
                        <Ionicons
                          name={b.rfid ? "radio" : "radio-outline"}
                          size={16}
                          color={b.rfid ? "#059669" : "#cbd5e1"}
                        />
                      }
                      badge={
                        b.isLost === 1
                          ? { label: "lost", bg: "bg-rose-100", text: "text-rose-700" }
                          : null
                      }
                      onPress={() => router.push(`/(admin)/bird-detail?birdId=${b.id}` as never)}
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated shown={Math.min(results.length, 100)} total={results.length} />
          </View>
        </>
      )}
    </Screen>
  );
}
