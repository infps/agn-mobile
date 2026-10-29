import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { seasonRacesUrl, useChosenSeason } from "@/service/season.service";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { Label, shortBand } from "@/components/admin/raceParts";
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

type PayoutType = "RATIO" | "WTA" | "PLACES";

interface Race {
  id: number;
  name: string | null;
  raceNumber: number | null;
  status: string;
}

/** What settling would pay, per class, before it is allowed to pay it. */
interface PayoutResult {
  raceClassId: number;
  code: string;
  entries: number;
  placed: number;
  pool: number;
  cut: number;
  distributable: number;
  paid: number;
  refunded: boolean;
  rows: { band: string | null; breederName: string | null; position: number | null; payout: number }[];
  warnings: string[];
}

interface RaceClass {
  id: number;
  code: string | null;
  description: string | null;
  classFee: number | null;
  payoutType: PayoutType | null;
  przEntry: number | null;
  cutPercent: number | null;
  isActive: boolean | null;
  entryCount: number;
  pool: number;
}

const PAYOUT_TYPES: Choice[] = [
  { key: "WTA", label: "Winner takes all" },
  { key: "RATIO", label: "Ratio", hint: "One prize per N entries" },
  { key: "PLACES", label: "Places", hint: "Split by percentage" },
];

const describe = (c: RaceClass) =>
  c.payoutType === "WTA"
    ? "winner takes all"
    : c.payoutType === "RATIO"
      ? `${c.przEntry ?? 1} for 1`
      : `top ${c.przEntry ?? 1} places`;

const EMPTY = {
  id: null as number | null,
  code: "",
  description: "",
  classFee: "0",
  payoutType: "WTA" as PayoutType,
  przEntry: "1",
  cutPercent: "",
};

/**
 * Optional side-pots people buy into on top of their entry.
 *
 * A class is a fee, a payout shape and a pot, and the pot is the number anybody
 * actually wants — it is what will be paid out. Closed classes stay listed
 * rather than hidden, because a class that took entries and was then switched
 * off is exactly the thing somebody comes here to check.
 *
 * Settling previews first. A class payout reads the finishing positions the
 * race engine already produced and divides the pot by them, so it is only ever
 * as right as the race behind it — seeing who is paid what before committing is
 * how you catch a race that settled on the wrong result.
 */
