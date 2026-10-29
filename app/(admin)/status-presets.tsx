import React, { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
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
  SectionTitle,
  Sheet,
} from "@/components/admin/ui";
import { ColorField, Dot, HEX_COLOR, ToggleRow, isStaff } from "@/components/admin/formBits";

type Trigger = "REGISTER" | "CHECKIN" | "RELEASE" | "ARRIVE" | "LOST" | "INJURED" | "MANUAL";

interface Preset {
  id: number;
  seasonId: number | null;
  code: string;
  label: string;
  color: string | null;
  trigger: Trigger;
  sortOrder: number;
  isActive: boolean;
}

const TRIGGERS: { key: Trigger; label: string; hint: string | null }[] = [
  { key: "REGISTER", label: "Registered", hint: null },
  { key: "CHECKIN", label: "Checked in", hint: null },
  { key: "RELEASE", label: "Released", hint: null },
  { key: "ARRIVE", label: "Arrived", hint: null },
  { key: "LOST", label: "Lost", hint: null },
  { key: "INJURED", label: "Injured", hint: null },
  { key: "MANUAL", label: "Manual", hint: "Never applied automatically" },
];

const triggerLabel = (t: Trigger) => TRIGGERS.find((x) => x.key === t)?.label ?? t;

const BLANK = {
  code: "",
  label: "",
  color: "#94a3b8",
  trigger: "MANUAL" as Trigger,
  sortOrder: "",
  isActive: true,
};

/**
 * The words a season uses for where a bird is — resting, flying, arrived.
 *
 * Each preset names a status, gives it a colour, and says which moment in a
 * bird's race applies it. A new season is seeded with five; this is where an
 * organiser renames "Resting in Inventory" to what their breeders actually
 * say, or adds one of their own to set by hand.
 *
 * Presets belong to a season. The list also shows any that belong to none —
 * system-wide ones that every season falls back to — under their own heading,
 * so that editing one is not mistaken for a change to this season alone.
 *
 * The portal has the routes for this but no page that uses them yet, so the
 * phone is, for now, the only place these can be edited.
 */
