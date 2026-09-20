import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { UserAccessSheet } from "@/components/admin/UserAccessSheet";
import { UserEditSheet } from "@/components/admin/UserEditSheet";
import {
  Button,
  ButtonRow,
  Empty,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  Truncated,
} from "@/components/admin/ui";

interface User {
  id: string;
  name: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
  approvalStatus: string | null;
  city: string | null;
  state: string | null;
  createdAt: string | null;
}

type Tab = "pending" | "all";

/**
 * Accounts, and the one decision worth making from a phone.
 *
 * Approving a sign-up is a yes-or-no with no configuration behind it, which is
 * exactly the kind of thing that should not wait for somebody to get back to a
 * desk — a breeder who cannot get in on the morning of an event is a phone call
 * either way.
 *
 * Roles and permissions are reachable from the full list rather than the
 * pending one, because they are a different job: approving decides whether
 * somebody gets in at all, assigning decides what they can do once they are.
 * Mixing the two into one screen is how an approval turns into an accidental
 * promotion.
 *
 * Pending comes first because that is the list with work in it.
 */
export default function AdminUsers() {
  const { can } = usePermissions();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [accessFor, setAccessFor] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const canAssign = can("users.permissions");
  const canEdit = can("users.manage");

  const pending = useAdminData<{ users?: User[]; counts?: Record<string, number> }>(
    "/admin/users/approval?status=PENDING"
  );
  const all = useAdminData<{ users?: User[] }>("/admin/users");

  const source = tab === "pending" ? pending : all;
  const users = source.data?.users ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const who = `${u.name ?? ""} ${u.lastName ?? ""}`.toLowerCase();
      return who.includes(q) || (u.email ?? "").toLowerCase().includes(q);
    });
  }, [users, query]);

  if (source.forbidden || (!can("users.view") && !can("users.manage"))) {
    return <NoAccess what="User accounts" />;
  }

  const decide = (user: User, approve: boolean) => {
    const who = `${user.name ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "this account";
    Alert.alert(
      approve ? "Approve account" : "Decline account",
      approve
        ? `${who} will be able to sign in and enter events.`
        : `${who} will not be able to sign in.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: approve ? "Approve" : "Decline",
          style: approve ? "default" : "destructive",
          onPress: async () => {
            setBusy(user.id);
            try {
              // The endpoint takes `decision`, and its negative value is
              // DECLINED — not the REJECTED the button says.
              await api.post("/admin/users/approval", {
                userId: user.id,
                decision: approve ? "APPROVED" : "DECLINED",
              });
              await Promise.all([pending.reload(), all.reload()]);
              toast.success(approve ? "Account approved" : "Account declined");
            } catch (err: any) {
              toast.error(err?.response?.data?.message ?? "That did not go through.");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  // Approving is its own permission, granted separately from editing accounts.
  const canApprove = can("users.approve");
  const pendingCount = pending.data?.users?.length ?? 0;

  return (
    <Screen
      title="Users"
      subtitle={
        pendingCount > 0
          ? `${pendingCount} waiting to be approved`
          : "Nobody is waiting for approval"
      }
      onRefresh={source.refresh}
      refreshing={source.refreshing}
      header={
        <>
          <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
            {(
              [
                { key: "pending" as Tab, label: `Waiting (${pendingCount})` },
                { key: "all" as Tab, label: "Everyone" },
              ]
            ).map((t) => {
              const active = t.key === tab;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  className={`flex-1 rounded-lg py-2 ${active ? "bg-blue-600" : ""}`}
                >
                  <Text
                    className={`text-center text-sm font-medium ${
                      active ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="mt-2">
            <SearchBar value={query} onChange={setQuery} placeholder="Name or email" />
          </View>
          {canEdit ? (
            <ButtonRow>
              <Button
                label="Add a breeder"
                icon="person-add-outline"
                onPress={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
              />
            </ButtonRow>
          ) : null}
        </>
      }
    >
      {source.loading ? (
        <Loading />
      ) : (
        <>
          {source.error ? <Notice>{source.error}</Notice> : null}

          <View className="mt-4">
            {results.length === 0 ? (
              <Empty>
                {tab === "pending"
                  ? "Nobody is waiting for approval."
                  : users.length === 0
                    ? "No accounts."
                    : "Nobody matches that search."}
              </Empty>
            ) : tab === "pending" && canApprove ? (
              <View style={{ gap: 10 }}>
                {results.slice(0, 100).map((u) => {
                  const who = `${u.name ?? ""} ${u.lastName ?? ""}`.trim() || "Unnamed";
                  const working = busy === u.id;
                  return (
                    <View
                      key={u.id}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <Text className="font-medium text-slate-900">{who}</Text>
                      <Text className="mt-0.5 text-xs text-slate-500">
                        {u.email ?? "no email"}
                        {[u.city, u.state].filter(Boolean).length
                          ? ` · ${[u.city, u.state].filter(Boolean).join(", ")}`
                          : ""}
                      </Text>

                      <View className="mt-3 flex-row" style={{ gap: 8 }}>
                        <Pressable
                          onPress={() => decide(u, true)}
                          disabled={working}
                          className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5"
                        >
                          {working ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text className="text-sm font-medium text-white">Approve</Text>
                          )}
                        </Pressable>
                        <Pressable
                          onPress={() => decide(u, false)}
                          disabled={working}
                          className="flex-1 items-center justify-center rounded-lg border border-slate-200 py-2.5"
                        >
                          <Text className="text-sm font-medium text-slate-600">Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Rows>
                {results.slice(0, 150).map((u) => (
                  <Row
                    key={u.id}
                    title={`${u.name ?? ""} ${u.lastName ?? ""}`.trim() || "Unnamed"}
                    subtitle={u.email ?? undefined}
                    right={(u.role ?? "breeder").toLowerCase()}
                    rightSub={
                      u.approvalStatus && u.approvalStatus !== "APPROVED"
                        ? u.approvalStatus.toLowerCase()
                        : undefined
                    }
                    rightTone={
                      u.approvalStatus === "PENDING" ? "text-amber-600" : "text-slate-600"
                    }
                    onPress={canAssign ? () => setAccessFor(u) : undefined}
                    onLongPress={
                      canEdit
                        ? () => {
                            setEditing(u);
                            setEditorOpen(true);
                          }
                        : undefined
                    }
                  />
                ))}
              </Rows>
            )}
            <Truncated shown={Math.min(results.length, 150)} total={results.length} />
          </View>
        </>
      )}

      <UserEditSheet
        open={editorOpen}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          all.reload();
          pending.reload();
        }}
      />

      <UserAccessSheet
        user={accessFor}
        onClose={() => setAccessFor(null)}
        onChanged={() => {
          all.reload();
          pending.reload();
        }}
      />
    </Screen>
  );
}
