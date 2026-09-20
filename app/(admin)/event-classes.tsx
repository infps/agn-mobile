import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import api from "@/service/api.service";
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
  paid: number;
  refunded: boolean;
  warnings: string[];
}

interface RaceClass {
  id: number;
  code: string | null;
  description: string | null;
  classFee: number | null;
  payoutType: string | null;
  przEntry: number | null;
  cutPercent: number | null;
  isActive: boolean | null;
  entryCount: number;
  pool: number;
}

/**
 * Optional side-pots people buy into on top of their entry.
 *
 * A class is a fee, a count and a pot, and the pot is the number anybody
 * actually wants — it is what will be paid out. Inactive classes stay listed
 * rather than hidden, because a class that took entries and was then switched
 * off is exactly the thing somebody comes here to check.
 *
 * Settling previews first. A class payout reads the finishing positions the
 * race engine already produced and divides the pot by them, so it is only ever
 * as right as the race behind it — seeing the split before committing is how
 * you catch a race that settled on the wrong result.
 */
export default function EventClasses() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const base = eventId ? `/admin/event/${eventId}/classes` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    classes?: RaceClass[];
  }>(base, [eventId]);

  const [settling, setSettling] = useState(false);
  const [raceId, setRaceId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PayoutResult[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", classFee: "", przEntry: "" });
  const [removing, setRemoving] = useState<RaceClass | null>(null);

  // Only while the settle sheet is open — the race list is irrelevant otherwise.
  const racesReq = useAdminData<{ races?: Race[] }>(
    settling && eventId ? `/admin/race?eventId=${eventId}` : null,
    [settling, eventId]
  );

  const classes = data?.classes ?? [];
  const mayManage = can("classes.manage");
  const maySettle = can("classes.payouts");

  /**
   * A race that has not ended has no finishing positions to divide by, so it is
   * shown greyed with the reason rather than hidden — "my race is missing" is a
   * worse thing to hand somebody than "that race has not ended".
   */
  const raceChoices: Choice[] = useMemo(
    () =>
      (racesReq.data?.races ?? []).map((r) => ({
        key: r.id,
        label: r.name ?? `Race ${r.raceNumber ?? r.id}`,
        hint: r.status.toLowerCase(),
        disabled: r.status !== "ENDED",
        disabledReason: "Not ended yet",
      })),
    [racesReq.data]
  );

  const buildPreview = async (picked: string | number) => {
    setRaceId(Number(picked));
    setPreview(null);
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
    const { ok } = await action.run("post", `${base}/payouts`, { raceId }, {
      success: "Class payouts settled.",
    });
    if (ok) {
      setConfirming(false);
      setSettling(false);
      setPreview(null);
      setRaceId(null);
      reload();
    }
  };

  const create = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) {
      toast.error("Give the class a code.");
      return;
    }
    const fee = parseFloat(form.classFee.trim());
    if (!form.classFee.trim() || isNaN(fee) || fee <= 0) {
      toast.error("The fee has to be a number above zero.");
      return;
    }
    const prz = form.przEntry.trim() ? parseInt(form.przEntry.trim(), 10) : 1;

    const { ok } = await action.run(
      "post",
      base!,
      {
        code,
        description: form.description.trim() || null,
        classFee: fee,
        // One place paid is winner-takes-all; the portal reads it the same way.
        payoutType: prz > 1 ? "PLACES" : "WTA",
        przEntry: prz,
      },
      { success: "Class created." }
    );
    if (ok) {
      setCreating(false);
      setForm({ code: "", description: "", classFee: "", przEntry: "" });
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}?id=${removing.id}`, undefined, {
      success: "Class removed.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  if (forbidden) return <NoAccess what="Classes" />;

  const entries = classes.reduce((s, c) => s + c.entryCount, 0);
  const pool = classes.reduce((s, c) => s + c.pool, 0);

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
              <Button label="New class" icon="add" onPress={() => setCreating(true)} full />
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
              <Empty>No classes have been set up for this season.</Empty>
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
                        c.payoutType ? c.payoutType.toLowerCase().replace(/_/g, " ") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                    right={money(c.pool)}
                    rightSub={`${c.entryCount} entries`}
                    rightTone={c.pool > 0 ? "text-emerald-600" : "text-slate-400"}
                    badge={
                      c.isActive === false
                        ? { label: "off", bg: "bg-slate-200", text: "text-slate-600" }
                        : null
                    }
                    onPress={mayManage ? () => setRemoving(c) : undefined}
                  />
                ))}
              </Rows>
            )}
          </View>
        </>
      )}

      <Sheet
        open={settling}
        onClose={() => {
          setSettling(false);
          setPreview(null);
          setRaceId(null);
        }}
        title={preview ? "What it would pay" : "Settle class payouts"}
        subtitle={preview ? "Nothing has been written yet" : "Pick the race the classes ran on"}
      >
        {preview ? (
          <View className="mt-2">
            {preview.length === 0 ? (
              <Empty>No active class took entries on this race.</Empty>
            ) : (
              <Rows>
                {preview.map((r) => (
                  <Row
                    key={r.raceClassId}
                    title={r.code}
                    subtitle={`${r.entries} entries · ${r.placed} placed${
                      r.refunded ? " · refunded" : ""
                    }`}
                    right={money(r.paid)}
                    rightSub={`of ${money(r.pool)}`}
                    rightTone={r.paid > 0 ? "text-emerald-600" : "text-slate-400"}
                  />
                ))}
              </Rows>
            )}

            {preview.some((r) => (r.warnings ?? []).length > 0) ? (
              <Notice>
                {preview
                  .flatMap((r) => r.warnings ?? [])
                  .slice(0, 3)
                  .join(" · ")}
              </Notice>
            ) : null}

            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setPreview(null)} full />
              <Button
                label="Settle it"
                tone="danger"
                onPress={() => setConfirming(true)}
                disabled={preview.length === 0}
                full
              />
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

      <Sheet open={creating} onClose={() => setCreating(false)} title="New class">
        <Field
          label="Code"
          value={form.code}
          onChange={(v) => setForm({ ...form, code: v })}
          placeholder="AA"
          autoFocus
          hint="Short, and upper case."
        />
        <Field
          label="Description"
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
        />
        <Field
          label="Fee a bird"
          value={form.classFee}
          onChange={(v) => setForm({ ...form, classFee: v })}
          keyboard="decimal-pad"
        />
        <Field
          label="Places paid"
          value={form.przEntry}
          onChange={(v) => setForm({ ...form, przEntry: v })}
          keyboard="numeric"
          hint="One place pays winner takes all."
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setCreating(false)} full />
          <Button label="Create" onPress={create} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={confirming}
        title="Settle these classes?"
        body={`${money(
          (preview ?? []).reduce((s, r) => s + r.paid, 0)
        )} will be written against the entries as won. Settling again after a result changes is how you correct it.`}
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
            ? `It has ${removing?.entryCount} entries. The portal refuses to delete a class that has taken money.`
            : "It has taken no entries, so it can go."
        }
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