export default function StatusPresets() {
  const { eventId, name, seasonId, season } = useLocalSearchParams<{
    eventId?: string;
    name?: string;
    seasonId?: string;
    season?: string;
  }>();
  const { can, role } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  // The routes check both the permission and the role.
  const allowed = can("events.manage") && isStaff(role);

  // With no season handed over, the event's active one is the one in question.
  const seasonsReq = useAdminData<{
    seasons?: { id: number; name: string }[];
    activeSeasonId?: number | null;
  }>(allowed && eventId && !seasonId ? `/admin/event/${eventId}/seasons` : null, [
    eventId,
    seasonId,
    allowed,
  ]);
  const sid = seasonId ? Number(seasonId) : (seasonsReq.data?.activeSeasonId ?? null);
  const seasonName =
    season ?? seasonsReq.data?.seasons?.find((s) => s.id === sid)?.name ?? null;

  const base = eventId ? `/admin/event/${eventId}/status-presets` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    presets?: Preset[];
  }>(allowed && base && sid != null ? `${base}?seasonId=${sid}` : null, [eventId, sid, allowed]);

  const [editing, setEditing] = useState<Preset | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [removing, setRemoving] = useState<Preset | null>(null);

  if (!allowed || forbidden) return <NoAccess what="Status presets" />;

  const presets = data?.presets ?? [];
  const own = presets.filter((p) => p.seasonId != null);
  const shared = presets.filter((p) => p.seasonId == null);

  const startNew = () => {
    setForm({ ...BLANK, sortOrder: String(own.length + 1) });
    setEditing("new");
  };

  const startEdit = (p: Preset) => {
    setForm({
      code: p.code,
      label: p.label,
      color: p.color ?? "",
      trigger: p.trigger,
      sortOrder: String(p.sortOrder ?? 0),
      isActive: p.isActive !== false,
    });
    setEditing(p);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code || !form.label.trim()) {
      toast.error("A status needs a code and a label.");
      return;
    }
    const color = form.color.trim();
    if (color && !HEX_COLOR.test(color)) {
      toast.error("The colour has to be a hex like #3b82f6.");
      return;
    }
    const order = form.sortOrder.trim() === "" ? 0 : parseInt(form.sortOrder.trim(), 10);
    if (isNaN(order)) {
      toast.error("The order has to be a number.");
      return;
    }
    const body = {
      code,
      label: form.label.trim(),
      color: color || null,
      trigger: form.trigger,
      sortOrder: order,
      isActive: form.isActive,
    };
    const { ok } =
      editing === "new"
        ? await action.run("post", base!, { seasonId: sid, ...body }, { success: "Status added." })
        : await action.run("patch", `${base}/${(editing as Preset).id}`, body, {
            success: "Status updated.",
          });
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}/${removing.id}`, undefined, {
      success: "Status removed.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  const row = (p: Preset) => (
    <Row
      key={p.id}
      leading={<Dot color={p.color} />}
      title={p.label}
      subtitle={`${p.code} · ${triggerLabel(p.trigger)}`}
      badge={p.isActive ? null : { label: "off", bg: "bg-slate-200", text: "text-slate-600" }}
      rightSub={`#${p.sortOrder}`}
      onPress={() => startEdit(p)}
    />
  );

  const waiting = loading || seasonsReq.loading;

  return (
    <Screen
      title="Status presets"
      subtitle={[name, seasonName].filter(Boolean).join(" · ") || undefined}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        sid != null ? (
          <ButtonRow>
            <Button label="New status" icon="add" onPress={startNew} />
          </ButtonRow>
        ) : null
      }
    >
      {waiting ? (
        <Loading />
      ) : sid == null ? (
        <View className="mt-4">
          <Empty>This event has no season yet, so there are no statuses to set.</Empty>
        </View>
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4">
            {own.length === 0 ? (
              <Empty>This season has no statuses of its own.</Empty>
            ) : (
              <Rows>{own.map(row)}</Rows>
            )}
          </View>

          {shared.length > 0 ? (
            <>
              <SectionTitle>Shared by every season</SectionTitle>
              <Rows>{shared.map(row)}</Rows>
              <Text className="mt-2 text-xs text-slate-400">
                Changing one of these changes it everywhere.
              </Text>
            </>
          ) : null}
        </>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New status" : "Edit status"}
        subtitle={
          editing !== "new" && editing != null && editing.seasonId == null
            ? "Shared by every season"
            : seasonName
        }
      >
        <Field
          label="Code"
          value={form.code}
          onChange={(v) => setForm({ ...form, code: v })}
          placeholder="RESTING"
          hint="A short key. Saved in capitals."
          autoFocus={editing === "new"}
        />
        <Field
          label="Label"
          value={form.label}
          onChange={(v) => setForm({ ...form, label: v })}
          placeholder="Resting in Inventory"
          hint="What breeders read."
        />
        <ColorField label="Colour" value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
        <Field
          label="Order"
          value={form.sortOrder}
          onChange={(v) => setForm({ ...form, sortOrder: v })}
          keyboard="numeric"
          hint="Lower comes first."
        />
        <ToggleRow
          label="In use"
          hint="Switched off, it stays on record but is no longer applied."
          value={form.isActive}
          onChange={(v) => setForm({ ...form, isActive: v })}
        />

        <Text className="mb-1 mt-4 text-xs font-medium text-slate-600">Applied when</Text>
        <ChoiceList
          choices={TRIGGERS.map((t) => ({ key: t.key, label: t.label, hint: t.hint }))}
          selected={form.trigger}
          onPick={(key) => setForm({ ...form, trigger: key as Trigger })}
        />

        <ButtonRow>
          {editing !== "new" && editing != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const p = editing as Preset;
                setEditing(null);
                setRemoving(p);
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          )}
          <Button label="Save" onPress={save} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Remove ${removing?.label ?? "this status"}?`}
        body="Birds currently showing it lose the status and fall back to none. This cannot be undone."
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