export default function EventClasses() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can, canAny } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const base = eventId ? `/admin/event/${eventId}/classes` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    classes?: RaceClass[];
  }>(base, [eventId]);

  const [settling, setSettling] = useState(false);
  const [raceId, setRaceId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PayoutResult[] | null>(null);
  /** True once the figures on screen are what was written, not what would be. */
  const [committed, setCommitted] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [removing, setRemoving] = useState<RaceClass | null>(null);

  // Only while the settle sheet is open — the race list is irrelevant otherwise.
  // The portal's Classes tab lists the selected season's races.
  const chosen = useChosenSeason(eventId);
  const racesReq = useAdminData<{ races?: Race[] }>(
    settling && eventId ? seasonRacesUrl(eventId, chosen) : null,
    [settling, eventId, chosen?.id]
  );

  const classes = data?.classes ?? [];
  const mayManage = can("classes.manage");
  const maySettle = can("classes.payouts");

  /**
   * A race that has not ended has no settled finishing order, but the portal
   * still lets it be previewed — only the commit is refused. So every race can
   * be picked, and the one that cannot be settled says so on the next step.
   */
  const raceChoices: Choice[] = useMemo(
    () =>
      (racesReq.data?.races ?? []).map((r) => ({
        key: r.id,
        label: r.name || `Race ${r.raceNumber ?? r.id}`,
        hint: r.status === "ENDED" ? "ended" : `${r.status.toLowerCase()} — preview only`,
      })),
    [racesReq.data]
  );
  const race = (racesReq.data?.races ?? []).find((r) => r.id === raceId) ?? null;

  const closeSettle = () => {
    setSettling(false);
    setPreview(null);
    setRaceId(null);
    setCommitted(false);
  };

  const buildPreview = async (picked: string | number) => {
    setRaceId(Number(picked));
    setPreview(null);
    setCommitted(false);
    setPreviewing(true);
    try {
      const { data: got } = await api.get(`${base}/payouts?raceId=${picked}`);
      setPreview(got?.results ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Could not work out the payouts.");
    } finally {
      setPreviewing(false);
    }
  };

  const commit = async () => {
    if (raceId == null) return;
    const { ok, data: said } = await action.run<{ results?: PayoutResult[]; message?: string }>(
      "post",
      `${base}/payouts`,
      { raceId }
    );
    setConfirming(false);
    if (ok) {
      toast.success(said?.message ?? "Class payouts settled.");
      // What was written stays on screen, as it does in the portal.
      setPreview(said?.results ?? preview);
      setCommitted(true);
      reload();
    }
  };

  const startEdit = (c: RaceClass) => {
    setForm({
      id: c.id,
      code: c.code ?? "",
      description: c.description ?? "",
      classFee: String(c.classFee ?? 0),
      payoutType: c.payoutType ?? "WTA",
      przEntry: String(c.przEntry ?? 1),
      cutPercent: c.cutPercent == null ? "" : String(c.cutPercent),
    });
    setEditing(true);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) {
      toast.error("Give the class a letter.");
      return;
    }
    const fee = Number(form.classFee.trim());
    if (isNaN(fee) || fee < 0) {
      toast.error("The fee has to be a number.");
      return;
    }
    const cut = form.cutPercent.trim() === "" ? null : Number(form.cutPercent.trim());
    if (cut != null && (isNaN(cut) || cut < 0 || cut > 100)) {
      toast.error("The house cut is a percentage between 0 and 100.");
      return;
    }

    const { ok, data: said } = await action.run<{ message?: string }>("post", base!, {
      ...(form.id != null ? { id: form.id } : {}),
      code,
      description: form.description.trim() || null,
      classFee: fee,
      payoutType: form.payoutType,
      // Winner-takes-all pays one bird; the server forces it too.
      przEntry: form.payoutType === "WTA" ? 1 : Math.max(1, parseInt(form.przEntry, 10) || 1),
      cutPercent: cut,
    });
    if (ok) {
      toast.success(said?.message ?? "Class saved.");
      setEditing(false);
      setForm({ ...EMPTY });
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    // The reply matters: a class with birds in it is closed, not deleted, and
    // the server's sentence is the one that says which happened.
    const { ok, data: said } = await action.run<{ message?: string }>(
      "delete",
      `${base}?id=${removing.id}`
    );
    if (ok) {
      toast.success(said?.message ?? "Class removed.");
      reload();
    }
    setRemoving(null);
  };

  if (!canAny("classes.view", "classes.manage") || forbidden) return <NoAccess what="Classes" />;

  const entries = classes.reduce((s, c) => s + c.entryCount, 0);
  const pool = classes.reduce((s, c) => s + c.pool, 0);
  const canCommit = race?.status === "ENDED";

  return (
    <Screen
      title="Classes"
      subtitle={name ? `${name} · ${classes.length} classes` : `${classes.length} classes`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        mayManage || maySettle ? (
          <ButtonRow>
            {mayManage ? (
              <Button
                label="New class"
                icon="add"
                onPress={() => {
                  setForm({ ...EMPTY });
                  setEditing(true);
                }}
                full
              />
            ) : null}
            {maySettle ? (
              <Button
                label="Settle payouts"
                tone="danger"
                icon="cash-outline"
                onPress={() => setSettling(true)}
                full
              />
            ) : null}
          </ButtonRow>
        ) : null
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Classes" value={classes.length} basis="31%" />
            <Figure label="Entries" value={entries} basis="31%" />
            <Figure label="In the pot" value={money(pool)} tone="text-emerald-600" basis="31%" />
          </FigureRow>

          <View className="mt-4">
            {classes.length === 0 ? (
              <Empty>No classes in this season yet. Add one — A, B, C and so on.</Empty>
            ) : (
              <Rows>
                {classes.map((c) => (
                  <Row
                    key={c.id}
                    title={c.code ?? `Class ${c.id}`}
                    subtitle={
                      [
                        c.description,
                        c.classFee != null ? `${money(c.classFee)} a bird` : null,
                        describe(c),
                        c.cutPercent != null ? `${c.cutPercent}% cut` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                    right={money(c.pool)}
                    rightSub={`${c.entryCount} birds`}
                    rightTone={c.pool > 0 ? "text-emerald-600" : "text-slate-400"}
                    badge={
                      c.isActive === false
                        ? { label: "closed", bg: "bg-slate-200", text: "text-slate-600" }
                        : null
                    }
                    onPress={mayManage ? () => startEdit(c) : undefined}
                  />
                ))}
              </Rows>
            )}
          </View>
        </>
      )}

      <Sheet
        open={settling && !confirming}
        onClose={closeSettle}
        title={
          committed ? "What was paid" : preview ? "What it would pay" : "Settle classes against a race"
        }
        subtitle={
          committed
            ? "Written onto the class entries"
            : preview
              ? "Nothing has been written yet"
              : "Classes use the finishing order the race has already produced"
        }
      >
        {preview ? (
          <View className="mt-2">
            {preview.length === 0 ? (
              <Empty>No active class took entries on this race.</Empty>
            ) : (
              preview.map((p) => {
                const winners = (p.rows ?? []).filter((r) => r.payout > 0);
                return (
                  <View key={p.raceClassId} className="mb-3">
                    <Rows>
                      <Row
                        title={`Class ${p.code}`}
                        subtitle={`${p.entries} entries · pool ${money(p.pool)} · cut ${money(p.cut)}`}
                        right={money(p.paid)}
                        rightSub="paying"
                        rightTone={p.paid > 0 ? "text-emerald-600" : "text-slate-400"}
                        badge={
                          p.refunded
                            ? { label: "refund", bg: "bg-amber-100", text: "text-amber-700" }
                            : null
                        }
                      />
                      {winners.map((r, index) => (
                        <Row
                          key={`${r.band}-${index}`}
                          leading={
                            <Text className="w-8 text-xs font-medium text-slate-400">
                              #{r.position ?? "—"}
                            </Text>
                          }
                          title={shortBand(r.band) || "No band"}
                          subtitle={r.breederName}
                          right={money(r.payout)}
                        />
                      ))}
                    </Rows>
                    {(p.warnings ?? []).map((w) => (
                      <Notice key={w}>{w}</Notice>
                    ))}
                  </View>
                );
              })
            )}

            {!committed && !canCommit ? (
              <Notice>Class payouts can only be settled once the race has ended.</Notice>
            ) : null}

            <ButtonRow>
              <Button
                label={committed ? "Done" : "Back"}
                tone="secondary"
                onPress={committed ? closeSettle : () => setPreview(null)}
                full
              />
              {!committed ? (
                <Button
                  label="Settle it"
                  tone="danger"
                  onPress={() => setConfirming(true)}
                  disabled={preview.length === 0 || !canCommit}
                  full
                />
              ) : null}
            </ButtonRow>
          </View>
        ) : racesReq.loading || previewing ? (
          <Loading />
        ) : (
          <ChoiceList
            choices={raceChoices}
            onPick={buildPreview}
            selected={raceId}
            empty="This event has no races yet."
          />
        )}
      </Sheet>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={form.id != null ? `Edit class ${form.code}` : "New class"}
      >
        <Field
          label="Letter"
          value={form.code}
          onChange={(v) => setForm({ ...form, code: v.toUpperCase().slice(0, 12) })}
          placeholder="A"
          autoFocus={form.id == null}
        />
        <Field
          label="Description"
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
          placeholder="$20 - 10 for 1"
        />
        <Field
          label="Fee"
          value={form.classFee}
          onChange={(v) => setForm({ ...form, classFee: v })}
          keyboard="decimal-pad"
        />

        <Label>Payout</Label>
        <ChoiceList
          choices={PAYOUT_TYPES}
          selected={form.payoutType}
          onPick={(k) =>
            setForm({
              ...form,
              payoutType: k as PayoutType,
              przEntry: k === "WTA" ? "1" : form.przEntry,
            })
          }
        />

        {form.payoutType !== "WTA" ? (
          <Field
            label={form.payoutType === "RATIO" ? "Entries per prize" : "Places paid"}
            value={form.przEntry}
            onChange={(v) => setForm({ ...form, przEntry: v })}
            keyboard="numeric"
          />
        ) : null}
        <Field
          label="House cut %"
          value={form.cutPercent}
          onChange={(v) => setForm({ ...form, cutPercent: v })}
          keyboard="decimal-pad"
          placeholder="from betting scheme"
          hint="Left empty, the season's betting scheme decides."
        />

        <ButtonRow>
          {form.id != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const target = classes.find((c) => c.id === form.id) ?? null;
                setEditing(false);
                setRemoving(target);
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setEditing(false)} full />
          )}
          <Button
            label={form.id != null ? "Save changes" : "Add class"}
            onPress={save}
            pending={action.pending}
            full
          />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={confirming}
        title="Settle these classes?"
        body={`${money(
          (preview ?? []).reduce((s, r) => s + r.paid, 0)
        )} will be written against the entries as won, with each bird's position. Settling again after a result changes is how you correct it.`}
        confirmLabel="Settle"
        pending={action.pending}
        onConfirm={commit}
        onCancel={() => setConfirming(false)}
      />

      <Confirm
        open={removing != null}
        title={`Remove class ${removing?.code ?? ""}?`}
        body={
          (removing?.entryCount ?? 0) > 0
            ? `It has ${removing?.entryCount} birds entered, so it will be closed to new entries rather than deleted — what breeders paid stays on record.`
            : "It has taken no entries, so it is deleted outright."
        }
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
