import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Confirm,
  Empty,
  Field,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  Sheet,
  money,
} from "@/components/admin/ui";

interface BirdFeeItem {
  id?: number;
  birdNo: number;
  birdFee: number;
}

interface RaceTypeFee {
  id?: number;
  raceTypeId: number;
  fee: number;
  raceType?: { id: number; name: string | null } | null;
}

interface FeeScheme {
  id: number;
  name: string;
  entryFee: number;
  isRefundable: number;
  maxBirdCount: number;
  feesCutPercent: number;
  minEntryFees: number;
  maxBackupBirdCount: number;
  isFloatingBackup: number;
  hotSpot1Fee: number;
  hotSpot2Fee: number;
  hotSpot3Fee: number;
  hotSpotFinalFee: number;
  raceFeeMode: string;
  latePenaltyMode: string;
  latePenaltyAmount: number | null;
  latePenaltyCap: number | null;
  latePenaltyGraceDays: number;
  requirePaymentToRegister: boolean;
  birdFeeItems?: BirdFeeItem[];
  raceTypeFees?: RaceTypeFee[];
}

interface PrizeBand {
  id?: number;
  raceTypeId: number;
  fromPosition: number;
  toPosition: number;
  prizeValue: number;
}

interface PrizeScheme {
  id: number;
  name: string;
  prizeSchemeItems?: PrizeBand[];
}

interface ShowPercentage {
  id?: number;
  place: number;
  percValue: number;
}

interface BettingScheme {
  id: number;
  name: string;
  bettingCutPercent: number;
  belgianRatio: number;
  standardShowPercentages?: ShowPercentage[];
  [key: string]: unknown;
}

interface RaceType {
  id: number;
  name: string | null;
}

type Kind = "fee" | "prize" | "betting";

const PENALTY_MODES = ["NONE", "FLAT", "PER_DAY", "PER_WEEK"] as const;

/** Every scalar the fee scheme carries, so an update never drops one. */
const FEE_SCALARS = [
  "entryFee",
  "isRefundable",
  "maxBirdCount",
  "feesCutPercent",
  "minEntryFees",
  "maxBackupBirdCount",
  "isFloatingBackup",
  "hotSpot1Fee",
  "hotSpot2Fee",
  "hotSpot3Fee",
  "hotSpotFinalFee",
] as const;

/** Every scalar the betting scheme carries, likewise. */
const BET_SCALARS = [
  "belgianShow1", "belgianShow2", "belgianShow3", "belgianShow4",
  "belgianShow5", "belgianShow6", "belgianShow7",
  "standardShow1", "standardShow2", "standardShow3",
  "standardShow4", "standardShow5", "standardShow6",
  "wta1", "wta2", "wta3", "wta4", "wta5",
] as const;

/**
 * The three schemes a season is priced by.
 *
 * Fee schemes say what an entry costs and what happens when somebody pays
 * late. Prize schemes say what each finishing position is worth. Betting
 * schemes set the house cut and the pool shapes.
 *
 * Every update here sends the scheme *whole*, including its tables, and that is
 * not incidental. The portal's update replaces the nested rows rather than
 * merging them — it deletes what is there and writes back what it was given —
 * so a request that mentions only the name silently empties the fee table.
 * Whatever is not being edited is read back off the record and sent again
 * unchanged.
 */
