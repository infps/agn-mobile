import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
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
} from "@/components/admin/ui";

interface Vaccination {
  id: number;
  name: string | null;
  vaccinationDate: string | null;
  notes: string | null;
}

interface Member {
  id: number;
  bird: { id: number; band: string | null; color: string | null } | null;
  eventInventory?: { loft: string | null } | null;
}

interface Group {
  id: number;
  name: string | null;
  type: string | null;
  hasCapacity: boolean | null;
  capacity: number | null;
  statusCode?: { code: string | null; label: string | null; color: string | null } | null;
  _count?: { members?: number; vaccinations?: number };
  vaccinations?: Vaccination[];
  members?: Member[];
}

/**
 * Loft sections, and what has been done to the birds in them.
 *
 * Groups matter mostly as an answer to "where is this bird and has it had its
 * shots", so each one opens in place to show its vaccination record and its
 * members rather than pushing to another screen. Expanding beats navigating
 * when you are comparing two sections.
 *
 * Moving birds is the reason this screen exists on a phone rather than only in
 * the portal: it is done standing at the loft with the birds in front of you.
 * Two ways in, because both happen — pick a bird off the list and choose where
 * it goes, or hold a scanner over the tags and let each read move one.
 */

/** A group that cannot take another bird, and why — so the row can say so. */
function full(group: Group): string | null {
  if (!group.hasCapacity || group.capacity == null) return null;
  const count = group._count?.members ?? group.members?.length ?? 0;
  return count >= group.capacity ? `Full (${count}/${group.capacity})` : null;
}

