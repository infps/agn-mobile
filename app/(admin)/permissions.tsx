import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { Chips } from "@/components/admin/Chips";
import {
  type AccessUser,
  type PermissionMatrix,
  UserAccessSheet,
} from "@/components/admin/UserAccessSheet";
import {
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  SectionTitle,
} from "@/components/admin/ui";

interface UserOption {
  id: string;
  name: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
}

type RoleScope = "ADMIN" | "BREEDER" | "BETTOR";

/** The roles a rule can be written for. Super admin is a bypass, not a rule set. */
const SCOPES: { key: RoleScope; label: string }[] = [
  { key: "ADMIN", label: "Admin" },
  { key: "BREEDER", label: "Breeder" },
  { key: "BETTOR", label: "Bettor" },
];

const who = (u: UserOption) => `${u.name ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Unnamed";

/**
 * What each role can do, and who has been made an exception to it.
 *
 * Every rule has three states, because two would not be enough: a rule has to
 * be able to take away something the built-in default grants, and that is a
 * different thing from never granting it. Tapping cycles default → allowed →
 * denied → default, the same order the portal's matrix uses.
 *
 * A role rule changes what everybody holding that role can do the moment it is
 * saved, which is why the row says where its answer is coming from: "allowed by
 * default" can be left alone, "denied" is somebody's decision.
 *
 * One person's exceptions open in their own sheet — the same one the account
 * list uses — so there is a single place a personal override is ever edited.
 */
export default function AdminPermissions() {
  const me = usePermissions();
  const action = useAdminAction();
  const mayAssign = me.can("users.permissions");

  const [scope, setScope] = useState<RoleScope>("ADMIN");
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState("");
  const [editing, setEditing] = useState<AccessUser | null>(null);

  const matrix = useAdminData<PermissionMatrix>(mayAssign ? "/admin/permissions" : null, [
    mayAssign,
  ]);
  // The account list is an admin-role endpoint. If it refuses, the people who
  // already carry overrides are still reachable from the list below.
  const people = useAdminData<{ users?: UserOption[] }>(mayAssign ? "/admin/users" : null, [
    mayAssign,
  ]);

  const modules = useMemo(() => matrix.data?.modules ?? [], [matrix.data]);
  const overrides = matrix.data?.overrides ?? [];
  const roleRow = (matrix.data?.roles ?? []).find((r) => r.role === scope) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return modules;
    return modules
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) =>
            p.code.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            m.label.toLowerCase().includes(q)
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [modules, search]);

  const candidates = useMemo(() => {
    const q = person.trim().toLowerCase();
    if (!q) return [];
    return (people.data?.users ?? [])
      .filter((u) => u.role !== "SUPERADMIN" && !u.id.startsWith("legacy-"))
      .filter((u) => who(u).toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [people.data, person]);

  if (!mayAssign || matrix.forbidden) return <NoAccess what="Assigning permissions" />;

  const setRule = async (code: string, allowed: boolean | null) => {
    const { ok } = await action.run("post", "/admin/permissions", {
      role: scope,
      changes: [{ permission: code, allowed }],
    });
    if (ok) {
      matrix.reload();
      // A change to your own role reshapes your own menus.
      me.refresh();
    }
  };

  return (
    <Screen
      title="Permissions"
      subtitle="Set what a role can do, then override it for one person where you need to"
      onRefresh={matrix.refresh}
      refreshing={matrix.refreshing}
      header={
        <>
          <Chips label="Applies to role" options={SCOPES} value={scope} onChange={setScope} />
          <View className="mt-3">
            <SearchBar value={search} onChange={setSearch} placeholder="payments, races.manage…" />
          </View>
        </>
      }
    >
      {matrix.loading ? (
        <Loading />
      ) : (
        <>
          {matrix.error ? <Notice>{matrix.error}</Notice> : null}

          <Text className="mt-3 text-xs text-slate-400">
            Tap a rule to allow it, again to deny it, once more to hand it back to the default. A
            rule can take access away as well as give it.
          </Text>

          {visible.map((m) => (
            <View key={m.key}>
              <Text className="mt-5 text-sm font-semibold text-slate-900">{m.label}</Text>
              {m.description ? (
                <Text className="mb-2 text-xs text-slate-500">{m.description}</Text>
              ) : (
                <View className="mb-2" />
              )}
              <Rows>
                {m.permissions.map((p) => {
                  const rule = roleRow?.permissions.find((r) => r.code === p.code);
                  const explicit = rule?.explicit ?? false;
                  const allowed = rule?.allowed ?? false;
                  return (
                    <Row
                      key={p.code}
                      title={p.label}
                      subtitle={`${p.code} · ${p.description}`}
                      right={
                        explicit
                          ? allowed
                            ? "allowed"
                            : "denied"
                          : allowed
                            ? "on by default"
                            : "off by default"
                      }
                      rightTone={
                        explicit
                          ? allowed
                            ? "text-emerald-600"
                            : "text-rose-600"
                          : allowed
                            ? "text-slate-600"
                            : "text-slate-300"
                      }
                      badge={
                        explicit
                          ? allowed
                            ? { label: "granted", bg: "bg-emerald-100", text: "text-emerald-700" }
                            : { label: "revoked", bg: "bg-rose-100", text: "text-rose-700" }
                          : null
                      }
                      onPress={() => setRule(p.code, !explicit ? true : allowed ? false : null)}
                    />
                  );
                })}
              </Rows>
            </View>
          ))}

          <SectionTitle>People with personal overrides</SectionTitle>
          {overrides.length === 0 ? (
            <Empty>Nobody has one. Everybody follows their role.</Empty>
          ) : (
            <Rows>
              {overrides.map((o) => (
                <Row
                  key={o.user.id}
                  title={who(o.user)}
                  subtitle={o.user.role.toLowerCase()}
                  right={`${o.permissions.filter((p) => p.allowed).length} granted`}
                  rightSub={`${o.permissions.filter((p) => !p.allowed).length} revoked`}
                  onPress={() => setEditing(o.user)}
                />
              ))}
            </Rows>
          )}

          <SectionTitle>Override for one person</SectionTitle>
          {people.forbidden ? (
            <Notice>
              The account list is not part of your access, so a new person cannot be picked from
              here. Anybody listed above can still be opened.
            </Notice>
          ) : (
            <>
              <SearchBar value={person} onChange={setPerson} placeholder="Find by name or email" />
              {person.trim() ? (
                <View className="mt-2">
                  {candidates.length === 0 ? (
                    <Empty>
                      Nobody matches. Super admins are left out — they bypass permissions.
                    </Empty>
                  ) : (
                    <Rows>
                      {candidates.map((u) => (
                        <Row
                          key={u.id}
                          title={who(u)}
                          subtitle={u.email ?? undefined}
                          right={(u.role ?? "breeder").toLowerCase()}
                          onPress={() => setEditing(u)}
                        />
                      ))}
                    </Rows>
                  )}
                </View>
              ) : null}
            </>
          )}
        </>
      )}

      <UserAccessSheet
        user={editing}
        onClose={() => setEditing(null)}
        onChanged={() => {
          matrix.reload();
          people.reload();
        }}
      />
    </Screen>
  );
}