export default function Schemes() {
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [kind, setKind] = useState<Kind>("fee");
  const [editing, setEditing] = useState<"new" | FeeScheme | PrizeScheme | BettingScheme | null>(
    null
  );
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    entryFee: "",
    maxBirdCount: "",
    feesCutPercent: "",
    latePenaltyMode: "NONE" as string,
    latePenaltyAmount: "",
    latePenaltyCap: "",
    latePenaltyGraceDays: "",
    bettingCutPercent: "",
    belgianRatio: "",
  });

  /* The two editable tables, staged locally until the scheme is saved. */
  const [birdFees, setBirdFees] = useState<BirdFeeItem[]>([]);
  const [bands, setBands] = useState<PrizeBand[]>([]);
  const [addingBirdFee, setAddingBirdFee] = useState(false);
  const [birdFeeForm, setBirdFeeForm] = useState({ birdNo: "", birdFee: "" });
  const [addingBand, setAddingBand] = useState(false);
  const [bandForm, setBandForm] = useState({
    raceTypeId: null as number | null,
    fromPosition: "",
    toPosition: "",
    prizeValue: "",
  });

  const mayManage = can("schemes.manage");

  const fees = useAdminData<{ feeSchemes?: FeeScheme[] }>(
    kind === "fee" ? "/admin/fee-scheme" : null,
    [kind]
  );
  const prizes = useAdminData<{ prizeSchemes?: PrizeScheme[] }>(
    kind === "prize" ? "/admin/prize-scheme" : null,
    [kind]
  );
  const bets = useAdminData<{ bettingSchemes?: BettingScheme[] }>(
    kind === "betting" ? "/admin/betting-scheme" : null,
    [kind]
  );
  // Prize bands are per race type, so the list is needed while one is written.
  const typesReq = useAdminData<{ raceTypes?: RaceType[] }>(
    editing != null && kind === "prize" ? "/admin/race-type" : null,
    [editing != null, kind]
  );

  const req = kind === "fee" ? fees : kind === "prize" ? prizes : bets;
  const path =
    kind === "fee"
      ? "/admin/fee-scheme"
      : kind === "prize"
        ? "/admin/prize-scheme"
        : "/admin/betting-scheme";

  const feeRows = fees.data?.feeSchemes ?? [];
  const prizeRows = prizes.data?.prizeSchemes ?? [];
  const betRows = bets.data?.bettingSchemes ?? [];
  const raceTypes = useMemo(() => typesReq.data?.raceTypes ?? [], [typesReq.data]);

  const typeName = (id: number) =>
    raceTypes.find((t) => t.id === id)?.name ?? `Type ${id}`;

  const blankForm = {
    name: "",
    entryFee: "",
    maxBirdCount: "",
    feesCutPercent: "",
    latePenaltyMode: "NONE",
    latePenaltyAmount: "",
    latePenaltyCap: "",
    latePenaltyGraceDays: "",
    bettingCutPercent: "",
    belgianRatio: "",
  };

  const startNew = () => {
    setForm(blankForm);
    setBirdFees([]);
    setBands([]);
    setEditing("new");
  };

  const startEdit = (row: any) => {
    setForm({
      name: row.name ?? "",
      entryFee: row.entryFee != null ? String(row.entryFee) : "",
      maxBirdCount: row.maxBirdCount != null ? String(row.maxBirdCount) : "",
      feesCutPercent: row.feesCutPercent != null ? String(row.feesCutPercent) : "",
      latePenaltyMode: row.latePenaltyMode ?? "NONE",
      latePenaltyAmount: row.latePenaltyAmount != null ? String(row.latePenaltyAmount) : "",
      latePenaltyCap: row.latePenaltyCap != null ? String(row.latePenaltyCap) : "",
      latePenaltyGraceDays:
        row.latePenaltyGraceDays != null ? String(row.latePenaltyGraceDays) : "",
      bettingCutPercent: row.bettingCutPercent != null ? String(row.bettingCutPercent) : "",
      belgianRatio: row.belgianRatio != null ? String(row.belgianRatio) : "",
    });
    setBirdFees(row.birdFeeItems ?? []);
    setBands(row.prizeSchemeItems ?? []);
    setEditing(row);
  };

  const int = (raw: string, fallback = 0): number => {
    const t = raw.trim();
    if (!t) return fallback;
    const v = parseInt(t, 10);
    return isNaN(v) ? fallback : v;
  };

  const dec = (raw: string): number | null => {
    const t = raw.trim();
    if (!t) return null;
    const v = parseFloat(t);
    return isNaN(v) ? null : v;
  };

  const addBirdFee = () => {
    const no = int(birdFeeForm.birdNo, 0);
    const fee = dec(birdFeeForm.birdFee);
    if (no <= 0) {
      toast.error("The bird number has to be 1 or more.");
      return;
    }
    if (fee == null || fee < 0) {
      toast.error("The fee has to be a number.");
      return;
    }
    if (birdFees.some((b) => b.birdNo === no)) {
      toast.error(`Bird ${no} already has a fee.`);
      return;
    }
    setBirdFees((prev) => [...prev, { birdNo: no, birdFee: fee }].sort((a, b) => a.birdNo - b.birdNo));
    setBirdFeeForm({ birdNo: "", birdFee: "" });
    setAddingBirdFee(false);
  };

  const addBand = () => {
    const from = int(bandForm.fromPosition, 0);
    const to = int(bandForm.toPosition, 0);
    const value = dec(bandForm.prizeValue);
    if (bandForm.raceTypeId == null) {
      toast.error("Pick the race type this band applies to.");
      return;
    }
    if (from <= 0 || to <= 0) {
      toast.error("Positions start at 1.");
      return;
    }
    if (to < from) {
      toast.error("The last position cannot come before the first.");
      return;
    }
    if (value == null || value < 0) {
      toast.error("The prize has to be a number.");
      return;
    }
    const clash = bands.some(
      (b) => b.raceTypeId === bandForm.raceTypeId && from <= b.toPosition && to >= b.fromPosition
    );
    if (clash) {
      toast.error("That overlaps a band already set for this race type.");
      return;
    }
    setBands((prev) =>
      [...prev, { raceTypeId: bandForm.raceTypeId!, fromPosition: from, toPosition: to, prizeValue: value }].sort(
        (a, b) => a.raceTypeId - b.raceTypeId || a.fromPosition - b.fromPosition
      )
    );
    setBandForm({ raceTypeId: null, fromPosition: "", toPosition: "", prizeValue: "" });
    setAddingBand(false);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Give the scheme a name.");
      return;
    }

    const isNew = editing === "new";
    const current = isNew ? null : (editing as any);
    let body: Record<string, unknown> = { name: form.name.trim() };

    if (kind === "fee") {
      // Carried through untouched so an edit never empties them.
      const carried: Record<string, unknown> = {};
      for (const key of FEE_SCALARS) carried[key] = current?.[key] ?? 0;

      body = {
        ...body,
        ...carried,
        entryFee: int(form.entryFee),
        maxBirdCount: int(form.maxBirdCount),
        feesCutPercent: int(form.feesCutPercent),
        raceFeeMode: current?.raceFeeMode ?? "PER_BIRD_PER_RACE",
        requirePaymentToRegister: current?.requirePaymentToRegister ?? false,
        latePenaltyMode: form.latePenaltyMode,
        latePenaltyAmount: dec(form.latePenaltyAmount),
        latePenaltyCap: dec(form.latePenaltyCap),
        latePenaltyGraceDays: int(form.latePenaltyGraceDays),
        birdFeeItems: birdFees.map((b) => ({ birdNo: b.birdNo, birdFee: b.birdFee })),
        // Not editable here, but sent back so the update does not drop them.
        raceTypeFees: (current?.raceTypeFees ?? []).map((r: RaceTypeFee) => ({
          raceTypeId: r.raceTypeId,
          fee: r.fee,
        })),
      };
    } else if (kind === "prize") {
      body = {
        ...body,
        prizeSchemeItems: bands.map((b) => ({
          raceTypeId: b.raceTypeId,
          fromPosition: b.fromPosition,
          toPosition: b.toPosition,
          prizeValue: b.prizeValue,
        })),
      };
    } else {
      const carried: Record<string, unknown> = {};
      for (const key of BET_SCALARS) carried[key] = current?.[key] ?? 0;
      body = {
        ...body,
        ...carried,
        bettingCutPercent: int(form.bettingCutPercent),
        belgianRatio: int(form.belgianRatio, 10),
        standardShowPercentages: (current?.standardShowPercentages ?? []).map(
          (s: ShowPercentage) => ({ place: s.place, percValue: s.percValue })
        ),
      };
    }

    const { ok } = await action.run(
      isNew ? "post" : "put",
      path,
      isNew ? body : { id: current.id, ...body },
      { success: isNew ? "Scheme created." : "Scheme updated." }
    );
    if (ok) {
      setEditing(null);
      req.reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", path, { id: removing.id }, {
      success: "Scheme removed.",
    });
    if (ok) {
      setRemoving(null);
      req.reload();
    }
  };

  if (req.forbidden) return <NoAccess what="Schemes" />;

  const TABS: { key: Kind; label: string }[] = [
    { key: "fee", label: "Fees" },
    { key: "prize", label: "Prizes" },
    { key: "betting", label: "Betting" },
  ];

  const count =
    kind === "fee" ? feeRows.length : kind === "prize" ? prizeRows.length : betRows.length;

  const typeChoices: Choice[] = raceTypes.map((t) => ({
    key: t.id,
    label: t.name ?? `Type ${t.id}`,
  }));

  return (
    <Screen
      title="Schemes"
      subtitle={`${count} ${kind} scheme${count === 1 ? "" : "s"}`}
      onRefresh={req.refresh}
      refreshing={req.refreshing}
      header={
        <>
          <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
            {TABS.map((t) => (
              <Button
                key={t.key}
                label={t.label}
                tone={kind === t.key ? "primary" : "secondary"}
                onPress={() => setKind(t.key)}
                full
              />
            ))}
          </View>
          {mayManage ? (
            <ButtonRow>
              <Button label="New scheme" icon="add" onPress={startNew} />
            </ButtonRow>
          ) : null}
        </>
      }
    >
      {req.loading ? (
        <Loading />
      ) : (
        <>
          {req.error ? <Notice>{req.error}</Notice> : null}

          {kind === "fee" ? (
            feeRows.length === 0 ? (
              <View className="mt-4">
                <Empty>No fee scheme has been set up.</Empty>
              </View>
            ) : (
              <View className="mt-4">
                <Rows>
                  {feeRows.map((f) => (
                    <Row
                      key={f.id}
                      title={f.name}
                      subtitle={
                        [
                          `${money(f.entryFee)} entry`,
                          `${(f.birdFeeItems ?? []).length} bird fees`,
                          f.latePenaltyMode !== "NONE"
                            ? `late: ${f.latePenaltyMode.toLowerCase().replace(/_/g, " ")}`
                            : "no late penalty",
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      right={`${f.feesCutPercent}%`}
                      rightSub="cut"
                      onPress={mayManage ? () => startEdit(f) : undefined}
                    />
                  ))}
                </Rows>
              </View>
            )
          ) : null}

          {kind === "prize" ? (
            prizeRows.length === 0 ? (
              <View className="mt-4">
                <Empty>No prize scheme has been set up.</Empty>
              </View>
            ) : (
              <View className="mt-4">
                <Rows>
                  {prizeRows.map((p) => {
                    const list = p.prizeSchemeItems ?? [];
                    const pot = list.reduce(
                      (s, b) => s + b.prizeValue * (b.toPosition - b.fromPosition + 1),
                      0
                    );
                    return (
                      <Row
                        key={p.id}
                        title={p.name}
                        subtitle={`${list.length} band${list.length === 1 ? "" : "s"}`}
                        right={money(pot)}
                        rightSub="total"
                        rightTone="text-emerald-600"
                        onPress={mayManage ? () => startEdit(p) : undefined}
                      />
                    );
                  })}
                </Rows>
              </View>
            )
          ) : null}

          {kind === "betting" ? (
            betRows.length === 0 ? (
              <View className="mt-4">
                <Empty>No betting scheme has been set up.</Empty>
              </View>
            ) : (
              <View className="mt-4">
                <FigureRow>
                  <Figure label="Schemes" value={betRows.length} basis="47%" />
                  <Figure
                    label="Average cut"
                    value={`${Math.round(
                      betRows.reduce((s, b) => s + b.bettingCutPercent, 0) / betRows.length
                    )}%`}
                    basis="47%"
                  />
                </FigureRow>
                <View className="mt-4">
                  <Rows>
                    {betRows.map((b) => (
                      <Row
                        key={b.id}
                        title={b.name}
                        subtitle={`Belgian ratio ${b.belgianRatio}`}
                        right={`${b.bettingCutPercent}%`}
                        rightSub="house cut"
                        onPress={mayManage ? () => startEdit(b) : undefined}
                      />
                    ))}
                  </Rows>
                </View>
              </View>
            )
          ) : null}
        </>
      )}

      <Sheet
        open={editing != null && !addingBirdFee && !addingBand}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New scheme" : "Edit scheme"}
        subtitle={kind === "fee" ? "Fees" : kind === "prize" ? "Prizes" : "Betting"}
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          autoFocus
        />

        {kind === "fee" ? (
          <>
            <Field
              label="Entry fee"
              value={form.entryFee}
              onChange={(v) => setForm({ ...form, entryFee: v })}
              keyboard="numeric"
            />
            <Field
              label="Max birds"
              value={form.maxBirdCount}
              onChange={(v) => setForm({ ...form, maxBirdCount: v })}
              keyboard="numeric"
              hint="Zero for no limit."
            />
            <Field
              label="House cut %"
              value={form.feesCutPercent}
              onChange={(v) => setForm({ ...form, feesCutPercent: v })}
              keyboard="numeric"
            />

            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Fee per bird
              </Text>
              <Button
                label="Add"
                tone="secondary"
                icon="add"
                onPress={() => {
                  setBirdFeeForm({ birdNo: String(birdFees.length + 1), birdFee: "" });
                  setAddingBirdFee(true);
                }}
              />
            </View>
            {birdFees.length === 0 ? (
              <Text className="mt-1 text-xs text-slate-400">
                None set — every bird is charged the entry fee.
              </Text>
            ) : (
              <Rows>
                {birdFees.map((b) => (
                  <Row
                    key={b.birdNo}
                    title={`Bird ${b.birdNo}`}
                    right={money(b.birdFee)}
                    rightSub="remove"
                    rightTone="text-rose-600"
                    onPress={() => setBirdFees((prev) => prev.filter((x) => x.birdNo !== b.birdNo))}
                  />
                ))}
              </Rows>
            )}

            <Text className="mb-1 mt-4 text-xs font-medium text-slate-600">Late payment</Text>
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {PENALTY_MODES.map((m) => (
                <Button
                  key={m}
                  label={m.toLowerCase().replace(/_/g, " ")}
                  tone={form.latePenaltyMode === m ? "primary" : "secondary"}
                  onPress={() => setForm({ ...form, latePenaltyMode: m })}
                />
              ))}
            </View>

            {form.latePenaltyMode !== "NONE" ? (
              <>
                <Field
                  label="Penalty amount"
                  value={form.latePenaltyAmount}
                  onChange={(v) => setForm({ ...form, latePenaltyAmount: v })}
                  keyboard="decimal-pad"
                />
                <Field
                  label="Cap"
                  value={form.latePenaltyCap}
                  onChange={(v) => setForm({ ...form, latePenaltyCap: v })}
                  keyboard="decimal-pad"
                  hint="The most any one entry can be charged. Empty for no cap."
                />
                <Field
                  label="Grace days"
                  value={form.latePenaltyGraceDays}
                  onChange={(v) => setForm({ ...form, latePenaltyGraceDays: v })}
                  keyboard="numeric"
                />
              </>
            ) : null}
          </>
        ) : null}

        {kind === "prize" ? (
          <>
            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Prize bands
              </Text>
              <Button
                label="Add"
                tone="secondary"
                icon="add"
                onPress={() => {
                  setBandForm({
                    raceTypeId: null,
                    fromPosition: "",
                    toPosition: "",
                    prizeValue: "",
                  });
                  setAddingBand(true);
                }}
              />
            </View>
            {bands.length === 0 ? (
              <Text className="mt-1 text-xs text-slate-400">
                No bands — this scheme pays nothing yet.
              </Text>
            ) : (
              <Rows>
                {bands.map((b, i) => (
                  <Row
                    key={`${b.raceTypeId}-${b.fromPosition}-${i}`}
                    title={
                      b.fromPosition === b.toPosition
                        ? `Position ${b.fromPosition}`
                        : `Positions ${b.fromPosition}–${b.toPosition}`
                    }
                    subtitle={typeName(b.raceTypeId)}
                    right={money(b.prizeValue)}
                    rightSub="remove"
                    rightTone="text-rose-600"
                    onPress={() => setBands((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </Rows>
            )}
          </>
        ) : null}

        {kind === "betting" ? (
          <>
            <Field
              label="House cut %"
              value={form.bettingCutPercent}
              onChange={(v) => setForm({ ...form, bettingCutPercent: v })}
              keyboard="numeric"
            />
            <Field
              label="Belgian ratio"
              value={form.belgianRatio}
              onChange={(v) => setForm({ ...form, belgianRatio: v })}
              keyboard="numeric"
              hint="Ten is the usual."
            />
            <Notice>
              Tier stakes and show percentages are kept as they are. They are a wide grid and are
              edited in the portal.
            </Notice>
          </>
        ) : null}

        <ButtonRow>
          {editing !== "new" && editing != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const row = editing as { id: number; name: string };
                setEditing(null);
                setRemoving({ id: row.id, name: row.name });
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          )}
          <Button label="Save" onPress={save} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={addingBirdFee}
        onClose={() => setAddingBirdFee(false)}
        title="Fee for one bird"
        subtitle="What the nth bird in an entry costs"
      >
        <Field
          label="Bird number"
          value={birdFeeForm.birdNo}
          onChange={(v) => setBirdFeeForm({ ...birdFeeForm, birdNo: v })}
          keyboard="numeric"
          autoFocus
        />
        <Field
          label="Fee"
          value={birdFeeForm.birdFee}
          onChange={(v) => setBirdFeeForm({ ...birdFeeForm, birdFee: v })}
          keyboard="decimal-pad"
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setAddingBirdFee(false)} full />
          <Button label="Add" onPress={addBirdFee} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={addingBand}
        onClose={() => setAddingBand(false)}
        title="Prize band"
        subtitle="A run of finishing positions, all paying the same"
      >
        <Text className="mb-1 mt-3 text-xs font-medium text-slate-600">Race type</Text>
        {typesReq.loading ? (
          <Loading />
        ) : (
          <ChoiceList
            choices={typeChoices}
            selected={bandForm.raceTypeId}
            onPick={(k) => setBandForm({ ...bandForm, raceTypeId: Number(k) })}
            empty="No race types are set up."
          />
        )}
        <Field
          label="From position"
          value={bandForm.fromPosition}
          onChange={(v) => setBandForm({ ...bandForm, fromPosition: v })}
          keyboard="numeric"
        />
        <Field
          label="To position"
          value={bandForm.toPosition}
          onChange={(v) => setBandForm({ ...bandForm, toPosition: v })}
          keyboard="numeric"
          hint="Same as the first for a single place."
        />
        <Field
          label="Prize each"
          value={bandForm.prizeValue}
          onChange={(v) => setBandForm({ ...bandForm, prizeValue: v })}
          keyboard="decimal-pad"
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setAddingBand(false)} full />
          <Button label="Add" onPress={addBand} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Remove ${removing?.name ?? "this scheme"}?`}
        body="Seasons already using it keep the prices they were given. It stops being offered for new ones."
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
