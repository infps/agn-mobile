import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Loading,
  Notice,
  Row,
  Rows,
  SearchBar,
  Sheet,
} from "@/components/admin/ui";

interface ModulePermission {
  code: string;
  label: string;
  description: string;
}

interface ModuleDef {
  key: string;
  label: string;
  permissions: ModulePermission[];
}

interface RoleRow {
  role: string;
  permissions: { code: string; allowed: boolean; explicit: boolean; byDefault: boolean }[];
}

interface UserOverride {
  userId: string;
  permission: string;
  allowed: boolean;
}

export interface AccessUser {
  id: string;
  name: string | null;
  lastName: string | null;
  role: string | null;
}

const ROLES = ["BREEDER", "BETTOR", "ADMIN", "SUPERADMIN"];

/**
 * What one account is allowed to do.
 *
 * Two separate things live here, and keeping them apart is the whole point.
 * The role is a broad stroke — it decides the defaults and it is what makes
 * somebody staff at all. The overrides are surgical: one permission granted or
 * revoked for this person regardless of their role, which is how "this admin
 * does not touch payments" gets expressed.
 *
 * Each permission shows which layer is answering for it, because "why can this
 * person do that" is unanswerable otherwise. A granted permission that came
 * from the role reads differently from one somebody deliberately added, and
 * clearing an override is a third state again — it does not revoke anything, it
 * hands the decision back to the role.
 *
 * Nothing here is a security boundary; the server re-checks every request. It
 * is the place the decision is recorded.
 */
export function UserAccessSheet({
  user,
  onClose,
  onChanged,
}: {
  user: AccessUser | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const action = useAdminAction();
  const [query, setQuery] = useState("");
  const [changingRole, setChangingRole] = useState(false);

  const { data, loading, error, reload } = useAdminData<{
    modules?: ModuleDef[];
    roles?: RoleRow[];
    users?: UserOverride[];
  }>(user ? `/admin/permissions?userId=${user.id}` : null, [user?.id]);

  const modules = useMemo(() => data?.modules ?? [], [data]);
  const roleRow = useMemo(
    () => (data?.roles ?? []).find((r) => r.role === (user?.role ?? "BREEDER")) ?? null,
    [data, user?.role]
  );
  const overrides = useMemo(
    () => (data?.users ?? []).filter((u) => u.userId === user?.id),
    [data, user?.id]
  );

  /**
   * The three layers, resolved the way the server resolves them: an override
   * wins, then whatever the role says, then nothing.
   */
  const stateOf = (code: string): { allowed: boolean; from: "user" | "role" | "none" } => {
    const override = overrides.find((o) => o.permission === code);
    if (override) return { allowed: override.allowed, from: "user" };
    const fromRole = roleRow?.permissions.find((p) => p.code === code);
    if (fromRole?.allowed) return { allowed: true, from: "role" };
    return { allowed: false, from: "none" };
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modules
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) =>
            !q ||
            p.code.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            m.label.toLowerCase().includes(q)
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [modules, query]);

  const setPermission = async (code: string, allowed: boolean | null) => {
    if (!user) return;
    const { ok } = await action.run("post", "/admin/permissions", {
      userId: user.id,
      changes: [{ permission: code, allowed }],
    });
    if (ok) {
      reload();
      onChanged();
    }
  };

  const setRole = async (role: string | number) => {
    if (!user) return;
    const { ok } = await action.run(
      "put",
      "/admin/users",
      { id: user.id, role },
      { success: `Role set to ${String(role).toLowerCase()}.` }
    );
    if (ok) {
      setChangingRole(false);
      reload();
      onChanged();
    }
  };

  const roleChoices: Choice[] = ROLES.map((r) => ({
    key: r,
    label: r.toLowerCase(),
    hint:
      r === "SUPERADMIN"
        ? "Everything, and cannot be locked out of permissions"
        : r === "ADMIN"
          ? "The operational surface, but not user administration"
          : r === "BETTOR"
            ? "Can bet, cannot keep birds"
            : "Keeps birds, no admin access",
  }));

  const who = `${user?.name ?? ""} ${user?.lastName ?? ""}`.trim() || "this account";

  return (
    <>
      <Sheet
        open={user != null && !changingRole}
        onClose={onClose}
        title={who}
        subtitle={`Role: ${(user?.role ?? "breeder").toLowerCase()}`}
      >
        <ButtonRow>
          <Button
            label="Change role"
            tone="secondary"
            icon="swap-horizontal-outline"
            onPress={() => setChangingRole(true)}
            full
          />
        </ButtonRow>

        {user?.role === "SUPERADMIN" ? (
          <Notice>
            A superadmin bypasses every permission, so overrides below have no effect on them.
          </Notice>
        ) : null}

        <View className="mt-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Find a permission" />
        </View>

        {loading ? (
          <Loading />
        ) : error ? (
          <Notice>{error}</Notice>
        ) : (
          rows.map((m) => (
            <View key={m.key}>
              <Text className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {m.label}
              </Text>
              <Rows>
                {m.permissions.map((p) => {
                  const state = stateOf(p.code);
                  return (
                    <Row
                      key={p.code}
                      title={p.label}
                      subtitle={
                        state.from === "user"
                          ? state.allowed
                            ? "Granted to this person"
                            : "Revoked from this person"
                          : state.from === "role"
                            ? "From their role"
                            : "Not held"
                      }
                      right={state.allowed ? "on" : "off"}
                      rightTone={
                        state.from === "user"
                          ? state.allowed
                            ? "text-emerald-600"
                            : "text-rose-600"
                          : state.allowed
                            ? "text-slate-600"
                            : "text-slate-300"
                      }
                      badge={
                        state.from === "user"
                          ? { label: "override", bg: "bg-violet-100", text: "text-violet-700" }
                          : null
                      }
                      onPress={() => {
                        // Cycles through the three states an operator actually
                        // needs: grant it, take it away, or stop having an
                        // opinion and let the role answer.
                        const next =
                          state.from !== "user" ? true : state.allowed ? false : null;
                        setPermission(p.code, next);
                      }}
                    />
                  );
                })}
              </Rows>
            </View>
          ))
        )}

        <Text className="mt-4 text-xs text-slate-400">
          Tap a permission to grant it, tap again to revoke it, once more to hand the decision
          back to their role.
        </Text>

        <ButtonRow>
          <Button label="Done" tone="secondary" onPress={onClose} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={changingRole}
        onClose={() => setChangingRole(false)}
        title={`Role for ${who}`}
        subtitle="Sets the defaults every permission falls back to"
      >
        <ChoiceList choices={roleChoices} selected={user?.role ?? "BREEDER"} onPick={setRole} />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setChangingRole(false)} full />
        </ButtonRow>
      </Sheet>
    </>
  );
}
