import React, { useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
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
  birdNo: number | null;
  birdFee: number | null;
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
  entryFee: number | null;
  isRefundable: number | null;
  maxBirdCount: number | null;
  feesCutPercent: number | null;
  minEntryFees: number | null;
  maxBackupBirdCount: number | null;
  isFloatingBackup: number | null;
  hotSpot1Fee: number | null;
  hotSpot2Fee: number | null;
  hotSpot3Fee: number | null;
  hotSpotFinalFee: number | null;
  raceFeeMode: string | null;
  latePenaltyMode?: string | null;
  latePenaltyAmount?: number | null;
  latePenaltyCap?: number | null;
  latePenaltyGraceDays?: number | null;
  requirePaymentToRegister: boolean | null;
  birdFeeItems?: BirdFeeItem[];
  raceTypeFees?: RaceTypeFee[];
}

interface PrizeBand {
  id?: number;
  raceTypeId: number | null;
  fromPosition: number | null;
  toPosition: number | null;
  prizeValue: number | null;
}

interface PrizeScheme {
  id: number;
  name: string;
  prizeSchemeItems?: PrizeBand[];
}

interface ShowPercentage {
  id?: number;
  place: number | null;
  percValue: number | null;
}

interface BettingScheme {
  id: number;
  name: string;
  bettingCutPercent: number | null;
  belgianRatio: number | null;
  standardShowPercentages?: ShowPercentage[];
  [key: string]: unknown;
}

interface RaceType {
  id: number;
  name: string | null;
}

type Kind = "fee" | "prize" | "betting";
type Row_ = FeeScheme | PrizeScheme | BettingScheme;

const RACE_FEE_MODES: { key: string; label: string }[] = [
  { key: "PER_BIRD_PER_RACE", label: "Per bird per race" },
  { key: "FLAT_PER_RACE", label: "Flat per race" },
];

/** The whole-number money fields of a fee scheme, in the order the portal asks. */
const FEE_PERCH: { key: string; label: string }[] = [
  { key: "hotSpot1Fee", label: "Perch fee 1" },
  { key: "hotSpot2Fee", label: "Perch fee 2" },
  { key: "hotSpot3Fee", label: "Perch fee 3" },
  { key: "hotSpotFinalFee", label: "Perch fee final" },
];

/** The three pool shapes and how many tiers the server allows in each. */
const TIER_GROUPS: { title: string; prefix: string; label: string; count: number }[] = [
  { title: "Belgian show", prefix: "belgianShow", label: "Show", count: 7 },
  { title: "Standard show", prefix: "standardShow", label: "Show", count: 6 },
  { title: "Winner takes all", prefix: "wta", label: "WTA", count: 5 },
];

/** More bird-fee boxes than this is a typo in "max birds", not a fee table. */
const BIRD_FEE_ROWS_SHOWN = 60;

const str = (v: unknown) => (v == null ? "" : String(v));

function SubHead({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View className="mt-5 flex-row items-center justify-between">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {children}
      </Text>
      {action}
    </View>
  );
}

