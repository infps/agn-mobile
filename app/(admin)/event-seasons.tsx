import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { chooseSeason } from "@/service/season.service";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
  Sheet,
} from "@/components/admin/ui";
import { GroupLabel, PickRow, ToggleRow, isStaff, isSuper, isYmd, ymd } from "@/components/admin/formBits";

interface Season {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  feeSchemeId?: number | null;
  bettingSchemeId?: number | null;
  finalPrizeSchemeId?: number | null;
  hotSpot1PrizeSchemeId?: number | null;
  hotSpot2PrizeSchemeId?: number | null;
  hotSpot3PrizeSchemeId?: number | null;
  hotSpotAvgPrizeSchemeId?: number | null;
}

interface Scheme {
  id: number;
  name: string | null;
}

/** The seven scheme slots a season has, and which bank each draws from. */
const SLOTS = [
  { key: "feeSchemeId", label: "Fee scheme", bank: "fee" },
  { key: "bettingSchemeId", label: "Betting scheme", bank: "betting" },
  { key: "finalPrizeSchemeId", label: "Final prize", bank: "prize" },
  { key: "hotSpot1PrizeSchemeId", label: "Hot spot 1 prize", bank: "prize" },
  { key: "hotSpot2PrizeSchemeId", label: "Hot spot 2 prize", bank: "prize" },
  { key: "hotSpot3PrizeSchemeId", label: "Hot spot 3 prize", bank: "prize" },
  { key: "hotSpotAvgPrizeSchemeId", label: "Hot spot average prize", bank: "prize" },
] as const;

type SlotKey = (typeof SLOTS)[number]["key"];

type Form = { name: string; startDate: string; endDate: string } & Record<SlotKey, number | null>;

const BLANK: Form = {
  name: "",
  startDate: "",
  endDate: "",
  feeSchemeId: null,
  bettingSchemeId: null,
  finalPrizeSchemeId: null,
  hotSpot1PrizeSchemeId: null,
  hotSpot2PrizeSchemeId: null,
  hotSpot3PrizeSchemeId: null,
  hotSpotAvgPrizeSchemeId: null,
};

/** What a copy can carry across, with the portal's defaults. */
const COPY_OPTIONS = [
  { key: "schemes", label: "Schemes", hint: "Fee, betting and all five prize scheme assignments", on: true },
  { key: "stations", label: "Liberation stations", hint: "With their race-type links", on: true },
  { key: "races", label: "Race schedule", hint: "Type, number, name, station and distance — no results", on: true },
  { key: "prizeValues", label: "Prize values", hint: "What each band actually pays this season", on: true },
  { key: "statusPresets", label: "Status presets", hint: "Configurable display statuses", on: true },
  { key: "raceNumbers", label: "Race number ranges", hint: "Per number group", on: true },
  { key: "averageConfigs", label: "Average configs", hint: "Remapped onto the copied races", on: true },
  { key: "calcutta", label: "Calcutta settings", hint: "Reset to the setup phase", on: false },
  { key: "registrations", label: "Registration roster", hint: "Breeders and their birds, repriced — no payments", on: false },
] as const;

type CopyKey = (typeof COPY_OPTIONS)[number]["key"];

const COPY_DEFAULTS = Object.fromEntries(COPY_OPTIONS.map((o) => [o.key, o.on])) as Record<
  CopyKey,
  boolean
>;

const span = (s: Season) => `${ymd(s.startDate)} → ${ymd(s.endDate)}`;

/**
 * An event's seasons — the phone's version of the portal's season selector.
 *
 * The portal keeps a dropdown in the event header and a "Manage seasons"
 * dialog behind it. Here they are one screen: the list is the dropdown, and
 * tapping a season opens what can be done with it.
 *
 * The season that matters is the active one, because that is what every
 * section of the event reads from. So "make active" is the switch that changes
 * what the rest of the app shows, and it asks first — it moves everybody, not
 * just the person tapping.
 *
 * Who may do what is uneven on purpose, and follows the server exactly: editing
 * and copying need the events permission; opening, activating, trimming and
 * deleting are for super admins alone. Those four answer a wrong role with a
 * sign-out rather than a refusal, so they are hidden rather than offered.
 *
 * Copying is the usual way a new year starts. It carries configuration only —
 * results, payments, bets, baskets and groups never come across — and defaults
 * to the same window a year on, which is nearly always what is wanted.
 */
