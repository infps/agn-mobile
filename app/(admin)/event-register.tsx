import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { Chips } from "@/components/admin/Chips";
import { UserEditSheet } from "@/components/admin/UserEditSheet";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Empty,
  Field,
  NoAccess,
  Notice,
  Screen,
  SectionTitle,
  Sheet,
  money,
  tabular,
} from "@/components/admin/ui";

interface FoundBreeder {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  loginName: string | null;
  number: number | null;
  user?: { username: string | null; loftName: string | null } | null;
}

interface OwnedBird {
  id: number;
  band: string | null;
  birdName: string | null;
  color: string | null;
  sex: number | null;
}

interface FeeScheme {
  entryFee: number | null;
  maxBirdCount?: number | null;
  raceFeeMode?: "PER_BIRD_PER_RACE" | "FLAT_PER_RACE" | null;
  hotSpot1Fee: number | null;
  hotSpot2Fee: number | null;
  hotSpot3Fee: number | null;
  hotSpotFinalFee: number | null;
  birdFeeItems?: { birdNo: number | null; birdFee: number | null }[];
  raceTypeFees?: { raceTypeId: number; fee: number }[];
}

interface Season {
  isActive: boolean;
  feeScheme: FeeScheme | null;
  races?: { raceTypeId: number | null }[];
}

interface EventDetail {
  event?: { isOpen?: boolean | null; seasons?: Season[] };
}

type Sex = "COCK" | "HEN" | "UNKNOWN";

type Slot =
  | { kind: "existing"; bird: OwnedBird }
  | {
      kind: "new";
      name: string;
      band1: string;
      band2: string;
      band3: string;
      band4: string;
      color: string;
      sex: Sex;
    };

const FEDERATIONS = ["AU", "IF", "NPA", "CU", "BB", "ARPU", "IPB"].map((f) => ({ key: f, label: f }));
const COLORS = [
  "BB", "BC", "BBWF", "BBPD", "BCWF", "BCPD", "SPLA", "CHOC", "RC", "SIL",
  "RCSP", "RR", "BLK", "OPAL", "SLAT", "PENC", "WHIT", "GRIZ", "DC", "DCWF",
].map((c) => ({ key: c, label: c }));
const SEXES: { key: Sex; label: string }[] = [
  { key: "COCK", label: "Cock" },
  { key: "HEN", label: "Hen" },
  { key: "UNKNOWN", label: "Unknown" },
];
const SEX_CODE: Record<Sex, number> = { UNKNOWN: 0, COCK: 1, HEN: 2 };

const blankBird = (): Slot => ({
  kind: "new",
  name: "",
  band1: "",
  band2: "",
  band3: "",
  band4: "",
  color: "",
  sex: "COCK",
});

/**
 * What the server will bill, worked out the way the server works it out.
 *
 * A preview only — the route recalculates from the scheme when it saves, so
 * this cannot make anybody owe a different amount. It exists so the figure can
 * be said out loud to the breeder standing there before the button is pressed.
 *
 * The hot-spot line follows the organiser's rule: one obligation with four
 * chances to settle it, so what is billed now is the first gate that has a
 * price, not the four added together.
 */
function previewFees(scheme: FeeScheme, races: { raceTypeId: number | null }[], birds: number) {
  const entry = scheme.entryFee ?? 0;
  let perBird = 0;
  for (let n = 1; n <= birds; n++) {
    perBird += (scheme.birdFeeItems ?? []).find((b) => b.birdNo === n)?.birdFee ?? 0;
  }
  let race = 0;
  for (const r of races) {
    if (!r.raceTypeId) continue;
    const fee = (scheme.raceTypeFees ?? []).find((t) => t.raceTypeId === r.raceTypeId);
    if (!fee) continue;
    race += scheme.raceFeeMode === "FLAT_PER_RACE" ? fee.fee : fee.fee * birds;
  }
  const gate =
    [scheme.hotSpot1Fee, scheme.hotSpot2Fee, scheme.hotSpot3Fee, scheme.hotSpotFinalFee].find(
      (v) => (v ?? 0) > 0
    ) ?? 0;
  const hotspot = gate * birds;
  return { entry, perBird, race, hotspot, total: entry + perBird + race + hotspot };
}

