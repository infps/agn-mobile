import React, { useState } from "react";
import { View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
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
import { ColorField, Dot, HEX_COLOR, isSuper } from "@/components/admin/formBits";

interface StatusCode {
  id: number;
  code: number;
  label: string;
  color: string | null;
}

/** The two the portal offers to load, for a system that has none yet. */
const DEFAULTS = [
  { code: 999, label: "Dead", color: "#ef4444" },
  { code: 777, label: "Injured", color: "#f97316" },
];

const BLANK = { code: "", label: "", color: "#6b7280" };

/**
 * The position numbers that mean something other than a position.
 *
 * A result row carries a finishing position, and a few reserved numbers stand
 * for a condition instead: when a bird's position matches a code here, the
 * label is shown in place of the number — 999 reads "Dead". The same codes are
 * what a loft group can be tied to.
 *
 * This is the portal's Schema page, and like it, is for super admins only.
 */
export default function BirdStatusCodes() {
  const { can, role } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const allowed = isSuper(role) && can("users.permissions");
  const { data, loading, refreshing, error, refresh, reload } = useAdminData<{
    codes?: StatusCode[];
  }>(allowed ? "/admin/bird-status-codes" : null, [allowed]);
  const codes = data?.codes ?? [];

  const [editing, setEditing] = useState<StatusCode | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [removing, setRemoving] = useState<StatusCode | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  if (!allowed) return <NoAccess what="Bird status codes" />;

  const startEdit = (c: StatusCode) => {
    setForm({ code: String(c.code), label: c.label, color: c.color ?? "#6b7280" });
    setEditing(c);
  };

  const save = async () => {
    const code = parseInt(form.code.trim(), 10);
    if (isNaN(code) || code <= 0 || String(code) !== form.code.trim()) {
      toast.error("The code has to be a whole number above zero.");
      return;
    }
    if (!form.label.trim()) {
      toast.error("Give the code a label.");
      return;
    }
    const color = form.color.trim();
    if (color && !HEX_COLOR.test(color)) {
      toast.error("The colour has to be a hex like #ef4444.");
      return;
    }
    const body = { code, label: form.label.trim(), ...(color ? { color } : {}) };
    const { ok } =
      editing === "new"
        ? await action.run("post", "/admin/bird-status-codes", body, { success: "Code created." })
        : await action.run(
            "put",
            "/admin/bird-status-codes",
            { id: (editing as StatusCode).id, ...body },
            { success: "Code updated." }
          );
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", "/admin/bird-status-codes", { id: removing.id }, {
      success: "Code deleted.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  const loadDefaults = async () => {
    const have = new Set(codes.map((c) => c.code));
    const missing = DEFAULTS.filter((d) => !have.has(d.code));
    if (missing.length === 0) {
      toast.info("The defaults are already here.");
      return;
    }
    setLoadingDefaults(true);
    let added = 0;
    // One at a time: the action guards against overlapping calls.
    for (const d of missing) {
      const { ok } = await action.run("post", "/admin/bird-status-codes", d);
      if (!ok) break;
      added += 1;
    }
    setLoadingDefaults(false);
    if (added > 0) {
      toast.success(`${added} default code${added === 1 ? "" : "s"} added.`);
      reload();
    }
  };

  return (
    <Screen
      title="Bird status codes"
      subtitle="Positions that stand for a condition"
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <ButtonRow>
          <Button
            label="New code"
            icon="add"
            onPress={() => {
              setForm(BLANK);
              setEditing("new");
            }}
          />
          <Button
            label="Load defaults"
            tone="secondary"
            icon="refresh-outline"
            onPress={loadDefaults}
            pending={loadingDefaults}
          />
        </ButtonRow>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}
          <View className="mt-4">
            {codes.length === 0 ? (
              <Empty>No codes yet. The defaults are 999 for dead and 777 for injured.</Empty>
            ) : (
              <Rows>
                {codes.map((c) => (
                  <Row
                    key={c.id}
                    leading={<Dot color={c.color} />}
                    title={c.label}
                    subtitle={c.color ?? undefined}
                    right={String(c.code)}
                    rightSub="position"
                    onPress={() => startEdit(c)}
                  />
                ))}
              </Rows>
            )}
          </View>
        </>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New code" : "Edit code"}
        subtitle="Shown in results in place of the position"
      >
        <Field
          label="Code"
          value={form.code}
          onChange={(v) => setForm({ ...form, code: v })}
          keyboard="numeric"
          placeholder="999"
          autoFocus
        />
        <Field
          label="Label"
          value={form.label}
          onChange={(v) => setForm({ ...form, label: v })}
          placeholder="Dead"
        />
        <ColorField label="Colour" value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
        <ButtonRow>
          {editing !== "new" && editing != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const row = editing as StatusCode;
                setEditing(null);
                setRemoving(row);
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
        title={`Delete code ${removing?.code ?? ""} (${removing?.label ?? ""})?`}
        body="Results that carry this position go back to showing the bare number."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
