import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  Sheet,
} from "@/components/admin/ui";
import { COLORS, Chips, Label, SEXES, fullName, sexLabel } from "@/components/admin/birdParts";

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
  isActive: number | null;
  isLost: number | null;
  image: string | null;
  breeder?: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    user?: { loftName: string | null } | null;
  } | null;
  inventoryItems?: {
    id: number;
    eventInventory?: { season?: { event?: { id: number; name: string | null } | null } | null } | null;
  }[];
}

interface Page {
  birds?: Bird[];
  nextCursor?: number | null;
}

type Status = "all" | "active" | "lost";

const STATUSES: { key: Status; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "lost", label: "Lost" },
  { key: "all", label: "All" },
];

const NO_FILTERS = { band: "", color: "", sex: "", breederId: "", breederName: "" };

/**
 * Every bird on record, across all events.
 *
 * This is a lookup, not a list — there are tens of thousands, and nobody reads
 * them. The question it answers is "whose bird is this band number", asked by
 * somebody holding a bird that should not be where it is.
 *
 * So the searching is done by the server, not here. The register is served two
 * hundred at a time, and filtering only the page in hand would answer "no such
 * bird" about a bird that is simply on page nine. Every filter the portal's
 * table has — band, breeder, colour, sex, active or lost — is sent as the same
 * query parameter the portal sends, and "more" asks for the next page from
 * where the last one stopped.
 */
