import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
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
  SearchBar,
  Sheet,
} from "@/components/admin/ui";
import { ColorField, Dot, HEX_COLOR, ToggleRow, isSuper } from "@/components/admin/formBits";

type PrizeRole = "NONE" | "FINAL" | "HOTSPOT_1" | "HOTSPOT_2" | "HOTSPOT_3" | "AVERAGE";

interface RaceType {
  id: number;
  name: string | null;
  color: string | null;
  isPaymentRequired: boolean;
  prizeRole?: PrizeRole | null;
}

const ROLES: { key: PrizeRole; label: string; hint: string }[] = [
  { key: "NONE", label: "No prize", hint: "Races of this type never carry prize money" },
  { key: "FINAL", label: "Final race", hint: "Pays from the season final prize scheme" },
  { key: "HOTSPOT_1", label: "Hot spot 1", hint: "Pays from the hot spot 1 prize scheme" },
  { key: "HOTSPOT_2", label: "Hot spot 2", hint: "Pays from the hot spot 2 prize scheme" },
  { key: "HOTSPOT_3", label: "Hot spot 3", hint: "Pays from the hot spot 3 prize scheme" },
  { key: "AVERAGE", label: "Average winner", hint: "Pays from the average prize scheme" },
];

const roleLabel = (role?: PrizeRole | null) =>
  ROLES.find((r) => r.key === (role ?? "NONE"))?.label ?? "No prize";

const BLANK = { name: "", color: "#1d4ed8", isPaymentRequired: false, prizeRole: "NONE" as PrizeRole };

/**
 * The kinds of race a season is built from — trainers, hot spots, the final.
 *
 * A race type does more than label a race. Its prize role decides which of the
 * season's prize schemes a race of that type pays from, and whether it pays at
 * all; "payment required" is what puts an unpaid entry on the defaulters list
 * a week before the race. So a change here moves money on races that already
 * exist, which is why it is kept to super admins, as in the portal.
 *
 * Every save sends all four fields. The server writes the ones it is not given
 * back to their defaults, so a request that carried only a new name would
 * quietly strip the type's prize role.
 */
export default function RaceTypes() {
  const { can, role } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const allowed = can("schemes.manage") && isSuper(role);
  const { data, loading, refreshing, error, refresh, reload } = useAdminData<{
    raceTypes?: RaceType[];
  }>(allowed ? "/admin/race-type" : null, [allowed]);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RaceType | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [removing, setRemoving] = useState<RaceType | null>(null);

  const types = useMemo(() => data?.raceTypes ?? [], [data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? types.filter((t) => (t.name ?? "").toLowerCase().includes(q)) : types;
  }, [types, query]);

  if (!allowed) return <NoAccess what="Race types" />;

  const startNew = () => {
    setForm(BLANK);
    setEditing("new");
  };

  const startEdit = (t: RaceType) => {
    setForm({
      name: t.name ?? "",
      color: t.color ?? "#1d4ed8",
      isPaymentRequired: t.isPaymentRequired === true,
      prizeRole: t.prizeRole ?? "NONE",
    });
    setEditing(t);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Give the race type a name.");
      return;
    }
    const color = form.color.trim();
    if (color && !HEX_COLOR.test(color)) {
      toast.error("The colour has to be a hex like #1d4ed8.");
      return;
    }
    const body = {
      name: form.name.trim(),
      color: color || null,
      isPaymentRequired: form.isPaymentRequired,
      prizeRole: form.prizeRole,
    };
    const { ok } =
      editing === "new"
        ? await action.run("post", "/admin/race-type", body, { success: "Race type created." })
        : await action.run(
            "put",
            "/admin/race-type",
            { id: (editing as RaceType).id, ...body },
            { success: "Race type updated." }
          );
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", "/admin/race-type", { id: removing.id }, {
      success: "Race type deleted.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  return (
    <Screen
      title="Race types"
      subtitle={`${types.length} type${types.length === 1 ? "" : "s"}`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Type name" />
          <ButtonRow>
            <Button label="New race type" icon="add" onPress={startNew} />
          </ButtonRow>
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}
          <View className="mt-4">
            {shown.length === 0 ? (
              <Empty>
                {types.length === 0 ? "No race types have been set up." : "No type matches that."}
              </Empty>
            ) : (
              <Rows>
                {shown.map((t) => (
                  <Row
                    key={t.id}
                    leading={<Dot color={t.color} />}
                    title={t.name ?? `Type ${t.id}`}
                    subtitle={[roleLabel(t.prizeRole), t.color, `#${t.id}`].filter(Boolean).join(" · ")}
                    badge={
                      t.isPaymentRequired
                        ? { label: "payment required", bg: "bg-rose-100", text: "text-rose-700" }
                        : null
                    }
                    onPress={() => startEdit(t)}
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
        title={editing === "new" ? "New race type" : "Edit race type"}
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          autoFocus
        />
        <ColorField
          label="Colour"
          value={form.color}
          onChange={(v) => setForm({ ...form, color: v })}
          hint="Used to colour stations of this type on the map."
        />
        <ToggleRow
          label="Payment required"
          hint="Triggers defaulter detection seven days before the race."
          value={form.isPaymentRequired}
          onChange={(v) => setForm({ ...form, isPaymentRequired: v })}
        />

        <Text className="mb-1 mt-4 text-xs font-medium text-slate-600">Prize</Text>
        <ChoiceList
          choices={ROLES.map((r) => ({ key: r.key, label: r.label, hint: r.hint }))}
          selected={form.prizeRole}
          onPick={(key) => setForm({ ...form, prizeRole: key as PrizeRole })}
        />
        <Text className="mt-2 text-xs text-slate-400">
          A final race ranks only birds whose entry fee is paid, and splits a drop's prizes evenly;
          hot spot races rank only birds that paid a hot spot fee.
        </Text>

        <ButtonRow>
          {editing !== "new" && editing != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const row = editing as RaceType;
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
        title={`Delete ${removing?.name ?? "this type"}?`}
        body="The server refuses while races, stations or schemes still use this type. This cannot be undone."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