/** Fields side by side, wrapping — the portal's grids, at phone width. */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row flex-wrap" style={{ columnGap: 8 }}>
      {React.Children.map(children, (child) => (
        <View style={{ flexGrow: 1, flexBasis: "30%" }}>{child}</View>
      ))}
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="mt-3 flex-row items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-slate-900">{label}</Text>
        {hint ? <Text className="mt-0.5 text-xs text-slate-400">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

/**
 * The three schemes a season is priced by.
 *
 * Fee schemes say what an entry costs. Prize schemes say what each finishing
 * position is worth. Betting schemes set the stake of every pool tier, how a
 * standard pool is split, and the cut taken for expenses.
 *
 * Every update here sends the scheme *whole*, including its tables, and that is
 * not incidental. The portal's update replaces the nested rows rather than
 * merging them — it deletes what is there and writes back what it was given —
 * so a request that mentions only the name silently empties the fee table.
 * Everything the record carries is therefore on the form, and anything the form
 * could not load (race types, when that list fails) is read back off the record
 * and sent again unchanged.
 *
 * The server answers a bad field with a bare "Validation error", which tells an
 * operator nothing. So the same rules are checked here first and said in words:
 * which field, and what it has to be.
 *
 * Somebody who may only view schemes can still open one and read every figure;
 * they are simply not offered anything to change.
 */
export default function Schemes() {
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [kind, setKind] = useState<Kind>("fee");
  const [editing, setEditing] = useState<"new" | Row_ | null>(null);
  const [viewing, setViewing] = useState<Row_ | null>(null);
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);

  /* Every text box on whichever editor is open, by field name. */
  const [f, setF] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [raceFeeMode, setRaceFeeMode] = useState("PER_BIRD_PER_RACE");

  /* The two list-shaped tables, staged locally until the scheme is saved. */
  const [bands, setBands] = useState<PrizeBand[]>([]);
  const [percs, setPercs] = useState<{ place: string; percValue: string }[]>([]);
  /** Index of the band in the sheet; -1 for a new one; null when closed. */
  const [bandAt, setBandAt] = useState<number | null>(null);
  const [bandForm, setBandForm] = useState({
    raceTypeId: null as number | null,
    fromPosition: "",
    toPosition: "",
    prizeValue: "",
  });

  const mayView = canAny("schemes.view", "schemes.manage");
  const mayManage = can("schemes.manage");

  const fees = useAdminData<{ feeSchemes?: FeeScheme[] }>(
    mayView && kind === "fee" ? "/admin/fee-scheme" : null,
    [kind]
  );
  const prizes = useAdminData<{ prizeSchemes?: PrizeScheme[] }>(
    mayView && kind === "prize" ? "/admin/prize-scheme" : null,
    [kind]
  );
  const bets = useAdminData<{ bettingSchemes?: BettingScheme[] }>(
    mayView && kind === "betting" ? "/admin/betting-scheme" : null,
    [kind]
  );
  // Fees and prize bands are both per race type, so the list is needed while
  // either is open.
  const sheetOpen = editing != null || viewing != null;
  const typesReq = useAdminData<{ raceTypes?: RaceType[] }>(
    sheetOpen && kind !== "betting" ? "/admin/race-type" : null,
    [sheetOpen, kind]
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

  const typeName = (id: number | null) =>
    id == null ? "No race type" : (raceTypes.find((t) => t.id === id)?.name ?? `Type ${id}`);

  const set = (key: string) => (v: string) => setF((prev) => ({ ...prev, [key]: v }));
  const flag = (key: string) => (v: boolean) => setFlags((prev) => ({ ...prev, [key]: v }));

  const startNew = () => {
    setF(kind === "betting" ? { belgianRatio: "10" } : {});
    setFlags({});
    setRaceFeeMode("PER_BIRD_PER_RACE");
    setBands([]);
    setPercs([]);
    setEditing("new");
  };

  const startEdit = (row: any) => {
    const next: Record<string, string> = { name: row.name ?? "" };

    if (kind === "fee") {
      for (const key of [
        "entryFee",
        "feesCutPercent",
        "minEntryFees",
        "maxBirdCount",
        "maxBackupBirdCount",
        ...FEE_PERCH.map((p) => p.key),
      ]) {
        next[key] = str(row[key] ?? 0);
      }
      for (const b of (row.birdFeeItems ?? []) as BirdFeeItem[]) {
        if (b.birdNo != null) next[`bird:${b.birdNo}`] = str(b.birdFee ?? 0);
      }
      for (const r of (row.raceTypeFees ?? []) as RaceTypeFee[]) {
        next[`rt:${r.raceTypeId}`] = str(r.fee ?? 0);
      }
      setFlags({
        isRefundable: !!row.isRefundable,
        isFloatingBackup: !!row.isFloatingBackup,
        requirePaymentToRegister: !!row.requirePaymentToRegister,
      });
      setRaceFeeMode(row.raceFeeMode ?? "PER_BIRD_PER_RACE");
    } else if (kind === "betting") {
      for (const g of TIER_GROUPS) {
        for (let i = 1; i <= g.count; i++) next[`${g.prefix}${i}`] = str(row[`${g.prefix}${i}`] ?? 0);
      }
      next.bettingCutPercent = str(row.bettingCutPercent ?? 0);
      next.belgianRatio = str(row.belgianRatio ?? 10);
      setPercs(
        ((row.standardShowPercentages ?? []) as ShowPercentage[]).map((p) => ({
          place: str(p.place ?? 1),
          percValue: str(p.percValue ?? 0),
        }))
      );
    }

    setF(next);
    setBands(kind === "prize" ? [...(row.prizeSchemeItems ?? [])] : []);
    setEditing(row);
  };

  const open = (row: Row_) => (mayManage ? startEdit(row) : setViewing(row));

  /* ── prize bands ─────────────────────────────────────────────────────── */

  const openBand = (index: number) => {
    const b = index >= 0 ? bands[index] : null;
    setBandForm({
      raceTypeId: b?.raceTypeId ?? null,
      fromPosition: b ? str(b.fromPosition ?? 1) : "",
      toPosition: b ? str(b.toPosition ?? 1) : "",
      prizeValue: b ? str(b.prizeValue ?? 0) : "",
    });
    setBandAt(index);
  };

  const saveBand = () => {
    if (bandAt == null) return;
    const from = /^\d+$/.test(bandForm.fromPosition.trim()) ? parseInt(bandForm.fromPosition, 10) : 0;
    const to = /^\d+$/.test(bandForm.toPosition.trim()) ? parseInt(bandForm.toPosition, 10) : 0;
    const value = bandForm.prizeValue.trim() ? Number(bandForm.prizeValue.trim()) : NaN;
    if (bandForm.raceTypeId == null) {
      toast.error("Pick the race type this band applies to.");
      return;
    }
    if (from <= 0 || to <= 0) {
      toast.error("Positions are whole numbers starting at 1.");
      return;
    }
    if (to < from) {
      toast.error("The last position cannot come before the first.");
      return;
    }
    if (isNaN(value) || value < 0) {
      toast.error("The prize has to be a number, zero or more.");
      return;
    }
    const band: PrizeBand = {
      raceTypeId: bandForm.raceTypeId,
      fromPosition: from,
      toPosition: to,
      prizeValue: value,
    };
    setBands((prev) => {
      const next = bandAt >= 0 ? prev.map((b, i) => (i === bandAt ? band : b)) : [...prev, band];
      return next.sort(
        (a, b) =>
          (a.raceTypeId ?? 0) - (b.raceTypeId ?? 0) || (a.fromPosition ?? 0) - (b.fromPosition ?? 0)
      );
    });
    setBandAt(null);
  };

  /* ── save ────────────────────────────────────────────────────────────── */

  const save = async () => {
    const name = (f.name ?? "").trim();
    if (!name) {
      toast.error("Give the scheme a name.");
      return;
    }

    // The first thing wrong is the one worth saying; the rest can wait a turn.
    const problems: string[] = [];
    const whole = (raw: string | undefined, label: string, max?: number): number => {
      const t = (raw ?? "").trim();
      if (!t) return 0;
      if (!/^\d+$/.test(t)) {
        problems.push(`${label} has to be a whole number, zero or more.`);
        return 0;
      }
      const v = parseInt(t, 10);
      if (max != null && v > max) problems.push(`${label} cannot be more than ${max}.`);
      return v;
    };
    const amount = (raw: string | undefined, label: string, max?: number): number => {
      const t = (raw ?? "").trim();
      if (!t) return 0;
      const v = Number(t);
      if (isNaN(v) || v < 0) {
        problems.push(`${label} has to be a number, zero or more.`);
        return 0;
      }
      if (max != null && v > max) problems.push(`${label} cannot be more than ${max}.`);
      return v;
    };

    const isNew = editing === "new";
    const current = isNew ? null : (editing as any);
    let body: Record<string, unknown> = { name };

    if (kind === "fee") {
      const maxBirdCount = whole(f.maxBirdCount, "Maximum number of birds");

      // One fee per bird up to the maximum, as the portal writes them.
      const birdFeeItems = Array.from({ length: maxBirdCount }, (_, i) => ({
        birdNo: i + 1,
        birdFee: whole(f[`bird:${i + 1}`], `The fee for bird ${i + 1}`),
      }));

      // A race type the list could not show keeps whatever fee it already had.
      const shown = new Set(raceTypes.map((t) => t.id));
      const raceTypeFees = [
        ...raceTypes
          .filter((t) => isNew || (f[`rt:${t.id}`] ?? "").trim() !== "")
          .map((t) => ({
            raceTypeId: t.id,
            fee: amount(f[`rt:${t.id}`], `The ${t.name ?? "race type"} fee`),
          })),
        ...((current?.raceTypeFees ?? []) as RaceTypeFee[])
          .filter((r) => !shown.has(r.raceTypeId))
          .map((r) => ({ raceTypeId: r.raceTypeId, fee: r.fee ?? 0 })),
      ];

      body = {
        ...body,
        entryFee: whole(f.entryFee, "The entry fee"),
        feesCutPercent: whole(f.feesCutPercent, "The fees cut", 100),
        minEntryFees: whole(f.minEntryFees, "Min entry fees per team"),
        isRefundable: flags.isRefundable ? 1 : 0,
        maxBirdCount,
        maxBackupBirdCount: whole(f.maxBackupBirdCount, "Maximum number of backup birds"),
        isFloatingBackup: flags.isFloatingBackup ? 1 : 0,
        raceFeeMode,
        requirePaymentToRegister: flags.requirePaymentToRegister === true,
        birdFeeItems,
        raceTypeFees,
      };
      for (const p of FEE_PERCH) body[p.key] = whole(f[p.key], p.label);
    } else if (kind === "prize") {
      if (bands.some((b) => b.raceTypeId == null)) {
        toast.error("One of the prize bands has no race type. Open it and pick one.");
        return;
      }
      body = {
        ...body,
        prizeSchemeItems: bands.map((b) => ({
          raceTypeId: b.raceTypeId,
          fromPosition: b.fromPosition ?? 1,
          toPosition: b.toPosition ?? 1,
          prizeValue: b.prizeValue ?? 0,
        })),
      };
    } else {
      for (const g of TIER_GROUPS) {
        for (let i = 1; i <= g.count; i++) {
          body[`${g.prefix}${i}`] = amount(f[`${g.prefix}${i}`], `${g.title} ${i}`);
        }
      }
      const ratio = whole(f.belgianRatio || "10", "The Belgian ratio");
      if (ratio < 1) problems.push("The Belgian ratio has to be 1 or more.");
      body = {
        ...body,
        bettingCutPercent: amount(f.bettingCutPercent, "Percent for expenses", 100),
        belgianRatio: ratio,
        standardShowPercentages: percs.map((p, i) => {
          const place = whole(p.place, `Place on line ${i + 1}`);
          if (place < 1) problems.push(`Place on line ${i + 1} has to be 1 or more.`);
          return { place, percValue: amount(p.percValue, `The percentage for place ${p.place}`, 100) };
        }),
      };
    }

    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
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
      success: `${removing.name} deleted.`,
    });
    if (ok) {
      setRemoving(null);
      req.reload();
    }
  };

  if (!mayView || req.forbidden) return <NoAccess what="Schemes" />;

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

  const birdRows = /^\d+$/.test((f.maxBirdCount ?? "").trim())
    ? parseInt(f.maxBirdCount.trim(), 10)
    : 0;

  const kindLabel = kind === "fee" ? "fee" : kind === "prize" ? "prize" : "betting";

  const bandTitle = (b: PrizeBand) =>
    b.fromPosition === b.toPosition
      ? `Position ${b.fromPosition ?? "?"}`
      : `Positions ${b.fromPosition ?? "?"}–${b.toPosition ?? "?"}`;

  const yesNo = (v: unknown) => (v ? "yes" : "no");

  /** Everything a scheme carries, as lines — what a view-only account reads. */
  const facts = (row: Row_ | null): { title: string; lines: [string, string][] }[] => {
    if (!row) return [];
    const r = row as any;
    if (kind === "fee") {
      return [
        {
          title: "Fees",
          lines: [
            ["Entry fee", money(r.entryFee ?? 0)],
            ["Fees cut", `${r.feesCutPercent ?? 0}%`],
            ["Min entry fees per team", String(r.minEntryFees ?? 0)],
            ["Refund entry fee when bird is lost", yesNo(r.isRefundable)],
            ...FEE_PERCH.map((p): [string, string] => [p.label, money(r[p.key] ?? 0)]),
            ["Require payment to register", yesNo(r.requirePaymentToRegister)],
            ["Maximum number of birds", String(r.maxBirdCount ?? 0)],
            ["Maximum number of backup birds", String(r.maxBackupBirdCount ?? 0)],
            ["Floating backup", yesNo(r.isFloatingBackup)],
            [
              "Race fee mode",
              RACE_FEE_MODES.find((m) => m.key === r.raceFeeMode)?.label ?? String(r.raceFeeMode ?? "—"),
            ],
          ],
        },
        {
          title: "Per bird fees",
          lines: ((r.birdFeeItems ?? []) as BirdFeeItem[]).map((b): [string, string] => [
            `Bird ${b.birdNo ?? "?"}`,
            money(b.birdFee ?? 0),
          ]),
        },
        {
          title: "Race type fees",
          lines: ((r.raceTypeFees ?? []) as RaceTypeFee[]).map((t): [string, string] => [
            t.raceType?.name ?? typeName(t.raceTypeId),
            money(t.fee ?? 0),
          ]),
        },
      ];
    }
    if (kind === "prize") {
      return [
        {
          title: "Prize distribution",
          lines: ((r.prizeSchemeItems ?? []) as PrizeBand[]).map((b): [string, string] => [
            `${bandTitle(b)} · ${typeName(b.raceTypeId)}`,
            money(b.prizeValue ?? 0),
          ]),
        },
      ];
    }
    return [
      ...TIER_GROUPS.map((g) => ({
        title: g.title,
        lines: Array.from({ length: g.count }, (_, i): [string, string] => [
          `${g.label} ${i + 1}`,
          money(Number(r[`${g.prefix}${i + 1}`] ?? 0)),
        ]),
      })),
      {
        title: "Standard show position percentages",
        lines: ((r.standardShowPercentages ?? []) as ShowPercentage[]).map((p): [string, string] => [
          `Place ${p.place ?? "?"}`,
          `${p.percValue ?? 0}%`,
        ]),
      },
      {
        title: "Pool",
        lines: [
          ["Percent for expenses", `${r.bettingCutPercent ?? 0}%`],
          ["Belgian ratio", String(r.belgianRatio ?? 10)],
        ],
      },
    ];
  };

  const current = editing != null && editing !== "new" ? (editing as any) : null;
  const penaltyMode: string | null =
    kind === "fee" && current?.latePenaltyMode && current.latePenaltyMode !== "NONE"
      ? current.latePenaltyMode
      : null;

  return (
    <Screen
      title="Schemes"
      subtitle={`${count} ${kindLabel} scheme${count === 1 ? "" : "s"}`}
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
              <Button label={`New ${kindLabel} scheme`} icon="add" onPress={startNew} />
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
                  {feeRows.map((s) => (
                    <Row
                      key={s.id}
                      title={s.name}
                      subtitle={
                        [
                          `${money(s.entryFee ?? 0)} entry`,
                          `up to ${s.maxBirdCount ?? 0} birds`,
                          s.requirePaymentToRegister ? "pay to register" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      right={`${s.feesCutPercent ?? 0}%`}
                      rightSub="cut"
                      onPress={() => open(s)}
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
                      (s, b) =>
                        s +
                        (b.prizeValue ?? 0) *
                          Math.max(0, (b.toPosition ?? 0) - (b.fromPosition ?? 0) + 1),
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
                        onPress={() => open(p)}
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
                      betRows.reduce((s, b) => s + (b.bettingCutPercent ?? 0), 0) / betRows.length
                    )}%`}
                    basis="47%"
                  />
                </FigureRow>
                <View className="mt-4">
                  <Rows>
                    {betRows.map((b) => {
                      const tiers = TIER_GROUPS.reduce(
                        (n, g) =>
                          n +
                          Array.from({ length: g.count }, (_, i) =>
                            Number(b[`${g.prefix}${i + 1}`] ?? 0)
                          ).filter((v) => v > 0).length,
                        0
                      );
                      return (
                        <Row
                          key={b.id}
                          title={b.name}
                          subtitle={`${tiers} pool tier${tiers === 1 ? "" : "s"} priced · Belgian ratio ${
                            b.belgianRatio ?? 10
                          }`}
                          right={`${b.bettingCutPercent ?? 0}%`}
                          rightSub="for expenses"
                          onPress={() => open(b)}
                        />
                      );
                    })}
                  </Rows>
                </View>
              </View>
            )
          ) : null}
        </>
      )}

      {/* Reading a scheme, for an account that may not change one. */}
      <Sheet
        open={viewing != null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? "Scheme"}
        subtitle="Changing schemes is not part of your access"
      >
        {facts(viewing).map((section) => (
          <View key={section.title}>
            <SubHead>{section.title}</SubHead>
            {section.lines.length === 0 ? (
              <Text className="mt-1 text-xs text-slate-400">None set.</Text>
            ) : (
              <View className="mt-1.5">
                <Rows>
                  {section.lines.map(([label, value], i) => (
                    <Row key={`${label}-${i}`} title={label} right={value} />
                  ))}
                </Rows>
              </View>
            )}
          </View>
        ))}
      </Sheet>

      <Sheet
        open={editing != null && bandAt == null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? `New ${kindLabel} scheme` : `Edit ${kindLabel} scheme`}
        subtitle={current?.name ?? undefined}
      >
        <Field label="Name" value={f.name ?? ""} onChange={set("name")} autoFocus={editing === "new"} />

        {kind === "fee" ? (
          <>
            <Grid>
              <Field
                label="Entry fee ($)"
                value={f.entryFee ?? ""}
                onChange={set("entryFee")}
                keyboard="numeric"
              />
              <Field
                label="Fees cut (%)"
                value={f.feesCutPercent ?? ""}
                onChange={set("feesCutPercent")}
                keyboard="numeric"
              />
              <Field
                label="Min entry fees per team"
                value={f.minEntryFees ?? ""}
                onChange={set("minEntryFees")}
                keyboard="numeric"
              />
            </Grid>
            <Text className="mt-1 text-xs text-slate-400">
              Whole numbers — the portal does not take cents on these.
            </Text>

            <Toggle
              label="Allow entry fee refund when bird is lost"
              value={flags.isRefundable === true}
              onChange={flag("isRefundable")}
            />

            <SubHead>Perch fees</SubHead>
            <Grid>
              {FEE_PERCH.map((p) => (
                <Field
                  key={p.key}
                  label={`${p.label} ($)`}
                  value={f[p.key] ?? ""}
                  onChange={set(p.key)}
                  keyboard="numeric"
                />
              ))}
            </Grid>

            <Toggle
              label="Require payment to register"
              hint="Breeders must pay by PayPal or commit to cash before a registration is accepted. Off, registration succeeds and leaves a pending payment."
              value={flags.requirePaymentToRegister === true}
              onChange={flag("requirePaymentToRegister")}
            />

            <Grid>
              <Field
                label="Maximum number of birds"
                value={f.maxBirdCount ?? ""}
                onChange={set("maxBirdCount")}
                keyboard="numeric"
              />
              <Field
                label="Maximum backup birds"
                value={f.maxBackupBirdCount ?? ""}
                onChange={set("maxBackupBirdCount")}
                keyboard="numeric"
              />
            </Grid>

            <SubHead>Per bird fees</SubHead>
            {birdRows === 0 ? (
              <Text className="mt-1 text-xs text-slate-400">
                Set a maximum number of birds and a fee box appears for each one.
              </Text>
            ) : (
              <>
                <Grid>
                  {Array.from({ length: Math.min(birdRows, BIRD_FEE_ROWS_SHOWN) }, (_, i) => (
                    <Field
                      key={i}
                      label={`Bird ${i + 1} ($)`}
                      value={f[`bird:${i + 1}`] ?? ""}
                      onChange={set(`bird:${i + 1}`)}
                      keyboard="numeric"
                      placeholder="0"
                    />
                  ))}
                </Grid>
                {birdRows > BIRD_FEE_ROWS_SHOWN ? (
                  <Text className="mt-1 text-xs text-slate-400">
                    Showing the first {BIRD_FEE_ROWS_SHOWN} of {birdRows}. The rest are saved at
                    zero unless they already had a fee.
                  </Text>
                ) : null}
              </>
            )}

            <Toggle
              label="Floating backup"
              value={flags.isFloatingBackup === true}
              onChange={flag("isFloatingBackup")}
            />

            <SubHead>Race fee mode</SubHead>
            <View className="mt-1.5 flex-row" style={{ gap: 8 }}>
              {RACE_FEE_MODES.map((m) => (
                <Button
                  key={m.key}
                  label={m.label}
                  tone={raceFeeMode === m.key ? "primary" : "secondary"}
                  onPress={() => setRaceFeeMode(m.key)}
                  full
                />
              ))}
            </View>

            <SubHead>Race type fees</SubHead>
            {typesReq.loading ? (
              <Loading />
            ) : raceTypes.length === 0 ? (
              <Text className="mt-1 text-xs text-slate-400">
                {typesReq.error
                  ? "The race types could not be loaded. The fees this scheme already has are kept as they are."
                  : "No race types are set up."}
              </Text>
            ) : (
              <Grid>
                {raceTypes.map((t) => (
                  <Field
                    key={t.id}
                    label={`${t.name ?? `Type ${t.id}`} ($)`}
                    value={f[`rt:${t.id}`] ?? ""}
                    onChange={set(`rt:${t.id}`)}
                    keyboard="decimal-pad"
                    placeholder="0"
                  />
                ))}
              </Grid>
            )}

            {penaltyMode ? (
              <Notice>
                This scheme carries a late-payment penalty ({penaltyMode.toLowerCase().replace(/_/g, " ")}
                {current?.latePenaltyAmount != null ? `, ${money(current.latePenaltyAmount)}` : ""}
                {current?.latePenaltyCap != null ? `, capped at ${money(current.latePenaltyCap)}` : ""}
                {current?.latePenaltyGraceDays ? `, ${current.latePenaltyGraceDays} grace days` : ""}).
                It is left untouched by a save: the portal does not take penalty settings on this
                form.
              </Notice>
            ) : null}
          </>
        ) : null}

        {kind === "prize" ? (
          <>
            <SubHead
              action={
                <Button
                  label="Add distribution"
                  tone="secondary"
                  icon="add"
                  onPress={() => openBand(-1)}
                />
              }
            >
              Prize distribution
            </SubHead>
            {bands.length === 0 ? (
              <Text className="mt-1 text-xs text-slate-400">
                No bands — this scheme pays nothing yet.
              </Text>
            ) : (
              <View className="mt-1.5">
                <Rows>
                  {bands.map((b, i) => (
                    <Row
                      key={`${b.raceTypeId}-${b.fromPosition}-${i}`}
                      title={bandTitle(b)}
                      subtitle={typesReq.loading ? undefined : typeName(b.raceTypeId)}
                      right={money(b.prizeValue ?? 0)}
                      rightSub="each"
                      onPress={() => openBand(i)}
                    />
                  ))}
                </Rows>
              </View>
            )}
          </>
        ) : null}

        {kind === "betting" ? (
          <>
            {TIER_GROUPS.map((g) => (
              <View key={g.prefix}>
                <SubHead>{g.title}</SubHead>
                <Grid>
                  {Array.from({ length: g.count }, (_, i) => (
                    <Field
                      key={i}
                      label={`${g.label} ${i + 1}`}
                      value={f[`${g.prefix}${i + 1}`] ?? ""}
                      onChange={set(`${g.prefix}${i + 1}`)}
                      keyboard="decimal-pad"
                      placeholder="0"
                    />
                  ))}
                </Grid>

                {g.prefix === "standardShow" ? (
                  <>
                    <SubHead
                      action={
                        <Button
                          label="Add position"
                          tone="secondary"
                          icon="add"
                          onPress={() =>
                            setPercs((prev) => [
                              ...prev,
                              { place: String(prev.length + 1), percValue: "" },
                            ])
                          }
                        />
                      }
                    >
                      Position percentages
                    </SubHead>
                    {percs.length === 0 ? (
                      <Text className="mt-1 text-xs text-slate-400">
                        None set — a standard pool has no split to pay by.
                      </Text>
                    ) : (
                      percs.map((p, i) => (
                        <View key={i} className="flex-row items-end" style={{ gap: 8 }}>
                          <View className="flex-1">
                            <Field
                              label="Place"
                              value={p.place}
                              onChange={(v) =>
                                setPercs((prev) =>
                                  prev.map((x, idx) => (idx === i ? { ...x, place: v } : x))
                                )
                              }
                              keyboard="numeric"
                            />
                          </View>
                          <View className="flex-1">
                            <Field
                              label="Percentage (%)"
                              value={p.percValue}
                              onChange={(v) =>
                                setPercs((prev) =>
                                  prev.map((x, idx) => (idx === i ? { ...x, percValue: v } : x))
                                )
                              }
                              keyboard="decimal-pad"
                              placeholder="0"
                            />
                          </View>
                          <Pressable
                            onPress={() => setPercs((prev) => prev.filter((_, idx) => idx !== i))}
                            hitSlop={8}
                            className="mb-2.5"
                          >
                            <Ionicons name="close-circle" size={22} color="#e11d48" />
                          </Pressable>
                        </View>
                      ))
                    )}
                  </>
                ) : null}
              </View>
            ))}
            <Text className="mt-2 text-xs text-slate-400">
              Each tier figure is what one bet in that pool costs. A tier left at zero is not
              offered.
            </Text>

            <SubHead>Pool</SubHead>
            <Grid>
              <Field
                label="Percent for expenses (%)"
                value={f.bettingCutPercent ?? ""}
                onChange={set("bettingCutPercent")}
                keyboard="decimal-pad"
              />
              <Field
                label="Belgian ratio"
                value={f.belgianRatio ?? ""}
                onChange={set("belgianRatio")}
                keyboard="numeric"
                hint="Ten is the usual."
              />
            </Grid>
          </>
        ) : null}

        <ButtonRow>
          {current ? (
            <Button
              label="Delete"
              tone="danger"
              icon="trash-outline"
              onPress={() => {
                setEditing(null);
                setRemoving({ id: current.id, name: current.name });
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          )}
          <Button
            label={current ? "Update" : "Create"}
            onPress={save}
            pending={action.pending}
            full
          />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={bandAt != null}
        onClose={() => setBandAt(null)}
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
            empty={
              typesReq.error ? "The race types could not be loaded." : "No race types are set up."
            }
          />
        )}
        <Grid>
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
          />
        </Grid>
        <Field
          label="Prize amount, each"
          value={bandForm.prizeValue}
          onChange={(v) => setBandForm({ ...bandForm, prizeValue: v })}
          keyboard="decimal-pad"
          hint="The same position in both boxes for a single place."
        />
        <ButtonRow>
          {bandAt != null && bandAt >= 0 ? (
            <Button
              label="Remove"
              tone="secondary"
              onPress={() => {
                setBands((prev) => prev.filter((_, idx) => idx !== bandAt));
                setBandAt(null);
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setBandAt(null)} full />
          )}
          <Button label={bandAt != null && bandAt >= 0 ? "Done" : "Add"} onPress={saveBand} full />
        </ButtonRow>
        <Text className="mt-2 text-center text-xs text-slate-400">
          Nothing is written until the scheme itself is saved.
        </Text>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Delete ${removing?.name ?? "this scheme"}?`}
        body={`The ${kindLabel} scheme "${removing?.name ?? ""}" and its tables are deleted for good. A scheme a season is still priced by cannot be removed — the portal refuses, and nothing changes.`}
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