export default function AdminBirds() {
  const { canAny } = usePermissions();
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [filters, setFilters] = useState(NO_FILTERS);
  const [draft, setDraft] = useState(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [breederQuery, setBreederQuery] = useState("");

  // Typing should not send a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const path = useMemo(() => {
    const p: string[] = [];
    if (search) p.push(`search=${encodeURIComponent(search)}`);
    if (status !== "all") p.push(`status=${status}`);
    if (filters.band.trim()) p.push(`band=${encodeURIComponent(filters.band.trim())}`);
    if (filters.color) p.push(`color=${encodeURIComponent(filters.color)}`);
    if (filters.sex !== "") p.push(`sex=${filters.sex}`);
    if (filters.breederId) p.push(`breederId=${filters.breederId}`);
    return `/admin/birds${p.length ? `?${p.join("&")}` : ""}`;
  }, [search, status, filters]);

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<Page>(path);

  // Pages after the first, kept against the query they belong to so a changed
  // filter cannot be shown with the previous filter's tail attached.
  const [more, setMore] = useState<{ path: string; birds: Bird[]; next: number | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const tail = more && more.path === path ? more : null;

  const birds = useMemo(() => [...(data?.birds ?? []), ...(tail?.birds ?? [])], [data, tail]);
  const next = tail ? tail.next : data?.nextCursor ?? null;

  // Only while the filter sheet is open — the breeder list is long.
  const breedersReq = useAdminData<{
    breeders?: { id: number; firstName: string | null; lastName: string | null; email: string | null }[];
  }>(filtersOpen ? "/admin/breeders" : null, [filtersOpen]);

  const breederChoices: Choice[] = useMemo(() => {
    const q = breederQuery.trim().toLowerCase();
    const all = breedersReq.data?.breeders ?? [];
    const matched = q
      ? all.filter((b) => `${fullName(b)} ${b.email ?? ""}`.toLowerCase().includes(q))
      : all;
    return matched.slice(0, 30).map((b) => ({
      key: b.id,
      label: fullName(b) || b.email || `Breeder ${b.id}`,
      hint: b.email,
    }));
  }, [breedersReq.data, breederQuery]);

  if (forbidden || !canAny("birds.view", "birds.manage")) {
    return <NoAccess what="Bird records" />;
  }

  const loadMore = async () => {
    if (next == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get(`${path}${path.includes("?") ? "&" : "?"}cursor=${next}`);
      const page: Page = res.data ?? {};
      setMore({
        path,
        birds: [...(tail?.birds ?? []), ...(page.birds ?? [])],
        next: page.nextCursor ?? null,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Could not load more just now.");
    } finally {
      setLoadingMore(false);
    }
  };

  const active = [
    filters.band.trim() ? `band ${filters.band.trim()}` : null,
    filters.color || null,
    filters.sex !== "" ? sexLabel(Number(filters.sex)).toLowerCase() : null,
    filters.breederName || null,
  ].filter(Boolean) as string[];

  return (
    <Screen
      title="Birds"
      subtitle={
        loading
          ? null
          : `${birds.length.toLocaleString()}${next != null ? "+" : ""} ${
              status === "all" ? "on record" : status
            }`
      }
      onRefresh={() => {
        setMore(null);
        refresh();
      }}
      refreshing={refreshing}
      header={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Name, band, RFID or breeder" />
          <View className="mt-2 flex-row items-center" style={{ gap: 8 }}>
            <View className="flex-1 flex-row rounded-xl border border-slate-200 bg-white p-1">
              {STATUSES.map((s) => {
                const on = s.key === status;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setStatus(s.key)}
                    className={`flex-1 rounded-lg py-1.5 ${on ? "bg-blue-600" : ""}`}
                  >
                    <Text
                      className={`text-center text-xs font-medium ${on ? "text-white" : "text-slate-600"}`}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button
              label={active.length ? `Filters (${active.length})` : "Filters"}
              tone="secondary"
              icon="options-outline"
              onPress={() => {
                setDraft(filters);
                setBreederQuery("");
                setFiltersOpen(true);
              }}
            />
          </View>
          {active.length ? (
            <Text className="mt-2 text-xs text-slate-500">Only {active.join(" · ")}</Text>
          ) : null}
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4">
            {birds.length === 0 ? (
              <Empty>No bird matches that search.</Empty>
            ) : (
              <Rows>
                {birds.map((b) => {
                  const who = fullName(b.breeder);
                  const loft = b.breeder?.user?.loftName;
                  const lastEvent = b.inventoryItems?.[0]?.eventInventory?.season?.event?.name;
                  return (
                    <Row
                      key={b.id}
                      title={`${b.band ?? "No band"}${b.birdName ? ` · ${b.birdName}` : ""}`}
                      subtitle={
                        [who || null, loft, b.color, sexLabel(b.sex), lastEvent]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      leading={
                        b.image ? (
                          <Image
                            source={{ uri: b.image }}
                            style={{ width: 32, height: 32, borderRadius: 6 }}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons
                            name={b.rfid ? "radio" : "radio-outline"}
                            size={16}
                            color={b.rfid ? "#059669" : "#cbd5e1"}
                          />
                        )
                      }
                      badge={
                        b.isLost === 1
                          ? { label: "lost", bg: "bg-rose-100", text: "text-rose-700" }
                          : b.isActive === 1
                            ? null
                            : { label: "inactive", bg: "bg-slate-100", text: "text-slate-600" }
                      }
                      right={b.rfid ?? undefined}
                      rightTone="text-slate-400"
                      onPress={() => router.push(`/(admin)/bird-detail?birdId=${b.id}` as never)}
                    />
                  );
                })}
              </Rows>
            )}

            {next != null ? (
              <ButtonRow>
                <Button label="More" tone="secondary" onPress={loadMore} pending={loadingMore} full />
              </ButtonRow>
            ) : null}
          </View>
        </>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter birds"
        subtitle="Applied by the server, across the whole register"
      >
        <Field
          label="Band contains"
          value={draft.band}
          onChange={(v) => setDraft({ ...draft, band: v })}
          placeholder="AU-25-ABC-1234 or any part of it"
        />

        <Label>Sex</Label>
        <Chips
          options={[{ key: "", label: "Any" }, ...SEXES]}
          selected={draft.sex}
          onPick={(k) => setDraft({ ...draft, sex: k })}
        />

        <Label>Colour</Label>
        <Chips
          options={[{ key: "", label: "Any" }, ...COLORS.map((c) => ({ key: c, label: c }))]}
          selected={draft.color}
          onPick={(k) => setDraft({ ...draft, color: k })}
        />

        <Label>Breeder</Label>
        {draft.breederId ? (
          <Rows>
            <Row
              title={draft.breederName || `Breeder ${draft.breederId}`}
              right="clear"
              rightTone="text-blue-600"
              onPress={() => setDraft({ ...draft, breederId: "", breederName: "" })}
            />
          </Rows>
        ) : breedersReq.forbidden ? (
          <Text className="text-xs text-slate-400">The breeder list is not part of your access.</Text>
        ) : (
          <>
            <SearchBar value={breederQuery} onChange={setBreederQuery} placeholder="Search breeders" />
            {breedersReq.loading ? (
              <Loading />
            ) : breederQuery.trim() ? (
              <ChoiceList
                choices={breederChoices}
                onPick={(k) => {
                  const picked = breederChoices.find((c) => c.key === k);
                  setDraft({ ...draft, breederId: String(k), breederName: picked?.label ?? "" });
                }}
                empty="Nobody matches that."
              />
            ) : null}
          </>
        )}

        <ButtonRow>
          <Button
            label="Clear"
            tone="secondary"
            onPress={() => {
              setFilters(NO_FILTERS);
              setFiltersOpen(false);
            }}
            full
          />
          <Button
            label="Apply"
            onPress={() => {
              setFilters(draft);
              setFiltersOpen(false);
            }}
            full
          />
        </ButtonRow>
      </Sheet>
    </Screen>
  );
}
