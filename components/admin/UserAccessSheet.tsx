import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
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

export interface ModulePermission {
  code: string;
  label: string;
  description: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  description?: string;
  permissions: ModulePermission[];
}

export interface RoleRow {
  role: string;
  permissions: { code: string; allowed: boolean; explicit: boolean; byDefault: boolean }[];
}

/** One account that carries personal rules, as `/admin/permissions` lists them. */
export interface OverrideRow {
  user: { id: string; name: string | null; lastName: string | null; email: string; role: string };
  permissions: { code: string; allowed: boolean }[];
}

export interface PermissionMatrix {
  modules?: ModuleDef[];
  roles?: RoleRow[];
  overrides?: OverrideRow[];
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
 * The two halves sit behind different permissions, as they do on the server:
 * overrides need `users.permissions`, a role change is an account edit and
 * needs `users.manage`.
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
  const me = usePermissions();
  const [query, setQuery] = useState("");
  const [changingRole, setChangingRole] = useState(false);

  const mayOverride = me.can("users.permissions");
  const mayEditAccount = me.can("users.manage");

  const { data, loading, error, reload } = useAdminData<PermissionMatrix>(
    user && mayOverride ? `/admin/permissions?userId=${user.id}` : null,
    [user?.id, mayOverride]
  );

  const modules = useMemo(() => data?.modules ?? [], [data]);
  const roleRow = useMemo(
    () => (data?.roles ?? []).find((r) => r.role === (user?.role ?? "BREEDER")) ?? null,
    [data, user?.role]
  );
  const overrides = useMemo(
    () => (data?.overrides ?? []).find((o) => o.user.id === user?.id)?.permissions ?? [],
    [data, user?.id]
  );

  const isSuper = user?.role === "SUPERADMIN";

  /**
   * The three layers, resolved the way the server resolves them: an override
   * wins, then whatever the role says, then nothing.
   */
  const stateOf = (code: string): { allowed: boolean; from: "user" | "role" | "none" } => {
    if (isSuper) return { allowed: true, from: "role" };
    const override = overrides.find((o) => o.code === code);
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
      // Changing your own access reshapes your own menus.
      me.refresh();
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
      onChanged();
      // The sheet was opened with the old role, so it cannot show the new
      // defaults honestly. Closing is better than showing stale ones.
      onClose();
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
        {mayEditAccount ? (
          <ButtonRow>
            <Button
              label="Change role"
              tone="secondary"
              icon="swap-horizontal-outline"
              onPress={() => setChangingRole(true)}
              full
            />
          </ButtonRow>
        ) : null}

        {isSuper ? (
          <Notice>
            A super admin bypasses every permission, so there is nothing to override — the
            server refuses to record one.
          </Notice>
        ) : !mayOverride ? (
          <Notice>Granting and revoking individual permissions is not part of your access.</Notice>
        ) : (
          <>
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
                            (state.from === "user"
                              ? state.allowed
                                ? "Granted to this person"
                                : "Revoked from this person"
                              : state.from === "role"
                                ? "From their role"
                                : "Not held") + ` · ${p.code}`
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
              Tap a permission to grant it, tap again to revoke it, once more to hand the
              decision back to their role.
            </Text>
          </>
        )}

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