export default function EventSeasons() {
  const params = useLocalSearchParams<{
    eventId?: string;
    name?: string;
    open?: string;
    start?: string;
    end?: string;
  }>();
  const { eventId, name } = params;
  const { can, canAny, role } = usePermissions();
  const toast = useToast();
  const router = useRouter();
  const action = useAdminAction();

  const base = eventId ? `/admin/event/${eventId}/seasons` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    seasons?: Season[];
    activeSeasonId?: number | null;
  }>(base, [eventId]);
  const seasons = data?.seasons ?? [];

  const mayManage = can("events.manage");
  const superAdmin = isSuper(role);
  const maySchemes = canAny("schemes.view", "schemes.manage");

  const [acting, setActing] = useState<Season | null>(null);
  const [editing, setEditing] = useState<Season | "new" | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [picking, setPicking] = useState<SlotKey | null>(null);
  const [cloning, setCloning] = useState<Season | null>(null);
  const [copy, setCopy] = useState({ name: "", startDate: "", endDate: "", activate: false });
  const [include, setInclude] = useState(COPY_DEFAULTS);
  const [copyNotes, setCopyNotes] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<{
    kind: "activate" | "trim" | "delete";
    season: Season;
  } | null>(null);

  // The banks put names to the scheme ids a season carries, and fill the pickers.
  const feeBank = useAdminData<{ feeSchemes?: Scheme[] }>(
    maySchemes ? "/admin/fee-scheme" : null,
    [maySchemes]
  );
  const betBank = useAdminData<{ bettingSchemes?: Scheme[] }>(
    maySchemes ? "/admin/betting-scheme" : null,
    [maySchemes]
  );
  const prizeBank = useAdminData<{ prizeSchemes?: Scheme[] }>(
    maySchemes ? "/admin/prize-scheme" : null,
    [maySchemes]
  );
  const bank = {
    fee: feeBank.data?.feeSchemes ?? [],
    betting: betBank.data?.bettingSchemes ?? [],
    prize: prizeBank.data?.prizeSchemes ?? [],
  };
  const schemeName = (kind: keyof typeof bank, id?: number | null) =>
    id == null ? null : (bank[kind].find((s) => s.id === id)?.name ?? `#${id}`);

  // Arriving from a just-created event: go straight to opening its first season.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || params.open !== "new" || !superAdmin) return;
    opened.current = true;
    setForm({
      ...BLANK,
      name: "Season 1",
      startDate: params.start ?? "",
      endDate: params.end ?? "",
    });
    setEditing("new");
  }, [params.open, params.start, params.end, superAdmin]);

  if (forbidden || !canAny("events.view", "events.manage")) {
    return <NoAccess what="Seasons" />;
  }

  const startNew = () => {
    setForm(BLANK);
    setPicking(null);
    setEditing("new");
  };

  const startEdit = (s: Season) => {
    setForm({
      name: s.name,
      startDate: ymd(s.startDate),
      endDate: ymd(s.endDate),
      feeSchemeId: s.feeSchemeId ?? null,
      bettingSchemeId: s.bettingSchemeId ?? null,
      finalPrizeSchemeId: s.finalPrizeSchemeId ?? null,
      hotSpot1PrizeSchemeId: s.hotSpot1PrizeSchemeId ?? null,
      hotSpot2PrizeSchemeId: s.hotSpot2PrizeSchemeId ?? null,
      hotSpot3PrizeSchemeId: s.hotSpot3PrizeSchemeId ?? null,
      hotSpotAvgPrizeSchemeId: s.hotSpotAvgPrizeSchemeId ?? null,
    });
    setPicking(null);
    setActing(null);
    setEditing(s);
  };

  const startClone = (s: Season) => {
    // The same window one year on — the usual case.
    const shift = (iso: string) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    };
    const nextYear = new Date(s.startDate).getFullYear() + 1;
    setCopy({
      name: `${s.name.replace(/\d{4}/, "").trim() || s.name} ${nextYear}`.trim(),
      startDate: shift(s.startDate),
      endDate: shift(s.endDate),
      activate: false,
    });
    setInclude(COPY_DEFAULTS);
    setActing(null);
    setCloning(s);
  };

  const datesOk = (start: string, end: string) => {
    if (!isYmd(start) || !isYmd(end)) {
      toast.error("Both dates have to be written YYYY-MM-DD.");
      return false;
    }
    if (end.trim() < start.trim()) {
      toast.error("A season cannot end before it starts.");
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Give the season a name.");
      return;
    }
    if (!datesOk(form.startDate, form.endDate)) return;

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      startDate: form.startDate.trim(),
      endDate: form.endDate.trim(),
    };
    // Without the scheme banks the pickers are not shown, so the slots are left
    // out entirely — sending them empty would unassign what is there.
    if (maySchemes) {
      for (const slot of SLOTS) body[slot.key] = form[slot.key] != null ? String(form[slot.key]) : null;
    }

    const { ok } =
      editing === "new"
        ? await action.run("post", base!, body, { success: "Season opened. It is now the active one." })
        : await action.run("patch", `${base}/${(editing as Season).id}`, body, {
            success: "Season updated.",
          });
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const runClone = async () => {
    if (!cloning) return;
    if (!copy.name.trim()) {
      toast.error("Give the new season a name.");
      return;
    }
    if (!datesOk(copy.startDate, copy.endDate)) return;

    const { ok, data: said } = await action.run<{
      message?: string;
      summary?: { skipped?: string[] };
    }>("post", `${base}/${cloning.id}/clone`, {
      name: copy.name.trim(),
      startDate: copy.startDate.trim(),
      endDate: copy.endDate.trim(),
      activate: copy.activate,
      include,
    });
    if (ok) {
      // The server says what it copied, which is worth more than "done".
      toast.success(said?.message ?? "Season copied.");
      setCopyNotes(said?.summary?.skipped ?? []);
      setCloning(null);
      reload();
    }
  };

  const runConfirmed = async () => {
    if (!confirming) return;
    const { kind, season } = confirming;
    const path = `${base}/${season.id}`;

    if (kind === "activate") {
      const { ok } = await action.run("patch", `${path}/activate`, {}, {
        success: `${season.name} is now the active season.`,
      });
      if (ok) reload();
    } else if (kind === "delete") {
      const { ok } = await action.run("delete", path, undefined, { success: "Season deleted." });
      if (ok) reload();
    } else {
      const { ok, data: said } = await action.run<{ deletedCount?: number }>(
        "post",
        `${path}/trim-images`
      );
      if (ok) {
        const n = said?.deletedCount ?? 0;
        toast.success(n === 0 ? "Nothing to trim." : `${n} photo${n === 1 ? "" : "s"} removed.`);
      }
    }
    setConfirming(null);
  };

  const ask = (kind: "activate" | "trim" | "delete", season: Season) => {
    setActing(null);
    setConfirming({ kind, season });
  };

  const pickingSlot = SLOTS.find((s) => s.key === picking) ?? null;
  const pickChoices: Choice[] = pickingSlot
    ? [
        { key: "none", label: "None" },
        ...bank[pickingSlot.bank].map((s) => ({ key: s.id, label: s.name ?? `#${s.id}` })),
      ]
    : [];

  const confirmText = confirming
    ? confirming.kind === "activate"
      ? {
          title: `Make ${confirming.season.name} the active season?`,
          body: "Every section of this event — birds, races, money — switches to reading from it, for everybody. The current active season is stood down, not deleted.",
          label: "Make active",
          tone: "primary" as const,
        }
      : confirming.kind === "delete"
        ? {
            title: `Delete ${confirming.season.name}?`,
            body: "This cannot be undone. A season that still has races or entries under it will be refused by the server.",
            label: "Delete",
            tone: "danger" as const,
          }
        : {
            title: `Trim photos for ${confirming.season.name}?`,
            body: "For each bird and each photo type, only the earliest and the latest photo are kept. Everything in between is deleted for good. Meant for a season that has finished.",
            label: "Trim",
            tone: "danger" as const,
          }
    : null;

  const eventQuery = `eventId=${eventId}&name=${encodeURIComponent(String(name ?? ""))}`;

  return (
    <Screen
      title="Seasons"
      subtitle={name ? `${name} · ${seasons.length}` : `${seasons.length}`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        superAdmin ? (
          <ButtonRow>
            <Button label="New season" icon="add" onPress={startNew} />
          </ButtonRow>
        ) : null
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}
          {copyNotes.map((note, i) => (
            <Notice key={i}>{note}</Notice>
          ))}

          <View className="mt-4">
            {seasons.length === 0 ? (
              <Empty>This event has no season, so its sections have nothing to show.</Empty>
            ) : (
              <Rows>
                {seasons.map((s) => (
                  <Row
                    key={s.id}
                    title={s.name}
                    subtitle={
                      [
                        span(s),
                        schemeName("fee", s.feeSchemeId),
                        schemeName("betting", s.bettingSchemeId),
                        schemeName("prize", s.finalPrizeSchemeId),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    }
                    badge={
                      s.isActive
                        ? { label: "active", bg: "bg-emerald-100", text: "text-emerald-700" }
                        : { label: "inactive", bg: "bg-slate-100", text: "text-slate-500" }
                    }
                    onPress={() => setActing(s)}
                  />
                ))}
              </Rows>
            )}
          </View>

          <Text className="mt-3 text-xs text-slate-400">
            Every section of the event reads from the active season.
          </Text>
        </>
      )}

      {/* What can be done with one season. */}
      <Sheet
        open={acting != null}
        onClose={() => setActing(null)}
        title={acting?.name ?? ""}
        subtitle={acting ? `${span(acting)} · ${acting.isActive ? "active" : "inactive"}` : undefined}
      >
        {acting ? (
          <>
            <Rows>
              <Row title="Fee scheme" right={schemeName("fee", acting.feeSchemeId) ?? "—"} />
              <Row title="Betting scheme" right={schemeName("betting", acting.bettingSchemeId) ?? "—"} />
              <Row title="Final prize" right={schemeName("prize", acting.finalPrizeSchemeId) ?? "—"} />
              <Row title="Hot spot 1" right={schemeName("prize", acting.hotSpot1PrizeSchemeId) ?? "—"} />
              <Row title="Hot spot 2" right={schemeName("prize", acting.hotSpot2PrizeSchemeId) ?? "—"} />
              <Row title="Hot spot 3" right={schemeName("prize", acting.hotSpot3PrizeSchemeId) ?? "—"} />
              <Row
                title="Hot spot average"
                right={schemeName("prize", acting.hotSpotAvgPrizeSchemeId) ?? "—"}
              />
            </Rows>

            <View className="mt-3" style={{ gap: 8 }}>
              <Button
                label="Work in this season"
                icon="swap-horizontal-outline"
                onPress={() => {
                  // Every section of the event then reads and writes this
                  // season, as the portal's selector makes its tabs do.
                  chooseSeason(String(eventId), { id: acting.id, name: acting.name ?? null });
                  setActing(null);
                  router.back();
                }}
              />
              {can("events.view") ? (
                <Button
                  label="See its figures"
                  tone="secondary"
                  icon="stats-chart-outline"
                  onPress={() => {
                    const id = acting.id;
                    setActing(null);
                    router.push(`/(admin)/event-settings?${eventQuery}&seasonId=${id}` as never);
                  }}
                />
              ) : null}
              {mayManage ? (
                <>
                  <Button
                    label="Edit"
                    tone="secondary"
                    icon="create-outline"
                    onPress={() => startEdit(acting)}
                  />
                  <Button
                    label="Copy into a new season"
                    tone="secondary"
                    icon="copy-outline"
                    onPress={() => startClone(acting)}
                  />
                </>
              ) : null}
              {mayManage && isStaff(role) ? (
                <>
                  <Button
                    label="Status presets"
                    tone="secondary"
                    icon="color-palette-outline"
                    onPress={() => {
                      const id = acting.id;
                      setActing(null);
                      router.push(
                        `/(admin)/status-presets?${eventQuery}&seasonId=${id}&season=${encodeURIComponent(
                          acting.name
                        )}` as never
                      );
                    }}
                  />
                </>
              ) : null}
              {mayManage && superAdmin ? (
                <>
                  {!acting.isActive ? (
                    <Button
                      label="Make active"
                      icon="checkmark-circle-outline"
                      onPress={() => ask("activate", acting)}
                    />
                  ) : null}
                  <Button
                    label="Trim photos"
                    tone="secondary"
                    icon="images-outline"
                    onPress={() => ask("trim", acting)}
                  />
                </>
              ) : null}
              {superAdmin ? (
                <Button
                  label={acting.isActive ? "The active season cannot be deleted" : "Delete"}
                  tone="secondary"
                  icon="trash-outline"
                  disabled={acting.isActive}
                  onPress={() => ask("delete", acting)}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </Sheet>

      {/* New and edit share a form; the scheme pick takes the sheet over. */}
      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={pickingSlot ? pickingSlot.label : editing === "new" ? "New season" : "Edit season"}
        subtitle={
          pickingSlot
            ? undefined
            : editing === "new"
              ? "Opening a season makes it the active one"
              : undefined
        }
      >
        {pickingSlot ? (
          <>
            <ChoiceList
              choices={pickChoices}
              selected={form[pickingSlot.key] ?? "none"}
              onPick={(key) => {
                setForm({ ...form, [pickingSlot.key]: key === "none" ? null : Number(key) });
                setPicking(null);
              }}
            />
            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setPicking(null)} full />
            </ButtonRow>
          </>
        ) : (
          <>
            <Field
              label="Name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="2026"
            />
            <Field
              label="Starts"
              value={form.startDate}
              onChange={(v) => setForm({ ...form, startDate: v })}
              placeholder="YYYY-MM-DD"
            />
            <Field
              label="Ends"
              value={form.endDate}
              onChange={(v) => setForm({ ...form, endDate: v })}
              placeholder="YYYY-MM-DD"
            />

            <GroupLabel>Schemes</GroupLabel>
            {maySchemes ? (
              SLOTS.map((slot) => (
                <PickRow
                  key={slot.key}
                  label={slot.label}
                  value={schemeName(slot.bank, form[slot.key])}
                  onPress={() => setPicking(slot.key)}
                />
              ))
            ) : (
              <Notice>
                Schemes are not part of your access, so the ones assigned to this season are left
                as they are.
              </Notice>
            )}

            <ButtonRow>
              <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
              <Button
                label={editing === "new" ? "Open it" : "Save"}
                onPress={save}
                pending={action.pending}
                full
              />
            </ButtonRow>
          </>
        )}
      </Sheet>

      <Sheet
        open={cloning != null}
        onClose={() => setCloning(null)}
        title="Copy season"
        subtitle={`From ${cloning?.name ?? "this season"} — configuration only`}
      >
        <Text className="mt-2 text-xs text-slate-500">
          Results, payments, bets, baskets and groups are never copied, and copied races start with
          no times or weather.
        </Text>
        <Field
          label="New season name"
          value={copy.name}
          onChange={(v) => setCopy({ ...copy, name: v })}
        />
        <Field
          label="Starts"
          value={copy.startDate}
          onChange={(v) => setCopy({ ...copy, startDate: v })}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label="Ends"
          value={copy.endDate}
          onChange={(v) => setCopy({ ...copy, endDate: v })}
          placeholder="YYYY-MM-DD"
        />

        <GroupLabel>What to copy</GroupLabel>
        {COPY_OPTIONS.map((o) => (
          <ToggleRow
            key={o.key}
            label={o.label}
            hint={o.hint}
            value={include[o.key]}
            onChange={(v) => setInclude({ ...include, [o.key]: v })}
          />
        ))}

        <GroupLabel>Afterwards</GroupLabel>
        <ToggleRow
          label="Make this the active season"
          hint="The current active season for this event is stood down."
          value={copy.activate}
          onChange={(v) => setCopy({ ...copy, activate: v })}
        />

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setCloning(null)} full />
          <Button label="Copy season" onPress={runClone} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={confirming != null}
        title={confirmText?.title ?? ""}
        body={confirmText?.body ?? ""}
        confirmLabel={confirmText?.label ?? "Confirm"}
        tone={confirmText?.tone ?? "danger"}
        pending={action.pending}
        onConfirm={runConfirmed}
        onCancel={() => setConfirming(null)}
      />
    </Screen>
  );
}
