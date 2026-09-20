import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { CsvImportSheet } from "@/components/admin/CsvImportSheet";
import { downloadAndShare } from "@/service/download.service";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow } from "@/components/admin/ui";
import { useResponsive } from "@/hooks/useResponsive";

interface Breeder {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  cell: string | null;
  city1: string | null;
  state1: string | null;
  country: string | null;
  number: number | null;
  note: string | null;
}

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: string | null;
  rfid: string | null;
}

/**
 * The breeder directory.
 *
 * There are over a thousand of these, so the list is a search box with results
 * under it rather than a list with a search box on top: scrolling a thousand
 * names on a phone is not a way anyone finds a person. Nothing renders until
 * the search narrows it, except a first page so the screen is not blank.
 *
 * Tapping a name opens their birds and their contact details, which is what the
 * phone is usually out for — calling somebody about a bird.
 */
export default function AdminBreeders() {
  const { can } = usePermissions();
  const { isWide, gutter } = useResponsive();

  const [breeders, setBreeders] = useState<Breeder[]>([]);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const [open, setOpen] = useState<Breeder | null>(null);
  const [birds, setBirds] = useState<Bird[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get("/admin/breeders");
      setBreeders(data?.breeders ?? []);
    } catch {
      setError("Could not load the breeder list.");
      setBreeders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openBreeder = async (breeder: Breeder) => {
    setOpen(breeder);
    setBirds(null);
    try {
      const { data } = await api.get(`/admin/breeders/${breeder.id}/birds`);
      setBirds(data?.birds ?? []);
    } catch {
      setBirds([]);
    }
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? breeders.filter((b) => {
          const name = `${b.firstName ?? ""} ${b.lastName ?? ""}`.toLowerCase();
          return (
            name.includes(q) ||
            (b.email ?? "").toLowerCase().includes(q) ||
            (b.phone ?? "").includes(q) ||
            (b.cell ?? "").includes(q) ||
            String(b.number ?? "").includes(q) ||
            (b.city1 ?? "").toLowerCase().includes(q)
          );
        })
      : breeders;
    return { matching, shown: matching.slice(0, 80) };
  }, [breeders, query]);

  if (!can("breeders.view") && !can("breeders.manage")) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Ionicons name="lock-closed-outline" size={28} color="#94a3b8" />
        <Text className="mt-3 text-center text-sm text-slate-500">
          Breeder records are not part of your access.
        </Text>
      </View>
    );
  }

  if (open) {
    const name = `${open.firstName ?? ""} ${open.lastName ?? ""}`.trim() || `Breeder ${open.id}`;
    const phone = open.cell || open.phone;
    return (
      <ScrollView style={{ padding: gutter }}>
        <Pressable
          onPress={() => {
            setOpen(null);
            setBirds(null);
          }}
          className="mb-3 flex-row items-center gap-1"
        >
          <Ionicons name="chevron-back" size={16} color="#2563eb" />
          <Text className="text-sm font-medium text-blue-600">Breeders</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-slate-900">{name}</Text>
        <Text className="mt-1 text-sm text-slate-500">
          {[open.city1, open.state1, open.country].filter(Boolean).join(", ") ||
            "No address on file"}
          {open.number != null ? ` · #${open.number}` : ""}
        </Text>

        <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
          {phone && (
            <Pressable
              onPress={() => Linking.openURL(`tel:${phone}`)}
              className="flex-row items-center gap-2 rounded-xl bg-blue-600 px-4 py-3"
              style={{ flexGrow: 1, flexBasis: "47%" }}
            >
              <Ionicons name="call-outline" size={16} color="#fff" />
              <Text className="text-sm font-medium text-white">{phone}</Text>
            </Pressable>
          )}
          {open.email && (
            <Pressable
              onPress={() => Linking.openURL(`mailto:${open.email}`)}
              className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
              style={{ flexGrow: 1, flexBasis: "47%" }}
            >
              <Ionicons name="mail-outline" size={16} color="#334155" />
              <Text className="flex-1 text-sm text-slate-700" numberOfLines={1}>
                {open.email}
              </Text>
            </Pressable>
          )}
        </View>

        {open.note && (
          <View className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Note
            </Text>
            <Text className="mt-1 text-sm text-slate-700">{open.note}</Text>
          </View>
        )}

        <Text className="mb-2 mt-6 text-base font-semibold text-slate-900">
          Birds {birds ? `(${birds.length})` : ""}
        </Text>

        {birds === null ? (
          <ActivityIndicator />
        ) : birds.length === 0 ? (
          <View className="rounded-xl border border-slate-200 bg-white p-8">
            <Text className="text-center text-sm text-slate-500">
              No birds on record for this breeder.
            </Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {birds.slice(0, 150).map((bird, index) => (
              <View
                key={bird.id}
                className={`flex-row items-center gap-3 px-4 py-3 ${
                  index > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-900">
                    {bird.band ?? "No band"}
                    {bird.birdName ? ` · ${bird.birdName}` : ""}
                  </Text>
                  <Text className="text-xs text-slate-500">
                    {[bird.color, bird.sex].filter(Boolean).join(" · ") || "No details"}
                  </Text>
                </View>
                {bird.rfid ? (
                  <Ionicons name="radio-outline" size={16} color="#059669" />
                ) : (
                  <Text className="text-[10px] text-slate-400">no tag</Text>
                )}
              </View>
            ))}
            {birds.length > 150 && (
              <Text className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-400">
                Showing the first 150 of {birds.length}.
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">Breeders</Text>
      <Text className="mt-1 text-sm text-slate-500">
        {breeders.length.toLocaleString()} on record
      </Text>

      <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
        <Ionicons name="search" size={16} color="#94a3b8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name, email, phone, number or city"
          placeholderTextColor="#94a3b8"
          autoCorrect={false}
          className="flex-1 py-2.5 text-sm text-slate-900"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {can("breeders.manage") ? (
        <ButtonRow>
          <Button
            label="Import CSV"
            tone="secondary"
            icon="cloud-upload-outline"
            onPress={() => setImporting(true)}
            full
          />
          <Button
            label="Export"
            tone="secondary"
            icon="download-outline"
            pending={exporting}
            onPress={async () => {
              setExporting(true);
              const stamp = new Date().toISOString().slice(0, 10);
              const res = await downloadAndShare(
                "/admin/breeders/export",
                `breeders-${stamp}.csv`
              );
              setExporting(false);
              if (!res.ok && res.problem) toast.error(res.problem);
            }}
            full
          />
        </ButtonRow>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView
          className="mt-3 flex-1"
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
          {error && (
            <View className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-800">{error}</Text>
            </View>
          )}

          {results.shown.length === 0 ? (
            <View className="rounded-xl border border-slate-200 bg-white p-8">
              <Text className="text-center text-sm text-slate-500">
                No breeder matches that search.
              </Text>
            </View>
          ) : (
            <View className={isWide ? "flex-row flex-wrap" : ""} style={{ gap: isWide ? 10 : 0 }}>
              {isWide ? (
                results.shown.map((breeder) => (
                  <Pressable
                    key={breeder.id}
                    onPress={() => openBreeder(breeder)}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    style={{ flexGrow: 1, flexBasis: "31%" }}
                  >
                    <Text className="font-medium text-slate-900">
                      {`${breeder.firstName ?? ""} ${breeder.lastName ?? ""}`.trim() ||
                        `Breeder ${breeder.id}`}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                      {breeder.email || breeder.cell || breeder.phone || "No contact on file"}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {results.shown.map((breeder, index) => (
                    <Pressable
                      key={breeder.id}
                      onPress={() => openBreeder(breeder)}
                      className={`flex-row items-center gap-3 px-4 py-3 ${
                        index > 0 ? "border-t border-slate-100" : ""
                      }`}
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-slate-900">
                          {`${breeder.firstName ?? ""} ${breeder.lastName ?? ""}`.trim() ||
                            `Breeder ${breeder.id}`}
                        </Text>
                        <Text className="text-xs text-slate-500" numberOfLines={1}>
                          {[breeder.city1, breeder.state1].filter(Boolean).join(", ") ||
                            breeder.email ||
                            "No details"}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {results.matching.length > results.shown.length && (
            <Text className="mt-3 text-center text-xs text-slate-400">
              Showing {results.shown.length} of {results.matching.length.toLocaleString()} matches
              — narrow the search to see the rest.
            </Text>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <CsvImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        onImported={load}
        title="Import breeders"
        previewPath="/admin/breeders/import/preview"
        commitPath="/admin/breeders/import/commit"
        describe={(row) => ({
          title:
            `${(row.firstName as string) ?? ""} ${(row.lastName as string) ?? ""}`.trim() ||
            "Unnamed",
          subtitle:
            [row.email as string, row.city1 as string].filter(Boolean).join(" · ") || undefined,
        })}
      />
    </View>
  );
}