export default function EventGroups() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [open, setOpen] = useState<number | null>(null);

  const base = eventId ? `/admin/event/${eventId}/groups` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    groups?: Group[];
  }>(base, [eventId]);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const mayManage = can("groups.manage");

  /* --- Moving one bird, picked off a member list --- */
  const [moving, setMoving] = useState<{ item: Member; fromGroupId: number } | null>(null);

  /* --- Moving by tag, for a scanner held over a basket --- */
  const [scanInto, setScanInto] = useState<Group | null>(null);
  const [tag, setTag] = useState("");
  const tagRef = useRef<TextInput>(null);

  /* --- Creating and editing a section --- */
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [form, setForm] = useState({ name: "", capacity: "" });

  /* --- Recording a vaccination against a section --- */
  const [vaccinating, setVaccinating] = useState<Group | null>(null);
  const [shot, setShot] = useState({ vaccineName: "", vet: "", batchNo: "", notes: "" });

  const [removing, setRemoving] = useState<Group | null>(null);

  const done = () => {
    reload();
  };

  const moveTargets: Choice[] = useMemo(() => {
    if (!moving) return [];
    return groups
      .filter((g) => g.id !== moving.fromGroupId)
      .map((g) => {
        const why = full(g);
        const count = g._count?.members ?? g.members?.length ?? 0;
        return {
          key: g.id,
          label: g.name ?? `Group ${g.id}`,
          hint: `${count} birds${g.hasCapacity && g.capacity ? ` of ${g.capacity}` : ""}`,
          disabled: why != null,
          disabledReason: why,
        };
      });
  }, [groups, moving]);

  const move = async (toGroupId: string | number) => {
    if (!moving) return;
    const band = moving.item.bird?.band ?? "That bird";
    const { ok } = await action.run("post", `${base}/move`, {
      eventInventoryItemId: moving.item.id,
      toGroupId,
    });
    if (ok) {
      toast.success(`${band} moved.`);
      setMoving(null);
      done();
    }
  };

  /**
   * One tag, one move. The field keeps focus and clears itself so a wedge
   * scanner can work down a basket untouched — the same arrangement the
   * check-in screen uses, for the same reason.
   *
   * A bird already in the target is reported as a fact rather than an error:
   * re-reading a tag you have just read is the normal way to lose your place,
   * not a mistake worth a red toast.
   */
  const scanMove = async () => {
    const rfid = tag.trim();
    if (!rfid || !scanInto || action.pending) return;

    const { ok } = await action.run("post", `${base}/scan-move`, {
      rfid,
      targetGroupId: scanInto.id,
    });
    if (ok) toast.success(`${rfid} → ${scanInto.name ?? `Group ${scanInto.id}`}`);
    setTag("");
    tagRef.current?.focus();
    if (ok) done();
  };

  const saveGroup = async () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      toast.error("Give the section a name.");
      return;
    }
    const capacity = form.capacity.trim() ? parseInt(form.capacity.trim(), 10) : null;
    if (form.capacity.trim() && (capacity == null || isNaN(capacity) || capacity <= 0)) {
      toast.error("Capacity has to be a number above zero.");
      return;
    }

    const body = {
      name: trimmed,
      hasCapacity: capacity != null,
      ...(capacity != null ? { capacity } : {}),
    };

    const { ok } =
      editing === "new"
        ? await action.run("post", base!, { ...body, type: "LOFT" }, { success: "Section created." })
        : await action.run("patch", `${base}/${(editing as Group).id}`, body, {
            success: "Section updated.",
          });

    if (ok) {
      setEditing(null);
      done();
    }
  };

  const saveShot = async () => {
    if (!vaccinating) return;
    if (!shot.vaccineName.trim()) {
      toast.error("Name the vaccine.");
      return;
    }
    const { ok } = await action.run(
      "post",
      `${base}/${vaccinating.id}/vaccinations`,
      {
        vaccineName: shot.vaccineName.trim(),
        // Recorded against today: this is logged at the loft as it is given.
        vaccinationDate: new Date().toISOString(),
        vet: shot.vet.trim() || null,
        batchNo: shot.batchNo.trim() || null,
        notes: shot.notes.trim() || null,
      },
      { success: `Recorded for ${vaccinating.name ?? "the section"}.` }
    );
    if (ok) {
      setVaccinating(null);
      setShot({ vaccineName: "", vet: "", batchNo: "", notes: "" });
      done();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}/${removing.id}`, undefined, {
      success: "Section deleted.",
    });
    if (ok) {
      setRemoving(null);
      done();
    }
  };

  if (forbidden) return <NoAccess what="Groups" />;

  const members = groups.reduce((s, g) => s + (g._count?.members ?? g.members?.length ?? 0), 0);
  const shots = groups.reduce((s, g) => s + (g._count?.vaccinations ?? g.vaccinations?.length ?? 0), 0);

  return (
    <Screen
      title="Groups"
      subtitle={name ? `${name} · ${groups.length} sections` : `${groups.length} sections`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        mayManage ? (
          <ButtonRow>
            <Button
              label="New section"
              icon="add"
              onPress={() => {
                setForm({ name: "", capacity: "" });
                setEditing("new");
              }}
            />
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
            <Figure label="Sections" value={groups.length} basis="31%" />
            <Figure label="Birds placed" value={members} basis="31%" />
            <Figure label="Vaccinations" value={shots} basis="31%" />
          </FigureRow>

          <View className="mt-4" style={{ gap: 10 }}>
            {groups.length === 0 ? (
              <Empty>No groups have been created for this season.</Empty>
            ) : (
              groups.map((group) => {
                const count = group._count?.members ?? group.members?.length ?? 0;
                const isOpen = open === group.id;
                return (
                  <View
                    key={group.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : group.id)}
                      className="flex-row items-center gap-3 px-4 py-3"
                    >
                      <View className="flex-1">
                        <Text className="font-medium text-slate-900">
                          {group.name ?? `Group ${group.id}`}
                        </Text>
                        <Text className="text-xs text-slate-500">
                          {count} birds
                          {group.hasCapacity && group.capacity ? ` of ${group.capacity}` : ""}
                          {group.type ? ` · ${group.type.toLowerCase()}` : ""}
                        </Text>
                      </View>
                      {group.statusCode?.label ? (
                        <View className="rounded-full bg-slate-100 px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-slate-600">
                            {group.statusCode.label}
                          </Text>
                        </View>
                      ) : null}
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#94a3b8"
                      />
                    </Pressable>

                    {isOpen && (
                      <View className="border-t border-slate-100 px-4 py-3">
                        {mayManage ? (
                          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                            <Button
                              label="Scan birds in"
                              icon="scan-outline"
                              onPress={() => {
                                setScanInto(group);
                                setTag("");
                              }}
                            />
                            <Button
                              label="Vaccination"
                              tone="secondary"
                              icon="medkit-outline"
                              onPress={() => setVaccinating(group)}
                            />
                            <Button
                              label="Edit"
                              tone="secondary"
                              icon="create-outline"
                              onPress={() => {
                                setForm({
                                  name: group.name ?? "",
                                  capacity: group.capacity != null ? String(group.capacity) : "",
                                });
                                setEditing(group);
                              }}
                            />
                            <Button
                              label="Delete"
                              tone="secondary"
                              icon="trash-outline"
                              onPress={() => setRemoving(group)}
                            />
                          </View>
                        ) : null}

                        <Text className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Vaccinations
                        </Text>
                        {(group.vaccinations ?? []).length === 0 ? (
                          <Text className="text-xs text-slate-500">Nothing recorded.</Text>
                        ) : (
                          (group.vaccinations ?? []).slice(0, 8).map((v) => (
                            <Text key={v.id} className="text-xs text-slate-600">
                              {v.name ?? "Vaccination"}
                              {v.vaccinationDate
                                ? ` · ${new Date(v.vaccinationDate).toLocaleDateString()}`
                                : ""}
                            </Text>
                          ))
                        )}

                        <Text className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Birds
                        </Text>
                        {(group.members ?? []).length === 0 ? (
                          <Text className="text-xs text-slate-500">Empty.</Text>
                        ) : (
                          <Rows>
                            {(group.members ?? []).slice(0, 40).map((m) => (
                              <Row
                                key={m.id}
                                title={m.bird?.band ?? "No band"}
                                subtitle={
                                  [m.bird?.color, m.eventInventory?.loft]
                                    .filter(Boolean)
                                    .join(" · ") || undefined
                                }
                                right={mayManage ? "Move" : undefined}
                                rightTone="text-cyan-600"
                                onPress={
                                  mayManage
                                    ? () => setMoving({ item: m, fromGroupId: group.id })
                                    : undefined
                                }
                              />
                            ))}
                          </Rows>
                        )}
                        {(group.members ?? []).length > 40 && (
                          <Text className="mt-2 text-xs text-slate-400">
                            Showing 40 of {(group.members ?? []).length}.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      <Sheet
        open={moving != null}
        onClose={() => setMoving(null)}
        title={`Move ${moving?.item.bird?.band ?? "bird"}`}
        subtitle="Pick the section it goes to"
      >
        <ChoiceList choices={moveTargets} onPick={move} empty="There is nowhere else to put it." />
      </Sheet>

      <Sheet
        open={scanInto != null}
        onClose={() => setScanInto(null)}
        title={`Scan into ${scanInto?.name ?? "section"}`}
        subtitle="Every read moves that bird here"
      >
        <View className="mt-2">
          <TextInput
            ref={tagRef}
            value={tag}
            onChangeText={setTag}
            onSubmitEditing={scanMove}
            placeholder="Hold the scanner over a tag"
            placeholderTextColor="#94a3b8"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            className="rounded-lg border-2 border-cyan-600 bg-white px-3 py-3 text-base text-slate-900"
          />
          <ButtonRow>
            <Button
              label="Move it"
              onPress={scanMove}
              pending={action.pending}
              disabled={!tag.trim()}
              full
            />
          </ButtonRow>
        </View>
      </Sheet>

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New section" : "Edit section"}
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Section A"
          autoFocus
        />
        <Field
          label="Capacity"
          value={form.capacity}
          onChange={(v) => setForm({ ...form, capacity: v })}
          placeholder="Leave empty for no limit"
          keyboard="numeric"
          hint="A section with a limit refuses birds once it is full."
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button label="Save" onPress={saveGroup} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={vaccinating != null}
        onClose={() => setVaccinating(null)}
        title="Record a vaccination"
        subtitle={`Against ${vaccinating?.name ?? "this section"}, dated today`}
      >
        <Field
          label="Vaccine"
          value={shot.vaccineName}
          onChange={(v) => setShot({ ...shot, vaccineName: v })}
          placeholder="Paramyxovirus"
          autoFocus
        />
        <Field label="Vet" value={shot.vet} onChange={(v) => setShot({ ...shot, vet: v })} />
        <Field
          label="Batch number"
          value={shot.batchNo}
          onChange={(v) => setShot({ ...shot, batchNo: v })}
        />
        <Field
          label="Notes"
          value={shot.notes}
          onChange={(v) => setShot({ ...shot, notes: v })}
          multiline
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setVaccinating(null)} full />
          <Button label="Record" onPress={saveShot} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Delete ${removing?.name ?? "this section"}?`}
        body={
          (removing?._count?.members ?? removing?.members?.length ?? 0) > 0
            ? `It still holds ${removing?._count?.members ?? removing?.members?.length} birds. They will need placing somewhere else.`
            : "The section will be removed from this season."
        }
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
