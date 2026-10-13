import React, { useMemo, useState } from "react";
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
  SearchBar,
  Sheet,
} from "@/components/admin/ui";
import { isSuper } from "@/components/admin/formBits";

interface EventType {
  id: number;
  name: string | null;
  description: string | null;
}

/**
 * The kinds of event there are — one loft race, a futurity, a club series.
 *
 * A short reference table that every event points at. It is super-admin
 * territory in the portal and stays so here: the list itself is public, but
 * changing it reshapes the choice every organiser is offered when they make an
 * event, so the whole screen is kept to the people who may change it.
 */
export default function EventTypes() {
  const { can, role } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const allowed = can("events.manage") && isSuper(role);
  const { data, loading, refreshing, error, refresh, reload } = useAdminData<{
    eventTypes?: EventType[];
  }>(allowed ? "/admin/event-type" : null, [allowed]);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EventType | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [removing, setRemoving] = useState<EventType | null>(null);

  const types = useMemo(() => data?.eventTypes ?? [], [data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? types.filter((t) => (t.name ?? "").toLowerCase().includes(q)) : types;
  }, [types, query]);

  if (!allowed) return <NoAccess what="Event types" />;

  const startNew = () => {
    setForm({ name: "", description: "" });
    setEditing("new");
  };

  const startEdit = (t: EventType) => {
    setForm({ name: t.name ?? "", description: t.description ?? "" });
    setEditing(t);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Give the event type a name.");
      return;
    }
    const body = { name: form.name.trim(), description: form.description.trim() };
    const { ok } =
      editing === "new"
        ? await action.run("post", "/admin/event-type", body, { success: "Event type created." })
        : await action.run(
            "put",
            "/admin/event-type",
            { id: (editing as EventType).id, ...body },
            { success: "Event type updated." }
          );
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", "/admin/event-type", { id: removing.id }, {
      success: "Event type deleted.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  return (
    <Screen
      title="Event types"
      subtitle={`${types.length} type${types.length === 1 ? "" : "s"}`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Type name" />
          <ButtonRow>
            <Button label="New event type" icon="add" onPress={startNew} />
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
                {types.length === 0 ? "No event types have been set up." : "No type matches that."}
              </Empty>
            ) : (
              <Rows>
                {shown.map((t) => (
                  <Row
                    key={t.id}
                    title={t.name ?? `Type ${t.id}`}
                    subtitle={t.description || "—"}
                    rightSub={`#${t.id}`}
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
        title={editing === "new" ? "New event type" : "Edit event type"}
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          autoFocus
        />
        <Field
          label="Description"
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
        />
        <ButtonRow>
          {editing !== "new" && editing != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const row = editing as EventType;
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
        body="The server refuses if any event is still of this type. Move those events to another type first."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
