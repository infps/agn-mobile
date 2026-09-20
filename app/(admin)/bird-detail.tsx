import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
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
  Screen,
  SearchBar,
  SectionTitle,
  Sheet,
  money,
} from "@/components/admin/ui";

interface RaceItem {
  id: number;
  race?: { id: number; name: string | null; raceNumber: number | null; startTime: string | null } | null;
  result?: { birdPosition: number | null; arrivalTime: string | null; prizeValue: number | null } | null;
}

interface InventoryItem {
  id: number;
  eventInventory?: {
    loft: string | null;
    season?: { name: string | null; event?: { name: string | null } | null } | null;
  } | null;
  raceItems?: RaceItem[];
}

interface Bird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
  rfid: string | null;
  isLost: number | null;
  healthStatus: string | null;
  healthNote: string | null;
  note: string | null;
  attention: string | null;
  breeder?: { firstName: string | null; lastName: string | null; city1: string | null; state1: string | null } | null;
  inventoryItems?: InventoryItem[];
}

const SEX = (n: number | null) => (n === 1 ? "Cock" : n === 2 ? "Hen" : n === 0 ? "Unknown" : "—");

/**
 * One bird, and everything that has happened to it.
 *
 * The portal spreads this across a detail page and a history tab. Here the
 * racing record is the page, because that is what the bird is *for* — the
 * identifying details are a short block above it rather than the main event.
 *
 * What can be changed here is what somebody actually learns while holding the
 * bird: its condition, and whose it is. Health is the common one — a bird comes
 * back injured and that has to be on the record before it is basketed again.
 *
 * The band number is deliberately not editable. It is the bird's identity, it
 * is already printed on its leg, and a typo made one-handed at a loft would
 * quietly detach every result the bird has ever earned. That stays in the
 * portal, where there is room to see what it is attached to.
 */
const HEALTH: { key: string; label: string; hint: string }[] = [
  { key: "HEALTHY", label: "Healthy", hint: "Fit to fly" },
  { key: "INJURED", label: "Injured", hint: "Back, but hurt" },
  { key: "HOSPITALIZED", label: "Hospitalised", hint: "Being treated, out of racing" },
  { key: "DEAD", label: "Dead", hint: "Recorded and taken out of the loft" },
];

