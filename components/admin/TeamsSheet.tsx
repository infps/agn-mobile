import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow, Empty, Field, Loading, Notice, Sheet } from "@/components/admin/ui";

export interface Team {
  id: number;
  name: string | null;
}

/**
 * The lofts one breeder enters under.
 *
 * A team is the name a registration is filed against — a breeder with two lofts
 * has two, and picks one each time they enter an event. So this list is short,
 * and the only things ever done to it are adding a name, fixing a typo in one,
 * and removing one nobody uses.
 *
 * Renaming and removing happen in the row rather than in a second sheet: a
 * sheet on top of a sheet is a stack to climb back out of, for a one-field
 * change.
 *
 * Teams hang off the breeder record, not the account, which is why this takes
 * the numeric breeder id.
 */
export function TeamsSheet({
  open,
  breederId,
  who,
  onClose,
  onPick,
}: {
  open: boolean;
  breederId: number | null;
  who: string;
  onClose: () => void;
  /** When set, tapping a team chooses it — the register screen uses this. */
  onPick?: (name: string) => void;
}) {
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();
  const mayManage = can("breeders.manage");

  const { data, loading, error, reload } = useAdminData<{ teams?: Team[] }>(
    open && breederId != null ? `/admin/team?breederId=${breederId}` : null,
    [open, breederId]
  );
  const teams = data?.teams ?? [];

  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Team | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    if (open) return;
    setName("");
    setRenaming(null);
    setRemoving(null);
  }, [open]);

  const add = async () => {
    const wanted = name.trim();
    if (!wanted) {
      toast.error("Give the team a name.");
      return;
    }
    const { ok } = await action.run(
      "post",
      "/admin/team",
      { name: wanted, breederId },
      { success: "Team added." }
    );
    if (ok) {
      setName("");
      await reload();
      // On the register screen a team is added in order to be used.
      if (onPick) onPick(wanted);
    }
  };

  const rename = async () => {
    if (!renaming) return;
    const wanted = renameTo.trim();
    if (!wanted) {
      toast.error("Give the team a name.");
      return;
    }
    const { ok } = await action.run(
      "put",
      "/admin/team",
      { teamId: renaming.id, name: wanted },
      { success: "Team renamed." }
    );
    if (ok) {
      setRenaming(null);
      reload();
    }
  };

  const remove = async (team: Team) => {
    const { ok } = await action.run(
      "delete",
      "/admin/team",
      { teamId: team.id },
      { success: "Team removed." }
    );
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Teams for ${who}`}
      subtitle={onPick ? "Tap one to register under it" : "The lofts they enter events under"}
    >
      {breederId == null ? (
        <Notice>
          This account has no breeder record yet, so there is nothing to hang a team on. Saving
          the account as a breeder creates one.
        </Notice>
      ) : loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-3" style={{ gap: 8 }}>
            {teams.length === 0 ? (
              <Empty>No teams yet.</Empty>
            ) : (
              teams.map((team) => (
                <View key={team.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  {renaming?.id === team.id ? (
                    <>
                      <Field label="Team name" value={renameTo} onChange={setRenameTo} autoFocus />
                      <ButtonRow>
                        <Button
                          label="Cancel"
                          tone="secondary"
                          onPress={() => setRenaming(null)}
                          full
                        />
                        <Button label="Save" onPress={rename} pending={action.pending} full />
                      </ButtonRow>
                    </>
                  ) : (
                    <View className="flex-row items-center gap-3">
                      <Pressable
                        className="min-w-0 flex-1"
                        disabled={!onPick}
                        onPress={() => onPick?.(team.name ?? "")}
                      >
                        <Text className="text-sm font-medium text-slate-900" numberOfLines={1}>
                          {team.name ?? `Team ${team.id}`}
                        </Text>
                      </Pressable>
                      {mayManage ? (
                        removing === team.id ? (
                          <>
                            <Pressable onPress={() => setRemoving(null)} hitSlop={8}>
                              <Text className="text-xs font-medium text-slate-500">Keep</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => remove(team)}
                              disabled={action.pending}
                              hitSlop={8}
                            >
                              <Text className="text-xs font-semibold text-rose-600">
                                Remove it
                              </Text>
                            </Pressable>
                          </>
                        ) : (
                          <>
                            <Pressable
                              onPress={() => {
                                setRenameTo(team.name ?? "");
                                setRenaming(team);
                              }}
                              hitSlop={8}
                            >
                              <Ionicons name="create-outline" size={18} color="#475569" />
                            </Pressable>
                            <Pressable onPress={() => setRemoving(team.id)} hitSlop={8}>
                              <Ionicons name="trash-outline" size={18} color="#475569" />
                            </Pressable>
                          </>
                        )
                      ) : null}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>

          {mayManage ? (
            <>
              <Field label="New team" value={name} onChange={setName} placeholder="Team name" />
              <ButtonRow>
                <Button label="Add team" icon="add" onPress={add} pending={action.pending} full />
              </ButtonRow>
            </>
          ) : null}
        </>
      )}

      <ButtonRow>
        <Button label="Done" tone="secondary" onPress={onClose} full />
      </ButtonRow>
    </Sheet>
  );
}