/**
 * Entering a breeder in an event on their behalf.
 *
 * This is what happens at a table on shipping day: somebody arrives with a
 * crate, and they are not in the system for this event yet. So the form runs in
 * the order the conversation does — who are you, which loft is this under, how
 * many birds — and each step appears only once the one before it is answered,
 * so there is never a field on screen that cannot be filled in yet.
 *
 * The breeder is found by exact username, email or number rather than picked
 * from a list. A list of a thousand names invites picking the wrong Smith; an
 * exact match either finds the right person or finds nobody.
 *
 * Naming the birds is optional. A registration reserves places, and the birds
 * can be attached later, which is usually what happens when they have not been
 * banded into the system yet.
 *
 * The portal's form also asks for an amount paid and a payment method. The
 * server ignores both — it writes one pending charge for the full amount — so
 * they are left out here rather than offered and thrown away. Money is recorded
 * afterwards, from the registration itself.
 */
export default function EventRegister() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const router = useRouter();
  const { can, canAny, role } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  // The route asks for the permission and an admin role, both.
  const mayRegister = can("breeders.manage") && (role === "ADMIN" || role === "SUPERADMIN");
  const mayAddBreeder = can("users.manage");

  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [breeder, setBreeder] = useState<FoundBreeder | null>(null);
  const [loft, setLoft] = useState("");
  const [teamName, setTeamName] = useState("");
  const [reserved, setReserved] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [note, setNote] = useState("");
  const [addingBreeder, setAddingBreeder] = useState(false);
  const [pickingBird, setPickingBird] = useState(false);

  const eventReq = useAdminData<EventDetail>(
    eventId && canAny("events.view", "events.manage") ? `/admin/event?eventId=${eventId}` : null,
    [eventId]
  );
  const teamsReq = useAdminData<{ teams?: { id: number; name: string | null }[] }>(
    breeder ? `/admin/team?breederId=${breeder.id}` : null,
    [breeder?.id]
  );
  const birdsReq = useAdminData<{ birds?: OwnedBird[] }>(
    breeder ? `/admin/breeders/${breeder.id}/birds` : null,
    [breeder?.id]
  );

  const season = useMemo(() => {
    const seasons = eventReq.data?.event?.seasons ?? [];
    return seasons.find((s) => s.isActive) ?? seasons[0] ?? null;
  }, [eventReq.data]);
  const scheme = season?.feeScheme ?? null;
  const maxBirds = scheme?.maxBirdCount ?? 0;
  const count = parseInt(reserved, 10) || 0;
  const fees = scheme && count > 0 ? previewFees(scheme, season?.races ?? [], count) : null;

  const teams = (teamsReq.data?.teams ?? []).filter((t) => t.name);
  const owned = birdsReq.data?.birds ?? [];
  const usedIds = new Set(slots.flatMap((s) => (s.kind === "existing" ? [s.bird.id] : [])));
  const birdChoices: Choice[] = owned
    .filter((b) => !usedIds.has(b.id))
    .map((b) => ({
      key: b.id,
      label: b.birdName || b.band || `Bird ${b.id}`,
      hint: [b.band, b.color].filter(Boolean).join(" · "),
    }));

  if (!mayRegister) return <NoAccess what="Registering breeders" />;

  const choose = (found: FoundBreeder | null) => {
    setBreeder(found);
    setLoft("");
    setSlots([]);
  };

  const lookup = async (raw: string) => {
    const q = raw.trim();
    if (!q) {
      toast.error("Enter a username, email or breeder number.");
      return;
    }
    setLooking(true);
    try {
      const { data } = await api.get(`/admin/breeders/lookup?q=${encodeURIComponent(q)}`);
      choose(data?.breeder ?? null);
    } catch (err: any) {
      choose(null);
      toast.error(err?.response?.data?.message ?? "Breeder not found");
    } finally {
      setLooking(false);
    }
  };

  const addTeam = async () => {
    const wanted = teamName.trim();
    if (!wanted || !breeder) {
      toast.error("Give the team a name.");
      return;
    }
    const { ok } = await action.run(
      "post",
      "/admin/team",
      { name: wanted, breederId: breeder.id },
      { success: "Team created." }
    );
    if (ok) {
      setTeamName("");
      setLoft(wanted);
      teamsReq.reload();
    }
  };

  const changeReserved = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    let n = parseInt(digits, 10) || 0;
    if (maxBirds > 0 && n > maxBirds) {
      toast.error(`Maximum birds allowed: ${maxBirds}`);
      n = maxBirds;
    }
    setReserved(n > 0 ? String(n) : "");
    // Fewer places than birds named: the extras cannot be entered.
    if (n < slots.length) setSlots(slots.slice(0, n));
  };

  const patch = (index: number, change: Partial<Extract<Slot, { kind: "new" }>>) =>
    setSlots((prev) =>
      prev.map((s, i) => (i === index && s.kind === "new" ? { ...s, ...change } : s))
    );

  const submit = async () => {
    if (!breeder) return;
    if (!loft) {
      toast.error("Pick the loft or team this is under.");
      return;
    }
    if (count <= 0) {
      toast.error("Enter how many birds to reserve.");
      return;
    }
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.kind !== "new") continue;
      if (!s.name.trim() || !s.color || !s.band1 || !s.band2 || !s.band3.trim() || !s.band4.trim()) {
        toast.error(`Bird ${i + 1} still needs a name, a full band and a colour.`);
        return;
      }
    }

    const { ok } = await action.run(
      "post",
      `/admin/event/${eventId}/register`,
      {
        breederId: breeder.id,
        loftName: loft,
        reservedBirds: count,
        birds: slots.map((s) =>
          s.kind === "existing"
            ? { birdId: s.bird.id }
            : {
                name: s.name.trim(),
                color: s.color,
                sex: SEX_CODE[s.sex],
                band1: s.band1,
                band2: s.band2,
                band3: s.band3.trim(),
                band4: s.band4.trim(),
              }
        ),
        note: note.trim() || undefined,
      },
      { success: "Registered." }
    );
    if (ok) router.back();
  };

  const closed = eventReq.data?.event?.isOpen === false;
  const who = `${breeder?.firstName ?? ""} ${breeder?.lastName ?? ""}`.trim() || "this breeder";

  return (
    <Screen title="Register breeder" subtitle={name || null}>
      {closed ? (
        <Notice tone="rose">
          Registration for this event is closed, so the server will refuse a new entry. Reopen
          the event first.
        </Notice>
      ) : null}

      <SectionTitle>Breeder</SectionTitle>
      {breeder ? (
        <View className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <View className="min-w-0 flex-1">
            <Text className="font-medium text-slate-900">
              {who}
              {breeder.user?.loftName ? ` — ${breeder.user.loftName}` : ""}
            </Text>
            <Text className="text-xs text-slate-500">
              ID {breeder.id}
              {breeder.user?.username ? ` · @${breeder.user.username}` : ""}
              {breeder.email ? ` · ${breeder.email}` : ""}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              choose(null);
              setQuery("");
            }}
            hitSlop={8}
          >
            <Text className="text-sm font-medium text-cyan-700">Change</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Field
            label="Username, email or breeder number"
            value={query}
            onChange={setQuery}
            hint="An exact match — the whole username, not the start of it."
          />
          <ButtonRow>
            <Button
              label="Look up"
              icon="search"
              onPress={() => lookup(query)}
              pending={looking}
              full
            />
            {mayAddBreeder ? (
              <Button
                label="New breeder"
                tone="secondary"
                icon="person-add-outline"
                onPress={() => setAddingBreeder(true)}
                full
              />
            ) : null}
          </ButtonRow>
        </>
      )}

      {breeder ? (
        <>
          <SectionTitle>Loft or team</SectionTitle>
          {teamsReq.loading ? null : teams.length === 0 ? (
            <Empty>No teams yet — create one below.</Empty>
          ) : (
            <Chips
              options={teams.map((t) => ({ key: t.name as string, label: t.name as string }))}
              value={loft}
              onChange={setLoft}
            />
          )}
          <Field label="New team" value={teamName} onChange={setTeamName} placeholder="Team name" />
          <ButtonRow>
            <Button
              label="Create team"
              tone="secondary"
              icon="add"
              onPress={addTeam}
              disabled={!teamName.trim() || action.pending}
              full
            />
          </ButtonRow>
        </>
      ) : null}

      {breeder && loft ? (
        <>
          <SectionTitle>Birds</SectionTitle>
          <Field
            label={maxBirds > 0 ? `Reserved birds (max ${maxBirds})` : "Reserved birds"}
            value={reserved}
            onChange={changeReserved}
            keyboard="numeric"
            hint="How many places this entry takes. Naming the birds is optional."
          />
        </>
      ) : null}

      {breeder && loft && count > 0 ? (
        <>
          <Text className="mt-4 text-xs text-slate-500">
            {slots.length} of {count} named
          </Text>

          <View className="mt-2" style={{ gap: 10 }}>
            {slots.map((s, index) => (
              <View key={index} className="rounded-xl border border-slate-200 bg-white p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-slate-900">
                    Bird {index + 1} — {s.kind === "existing" ? "existing" : "new"}
                  </Text>
                  <Pressable
                    onPress={() => setSlots(slots.filter((_, i) => i !== index))}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={18} color="#94a3b8" />
                  </Pressable>
                </View>

                {s.kind === "existing" ? (
                  <Text className="mt-1 text-xs text-slate-500">
                    {[s.bird.birdName, s.bird.band, s.bird.color].filter(Boolean).join(" · ") ||
                      `Bird ${s.bird.id}`}
                  </Text>
                ) : (
                  <>
                    <Field label="Name" value={s.name} onChange={(v) => patch(index, { name: v })} />
                    <Chips
                      label="Federation"
                      options={FEDERATIONS}
                      value={s.band1}
                      onChange={(v) => patch(index, { band1: v })}
                    />
                    <Field
                      label="Year"
                      value={s.band2}
                      onChange={(v) => patch(index, { band2: v.replace(/[^0-9]/g, "") })}
                      keyboard="numeric"
                    />
                    <Field
                      label="Letters"
                      value={s.band3}
                      onChange={(v) => patch(index, { band3: v.toUpperCase() })}
                    />
                    <Field
                      label="Band number"
                      value={s.band4}
                      onChange={(v) => patch(index, { band4: v })}
                    />
                    <Chips
                      label="Colour"
                      options={COLORS}
                      value={s.color}
                      onChange={(v) => patch(index, { color: v })}
                    />
                    <Chips
                      label="Sex"
                      options={SEXES}
                      value={s.sex}
                      onChange={(v) => patch(index, { sex: v })}
                    />
                  </>
                )}
              </View>
            ))}
          </View>

          {slots.length < count ? (
            <ButtonRow>
              {birdChoices.length > 0 ? (
                <Button
                  label="Existing bird"
                  tone="secondary"
                  icon="list-outline"
                  onPress={() => setPickingBird(true)}
                  full
                />
              ) : null}
              <Button
                label="New bird"
                tone="secondary"
                icon="add"
                onPress={() => setSlots([...slots, blankBird()])}
                full
              />
            </ButtonRow>
          ) : null}

          <SectionTitle>What they will be charged</SectionTitle>
          {fees ? (
            <View className="rounded-xl border border-slate-200 bg-white p-4">
              {(
                [
                  ["Entry fee", fees.entry],
                  [`Per bird fees (${count} birds)`, fees.perBird],
                  ["Race fees", fees.race],
                  ["Perch fees (hot spot)", fees.hotspot],
                ] as [string, number][]
              ).map(([label, value]) => (
                <View key={label} className="flex-row justify-between py-1">
                  <Text className="text-sm text-slate-500">{label}</Text>
                  <Text className="text-sm text-slate-900" style={tabular}>
                    {money(value)}
                  </Text>
                </View>
              ))}
              <View className="mt-1 flex-row justify-between border-t border-slate-100 pt-2">
                <Text className="text-base font-semibold text-slate-900">Total</Text>
                <Text className="text-base font-semibold text-slate-900" style={tabular}>
                  {money(fees.total)}
                </Text>
              </View>
              <Text className="mt-2 text-xs text-slate-400">
                Recorded as one unpaid charge. Take the money from the registration afterwards.
                Race fees are shown for the season as planned; a bird is only billed for a race
                once it is basketed.
              </Text>
            </View>
          ) : (
            <Notice>
              {eventReq.forbidden || !canAny("events.view", "events.manage")
                ? "The fee scheme is not part of your access, so the charge cannot be previewed. The server still works it out when you register."
                : "This season has no fee scheme, so nothing will be charged."}
            </Notice>
          )}

          <Field label="Note (optional)" value={note} onChange={setNote} multiline />

          <ButtonRow>
            <Button label="Cancel" tone="secondary" onPress={() => router.back()} full />
            <Button
              label="Register for event"
              onPress={submit}
              pending={action.pending}
              full
            />
          </ButtonRow>
        </>
      ) : null}

      <UserEditSheet
        open={addingBreeder}
        editing={null}
        onClose={() => setAddingBreeder(false)}
        onSaved={(created) => {
          // Saving the account creates the breeder record; finding it by the
          // email just typed selects it without anybody retyping anything.
          if (created?.email) {
            setQuery(created.email);
            lookup(created.email);
          }
        }}
      />

      <Sheet
        open={pickingBird}
        onClose={() => setPickingBird(false)}
        title="Add an existing bird"
        subtitle={`Birds already on file for ${who}`}
      >
        <ChoiceList
          choices={birdChoices}
          empty="Every bird on file is already added."
          onPick={(key) => {
            const bird = owned.find((b) => b.id === key);
            if (bird) setSlots([...slots, { kind: "existing", bird }]);
            setPickingBird(false);
          }}
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setPickingBird(false)} full />
        </ButtonRow>
      </Sheet>
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