export default function AdminBirdDetail() {
  const { birdId } = useLocalSearchParams<{ birdId?: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [healthOpen, setHealthOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [healthNote, setHealthNote] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [breederQuery, setBreederQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState({ birdName: "", color: "", rfid: "", note: "" });

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    bird?: Bird;
  }>(birdId ? `/admin/bird/${birdId}` : null, [birdId]);

  // Only while a transfer is being chosen — the breeder list is long.
  const breedersReq = useAdminData<{
    breeders?: { id: number; firstName: string | null; lastName: string | null; email: string | null }[];
  }>(transferOpen ? "/admin/breeders" : null, [transferOpen]);

  const mayManage = can("birds.manage");

  const breederChoices: Choice[] = useMemo(() => {
    const q = breederQuery.trim().toLowerCase();
    const all = breedersReq.data?.breeders ?? [];
    const matched = q
      ? all.filter((b) =>
          `${b.firstName ?? ""} ${b.lastName ?? ""} ${b.email ?? ""}`.toLowerCase().includes(q)
        )
      : all;
    return matched.slice(0, 40).map((b) => ({
      key: b.id,
      label: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.email || `Breeder ${b.id}`,
      hint: b.email,
    }));
  }, [breedersReq.data, breederQuery]);

  const saveHealth = async () => {
    if (!healthStatus) {
      toast.error("Pick a condition.");
      return;
    }
    const { ok } = await action.run(
      "post",
      `/admin/bird/${birdId}/health`,
      { healthStatus, healthNote: healthNote.trim() || null },
      { success: "Condition recorded." }
    );
    if (ok) {
      setHealthOpen(false);
      setHealthNote("");
      reload();
    }
  };

  const transfer = async (newBreederId: string | number) => {
    const { ok } = await action.run(
      "post",
      `/admin/bird/${birdId}/transfer-breeder`,
      { newBreederId: Number(newBreederId) },
      { success: "Bird transferred." }
    );
    if (ok) {
      setTransferOpen(false);
      setBreederQuery("");
      reload();
    }
  };

  const saveDetails = async () => {
    const { ok } = await action.run(
      "patch",
      `/admin/bird/${birdId}`,
      {
        birdName: details.birdName.trim() || null,
        color: details.color.trim() || null,
        rfid: details.rfid.trim() || null,
        note: details.note.trim() || null,
      },
      { success: "Bird updated." }
    );
    if (ok) {
      setDetailsOpen(false);
      reload();
    }
  };

  const bird = data?.bird ?? null;

  if (forbidden) return <NoAccess what="Bird records" />;
  if (loading) return <Loading />;

  if (!bird) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <Text className="text-center text-sm text-slate-500">
          {error ?? "That bird could not be found."}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-sm font-medium text-blue-600">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Flattened across every event the bird has been entered in, newest first.
  const races = (bird.inventoryItems ?? [])
    .flatMap((item) =>
      (item.raceItems ?? []).map((ri) => ({
        ...ri,
        event: item.eventInventory?.season?.event?.name ?? null,
        loft: item.eventInventory?.loft ?? null,
      }))
    )
    .sort(
      (a, b) =>
        new Date(b.race?.startTime ?? 0).getTime() - new Date(a.race?.startTime ?? 0).getTime()
    );

  const flown = races.filter((r) => r.result?.birdPosition != null).length;
  const won = races.reduce((s, r) => s + (r.result?.prizeValue ?? 0), 0);
  const best = races.reduce<number | null>((b, r) => {
    const p = r.result?.birdPosition;
    return p != null && (b == null || p < b) ? p : b;
  }, null);

  const who = `${bird.breeder?.firstName ?? ""} ${bird.breeder?.lastName ?? ""}`.trim();

  return (
    <Screen
      title={bird.band ?? "No band"}
      subtitle={
        [bird.birdName, who || null, [bird.breeder?.city1, bird.breeder?.state1].filter(Boolean).join(", ") || null]
          .filter(Boolean)
          .join(" · ") || null
      }
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <Pressable onPress={() => router.back()} className="mt-3 flex-row items-center gap-1">
        <Ionicons name="chevron-back" size={16} color="#2563eb" />
        <Text className="text-sm font-medium text-blue-600">Back</Text>
      </Pressable>

      {error ? <Notice>{error}</Notice> : null}

      {bird.isLost === 1 && <Notice tone="rose">This bird is recorded as lost.</Notice>}
      {bird.attention ? <Notice>{bird.attention}</Notice> : null}

      {mayManage ? (
        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
          <Button
            label="Condition"
            icon="medkit-outline"
            onPress={() => {
              setHealthStatus(bird.healthStatus ?? "HEALTHY");
              setHealthNote(bird.healthNote ?? "");
              setHealthOpen(true);
            }}
          />
          <Button
            label="Edit"
            tone="secondary"
            icon="create-outline"
            onPress={() => {
              setDetails({
                birdName: bird.birdName ?? "",
                color: bird.color ?? "",
                rfid: bird.rfid ?? "",
                note: bird.note ?? "",
              });
              setDetailsOpen(true);
            }}
          />
          <Button
            label="Transfer"
            tone="secondary"
            icon="swap-horizontal-outline"
            onPress={() => {
              setBreederQuery("");
              setTransferOpen(true);
            }}
          />
        </View>
      ) : null}

      <SectionTitle>Bird</SectionTitle>
      <Rows>
        <Row title="Colour" right={bird.color ?? "—"} />
        <Row title="Sex" right={SEX(bird.sex)} />
        <Row
          title="Tag"
          right={bird.rfid ?? "not tagged"}
          rightTone={bird.rfid ? "text-emerald-600" : "text-slate-400"}
        />
        <Row
          title="Health"
          right={(bird.healthStatus ?? "healthy").toLowerCase()}
          rightSub={bird.healthNote ?? undefined}
        />
      </Rows>

      {bird.note ? (
        <View className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Note
          </Text>
          <Text className="mt-1 text-sm text-slate-700">{bird.note}</Text>
        </View>
      ) : null}

      <SectionTitle>Racing record</SectionTitle>
      <Rows>
        <Row title="Races flown" right={String(flown)} />
        <Row title="Best position" right={best != null ? String(best) : "—"} />
        <Row title="Prize money" right={money(won)} rightTone="text-emerald-600" />
      </Rows>

      <SectionTitle>Races</SectionTitle>
      {races.length === 0 ? (
        <Empty>This bird has not been entered in a race.</Empty>
      ) : (
        <Rows>
          {races.slice(0, 60).map((r) => (
            <Row
              key={r.id}
              title={r.race?.name || `Race ${r.race?.raceNumber ?? r.race?.id ?? "—"}`}
              subtitle={
                [r.event, r.race?.startTime ? new Date(r.race.startTime).toLocaleDateString() : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              right={r.result?.birdPosition != null ? `#${r.result.birdPosition}` : "no position"}
              rightSub={
                r.result?.prizeValue != null && r.result.prizeValue > 0
                  ? money(r.result.prizeValue)
                  : undefined
              }
              rightTone={r.result?.birdPosition != null ? "text-slate-900" : "text-slate-400"}
            />
          ))}
        </Rows>
      )}

      <Sheet
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        title="Condition"
        subtitle="What state the bird came back in"
      >
        <ChoiceList
          choices={HEALTH.map((h) => ({ key: h.key, label: h.label, hint: h.hint }))}
          selected={healthStatus}
          onPick={(k) => setHealthStatus(String(k))}
        />
        <Field
          label="Note"
          value={healthNote}
          onChange={setHealthNote}
          multiline
          hint="What happened, and anything the next person needs to know."
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setHealthOpen(false)} full />
          <Button label="Record" onPress={saveHealth} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Edit bird"
        subtitle="The band number is not changed here"
      >
        <Field
          label="Name"
          value={details.birdName}
          onChange={(v) => setDetails({ ...details, birdName: v })}
        />
        <Field
          label="Colour"
          value={details.color}
          onChange={(v) => setDetails({ ...details, color: v })}
        />
        <Field
          label="RFID tag"
          value={details.rfid}
          onChange={(v) => setDetails({ ...details, rfid: v })}
          hint="Usually set by scanning at check-in. Type it only to correct one."
        />
        <Field
          label="Note"
          value={details.note}
          onChange={(v) => setDetails({ ...details, note: v })}
          multiline
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setDetailsOpen(false)} full />
          <Button label="Save" onPress={saveDetails} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer this bird"
        subtitle={`Currently ${who || "unassigned"} — results already flown stay with the bird`}
      >
        <View className="mt-2">
          <SearchBar
            value={breederQuery}
            onChange={setBreederQuery}
            placeholder="Search breeders"
          />
        </View>
        {breedersReq.loading ? (
          <Loading />
        ) : (
          <ChoiceList
            choices={breederChoices}
            onPick={transfer}
            empty={breederQuery ? "Nobody matches that." : "No breeders on record."}
          />
        )}
      </Sheet>
    </Screen>
  );
}
