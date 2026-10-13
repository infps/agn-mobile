import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { downloadAndShare } from "@/service/download.service";
import { Chips } from "@/components/admin/Chips";
import { TeamsSheet } from "@/components/admin/TeamsSheet";
import { UserAccessSheet } from "@/components/admin/UserAccessSheet";
import {
  type DirectoryUser,
  UserDetailSheet,
  isLegacy,
  nameOf,
} from "@/components/admin/UserDetailSheet";
import { UserEditSheet } from "@/components/admin/UserEditSheet";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  Sheet,
  Truncated,
} from "@/components/admin/ui";

type Approval = "PENDING" | "APPROVED" | "DECLINED";
type QueueFilter = Approval | "ALL";

interface QueueUser {
  id: string;
  name: string | null;
  lastName: string | null;
  email: string;
  loftName: string | null;
  phoneNumber: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  role: string;
  approvalStatus: Approval;
  approvalNote: string | null;
  createdAt: string;
}

interface EventOption {
  id: number;
  name: string | null;
  eventDate?: string | null;
}

type Tab = "queue" | "accounts";

type Overlay =
  | { kind: "detail" | "edit" | "copy" | "teams" | "access" | "delete"; user: DirectoryUser }
  | { kind: "new" | "filters" | "bulk" }
  | { kind: "decline"; user: QueueUser }
  | null;

const QUEUE_FILTERS: { key: QueueFilter; label: string }[] = [
  { key: "PENDING", label: "Waiting" },
  { key: "APPROVED", label: "Approved" },
  { key: "DECLINED", label: "Declined" },
  { key: "ALL", label: "Everyone" },
];

const APPROVAL_BADGE: Record<Approval, { label: string; bg: string; text: string }> = {
  PENDING: { label: "pending", bg: "bg-amber-100", text: "text-amber-700" },
  APPROVED: { label: "approved", bg: "bg-emerald-100", text: "text-emerald-700" },
  DECLINED: { label: "declined", bg: "bg-slate-100", text: "text-slate-600" },
};

const SHOWN = 150;

/**
 * The portal's Breeders page: who has signed up, and who is on file.
 *
 * It is two lists that look alike and are not. Registrations is a queue of
 * decisions — somebody signed up and is waiting to be let in. Accounts is the
 * directory — everybody, with their details, their teams and their access.
 * They sit behind different guards on the server (`users.approve` for the
 * queue, an admin role for the directory), so each tab is offered only to
 * somebody who can load it, and one being refused does not take the other down.
 *
 * Approving is a single tap, as in the portal, because it is the common case
 * and it is reversible. Declining stops to ask why: the reason is kept on the
 * account, and a declined account is not deleted — it drops to guest access
 * and a super admin can reopen it.
 *
 * Deleting an account is the one thing here that cannot be undone, so it is a
 * super admin's alone and always goes through a sentence that says so.
 */
export default function AdminUsers() {
  const router = useRouter();
  const { can, canAny, role } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const mayApprove = can("users.approve");
  const mayList = canAny("users.view", "users.manage");
  const mayEdit = can("users.manage");
  const mayExport = can("users.view");
  const mayAssign = can("users.permissions");
  const isSuper = role === "SUPERADMIN";

  const [tab, setTab] = useState<Tab>(mayApprove ? "queue" : "accounts");
  const [overlay, setOverlay] = useState<Overlay>(null);

  // Registrations
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("PENDING");
  const [queueSearch, setQueueSearch] = useState("");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const queue = useAdminData<{ users?: QueueUser[]; counts?: Record<string, number> }>(
    mayApprove
      ? `/admin/users/approval${queueFilter === "ALL" ? "" : `?status=${queueFilter}`}`
      : null,
    [queueFilter, mayApprove]
  );
  const counts = queue.data?.counts ?? {};
  const waiting = counts.PENDING ?? 0;

  // Accounts
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [country, setCountry] = useState("all");
  const [city, setCity] = useState("");
  const [loft, setLoft] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<string | null>(null);

  // Role and event narrow the query itself, exactly as the portal's do; the
  // rest are applied to what came back.
  const listQuery = [
    eventFilter !== "all" ? `eventId=${eventFilter}` : null,
    roleFilter !== "all" ? `role=${roleFilter}` : null,
  ]
    .filter(Boolean)
    .join("&");
  const accounts = useAdminData<{ users?: DirectoryUser[] }>(
    mayList ? `/admin/users${listQuery ? `?${listQuery}` : ""}` : null,
    [listQuery, mayList]
  );
  const events = useAdminData<{ events?: EventOption[] }>(
    mayList && canAny("events.view", "events.manage") ? "/admin/event" : null
  );

  const users = useMemo(() => accounts.data?.users ?? [], [accounts.data]);
  const countries = useMemo(
    () => Array.from(new Set(users.map((u) => u.country).filter(Boolean))) as string[],
    [users]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const c = city.trim().toLowerCase();
    const l = loft.trim().toLowerCase();
    return users
      .filter((u) => status === "all" || u.status === status)
      .filter((u) => country === "all" || u.country === country)
      .filter((u) => !c || (u.city ?? "").toLowerCase().includes(c))
      .filter((u) => !l || (u.loftName ?? "").toLowerCase().includes(l))
      .filter(
        (u) =>
          !q ||
          `${u.name ?? ""} ${u.lastName ?? ""}`.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q) ||
          (u.phoneNumber ?? "").toLowerCase().includes(q)
      );
  }, [users, search, status, country, city, loft]);

  const queueVisible = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    const list = queue.data?.users ?? [];
    if (!q) return list;
    return list.filter(
      (u) =>
        nameOf(u).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.loftName ?? "").toLowerCase().includes(q)
    );
  }, [queue.data, queueSearch]);

  if (!mayApprove && !mayList) return <NoAccess what="User accounts" />;

  const reloadAll = () => {
    if (mayApprove) queue.reload();
    if (mayList) accounts.reload();
  };

  const decide = async (user: QueueUser, decision: Approval, reason?: string) => {
    setWorking(user.id);
    const { ok, data } = await action.run<{ message?: string }>("post", "/admin/users/approval", {
      userId: user.id,
      decision,
      note: reason,
    });
    setWorking(null);
    if (ok) {
      // The server's sentence names the account and what happened to it.
      toast.success(data?.message ?? "Decision recorded.");
      setOverlay(null);
      setNote("");
      reloadAll();
    }
  };

  const exportAs = async (format: "csv" | "xlsx") => {
    setExporting(format);
    const params = [`format=${format}`];
    if (status !== "all") params.push(`status=${status}`);
    if (eventFilter !== "all") params.push(`eventId=${eventFilter}`);
    const res = await downloadAndShare(
      `/admin/users/export?${params.join("&")}`,
      `breeders.${format}`
    );
    setExporting(null);
    if (!res.ok && res.problem) toast.error(res.problem);
  };

  const removeOne = async () => {
    if (overlay?.kind !== "delete") return;
    const { ok } = await action.run(
      "delete",
      "/admin/users",
      { id: overlay.user.id },
      { success: "Account deleted." }
    );
    if (ok) {
      setOverlay(null);
      reloadAll();
    }
  };

  // Legacy breeders have no account row to delete; the portal skips them too.
  const deletable = [...selected].filter((id) => !id.startsWith("legacy-"));
  const skipped = selected.size - deletable.length;

  const removeMany = async () => {
    const { ok } = await action.run(
      "delete",
      "/admin/users",
      { ids: deletable },
      { success: `${deletable.length} account${deletable.length === 1 ? "" : "s"} deleted.` }
    );
    if (ok) {
      setOverlay(null);
      setSelected(new Set());
      setSelecting(false);
      reloadAll();
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const activeFilters =
    (status !== "all" ? 1 : 0) +
    (roleFilter !== "all" ? 1 : 0) +
    (eventFilter !== "all" ? 1 : 0) +
    (country !== "all" ? 1 : 0) +
    (city.trim() ? 1 : 0) +
    (loft.trim() ? 1 : 0);

  const eventChoices: Choice[] = [
    { key: "all", label: "All events" },
    ...(events.data?.events ?? [])
      .slice()
      .sort((a, b) => new Date(b.eventDate ?? 0).getTime() - new Date(a.eventDate ?? 0).getTime())
      .map((e) => ({ key: String(e.id), label: e.name ?? `Event ${e.id}` })),
  ];

  const source = tab === "queue" ? queue : accounts;

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "queue", label: `Registrations${waiting > 0 ? ` (${waiting})` : ""}`, show: mayApprove },
    { key: "accounts", label: "Accounts", show: mayList },
  ];

  return (
    <Screen
      title="Users"
      subtitle={
        mayApprove
          ? waiting > 0
            ? `${waiting} waiting to be approved`
            : "Nobody is waiting for approval"
          : `${users.length.toLocaleString()} on file`
      }
      onRefresh={source.refresh}
      refreshing={source.refreshing}
      header={
        <>
          {tabs.filter((t) => t.show).length > 1 ? (
            <View className="flex-row rounded-xl border border-slate-200 bg-white p-1">
              {tabs.map((t) => {
                const active = t.key === tab;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    className={`flex-1 rounded-lg py-2 ${active ? "bg-cyan-600" : ""}`}
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
          ) : null}

          {tab === "queue" ? (
            <>
              <Chips<QueueFilter>
                options={QUEUE_FILTERS.map((f) => ({
                  key: f.key,
                  label:
                    f.key !== "ALL" && counts[f.key] != null
                      ? `${f.label} ${counts[f.key]}`
                      : f.label,
                }))}
                value={queueFilter}
                onChange={setQueueFilter}
              />
              <View className="mt-2">
                <SearchBar
                  value={queueSearch}
                  onChange={setQueueSearch}
                  placeholder="Name, email or loft"
                />
              </View>
            </>
          ) : (
            <>
              <View className="mt-2">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Name, email, username or phone"
                />
              </View>
              <ButtonRow>
                <Button
                  label={activeFilters > 0 ? `Filters (${activeFilters})` : "Filters"}
                  tone="secondary"
                  icon="funnel-outline"
                  onPress={() => setOverlay({ kind: "filters" })}
                  full
                />
                {mayEdit ? (
                  <Button
                    label="Add breeder"
                    icon="person-add-outline"
                    onPress={() => setOverlay({ kind: "new" })}
                    full
                  />
                ) : null}
              </ButtonRow>
              {mayExport || isSuper ? (
                <ButtonRow>
                  {mayExport ? (
                    <>
                      <Button
                        label="CSV"
                        tone="secondary"
                        icon="download-outline"
                        pending={exporting === "csv"}
                        disabled={exporting != null}
                        onPress={() => exportAs("csv")}
                        full
                      />
                      <Button
                        label="Excel"
                        tone="secondary"
                        icon="download-outline"
                        pending={exporting === "xlsx"}
                        disabled={exporting != null}
                        onPress={() => exportAs("xlsx")}
                        full
                      />
                    </>
                  ) : null}
                  {isSuper ? (
                    <Button
                      label={selecting ? "Done" : "Select"}
                      tone="secondary"
                      icon={selecting ? "close" : "checkbox-outline"}
                      onPress={() => {
                        setSelecting(!selecting);
                        setSelected(new Set());
                      }}
                      full
                    />
                  ) : null}
                </ButtonRow>
              ) : null}
              {mayAssign ? (
                <ButtonRow>
                  <Button
                    label="Role permissions"
                    tone="secondary"
                    icon="shield-checkmark-outline"
                    onPress={() => router.push("/(admin)/permissions" as never)}
                    full
                  />
                </ButtonRow>
              ) : null}
              {selecting && selected.size > 0 ? (
                <ButtonRow>
                  <Button
                    label={`Delete (${selected.size})`}
                    tone="danger"
                    icon="trash-outline"
                    onPress={() => {
                      if (deletable.length === 0) {
                        toast.error(
                          "Only legacy breeders are selected, and they have no account to delete."
                        );
                        return;
                      }
                      setOverlay({ kind: "bulk" });
                    }}
                    full
                  />
                </ButtonRow>
              ) : null}
            </>
          )}
        </>
      }
    >
      {source.forbidden ? (
        <NoAccess what={tab === "queue" ? "The approval queue" : "The account list"} />
      ) : source.loading ? (
        <Loading />
      ) : tab === "queue" ? (
        <>
          {queue.error ? <Notice>{queue.error}</Notice> : null}
          <View className="mt-4" style={{ gap: 10 }}>
            {queueVisible.length === 0 ? (
              <Empty>
                {queueFilter === "PENDING"
                  ? "Nobody is waiting for approval."
                  : "No accounts match."}
              </Empty>
            ) : (
              queueVisible.map((u) => {
                const badge = APPROVAL_BADGE[u.approvalStatus] ?? APPROVAL_BADGE.PENDING;
                const place = [u.city, u.state, u.country].filter(Boolean).join(", ");
                const busy = working === u.id;
                return (
                  <View key={u.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="font-medium text-slate-900">{nameOf(u)}</Text>
                      <View className={`rounded-full px-2 py-0.5 ${badge.bg}`}>
                        <Text className={`text-[10px] font-medium ${badge.text}`}>
                          {badge.label}
                        </Text>
                      </View>
                      {u.role !== "BREEDER" ? (
                        <View className="rounded-full bg-violet-100 px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-violet-700">
                            {u.role.toLowerCase()}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="mt-0.5 text-xs text-slate-500">
                      {[u.email, u.loftName, place, u.phoneNumber].filter(Boolean).join(" · ")}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-400">
                      Signed up {new Date(u.createdAt).toLocaleDateString()}
                      {u.approvalNote ? ` · ${u.approvalNote}` : ""}
                    </Text>

                    <ButtonRow>
                      {u.approvalStatus !== "APPROVED" ? (
                        <Button
                          label="Approve"
                          tone="success"
                          icon="checkmark"
                          pending={busy}
                          onPress={() => decide(u, "APPROVED")}
                          full
                        />
                      ) : null}
                      {u.approvalStatus !== "DECLINED" ? (
                        <Button
                          label="Decline"
                          tone="secondary"
                          disabled={busy}
                          onPress={() => {
                            setNote("");
                            setOverlay({ kind: "decline", user: u });
                          }}
                          full
                        />
                      ) : null}
                      {u.approvalStatus === "DECLINED" && isSuper ? (
                        <Button
                          label="Reopen"
                          tone="secondary"
                          icon="arrow-undo-outline"
                          disabled={busy}
                          onPress={() => decide(u, "PENDING")}
                          full
                        />
                      ) : null}
                    </ButtonRow>
                  </View>
                );
              })
            )}
          </View>
          {(queue.data?.users?.length ?? 0) >= 200 ? (
            <Text className="mt-3 text-center text-xs text-slate-400">
              The server sends the first 200 — pick a narrower filter above to see the rest.
            </Text>
          ) : null}
        </>
      ) : (
        <>
          {accounts.error ? <Notice>{accounts.error}</Notice> : null}
          <View className="mt-4">
            {filtered.length === 0 ? (
              <Empty>{users.length === 0 ? "No accounts." : "Nobody matches that."}</Empty>
            ) : (
              <Rows>
                {filtered.slice(0, SHOWN).map((u) => {
                  const on = selected.has(u.id);
                  return (
                    <Row
                      key={u.id}
                      title={nameOf(u)}
                      subtitle={
                        [u.loftName, u.email, isLegacy(u) ? "legacy" : null]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      right={(u.role ?? "breeder").toLowerCase()}
                      rightSub={(u.status ?? "").toLowerCase() || undefined}
                      rightTone={u.status === "INACTIVE" ? "text-rose-600" : "text-slate-600"}
                      leading={
                        selecting ? (
                          <Ionicons
                            name={on ? "checkbox" : "square-outline"}
                            size={20}
                            color={on ? "#0891b2" : "#cbd5e1"}
                          />
                        ) : undefined
                      }
                      onPress={() =>
                        selecting ? toggle(u.id) : setOverlay({ kind: "detail", user: u })
                      }
                    />
                  );
                })}
              </Rows>
            )}
            <Truncated
              shown={Math.min(filtered.length, SHOWN)}
              total={filtered.length}
              where="a narrower search"
            />
          </View>
        </>
      )}

      <UserDetailSheet
        user={overlay?.kind === "detail" ? overlay.user : null}
        onClose={() => setOverlay(null)}
        onEdit={(user) => setOverlay({ kind: "edit", user })}
        onCopy={(user) => setOverlay({ kind: "copy", user })}
        onTeams={(user) => setOverlay({ kind: "teams", user })}
        onAccess={(user) => setOverlay({ kind: "access", user })}
        onDelete={(user) => setOverlay({ kind: "delete", user })}
      />

      <UserEditSheet
        open={overlay?.kind === "edit" || overlay?.kind === "copy" || overlay?.kind === "new"}
        editing={overlay?.kind === "edit" ? overlay.user : null}
        copyFrom={overlay?.kind === "copy" ? overlay.user : null}
        onClose={() => setOverlay(null)}
        onSaved={reloadAll}
      />

      <TeamsSheet
        open={overlay?.kind === "teams"}
        breederId={overlay?.kind === "teams" ? (overlay.user.breederId ?? null) : null}
        who={overlay?.kind === "teams" ? nameOf(overlay.user) : ""}
        onClose={() => setOverlay(null)}
      />

      <UserAccessSheet
        user={overlay?.kind === "access" ? overlay.user : null}
        onClose={() => setOverlay(null)}
        onChanged={reloadAll}
      />

      <Sheet
        open={overlay?.kind === "filters"}
        onClose={() => setOverlay(null)}
        title="Filter accounts"
        subtitle={`${filtered.length.toLocaleString()} match`}
      >
        <Chips
          label="Status"
          options={[
            { key: "all", label: "All" },
            { key: "ACTIVE", label: "Active" },
            { key: "INACTIVE", label: "Inactive" },
            { key: "PROSPECT", label: "Prospect" },
          ]}
          value={status}
          onChange={setStatus}
        />
        <Chips
          label="Role"
          options={[
            { key: "all", label: "All" },
            { key: "BREEDER", label: "Breeder" },
            { key: "ADMIN", label: "Admin" },
            { key: "SUPERADMIN", label: "Super admin" },
          ]}
          value={roleFilter}
          onChange={setRoleFilter}
        />
        {countries.length > 0 ? (
          <Chips
            label="Country"
            options={[{ key: "all", label: "All" }, ...countries.map((c) => ({ key: c, label: c }))]}
            value={country}
            onChange={setCountry}
          />
        ) : null}
        <Field label="City" value={city} onChange={setCity} placeholder="Contains…" />
        <Field label="Loft" value={loft} onChange={setLoft} placeholder="Contains…" />
        {eventChoices.length > 1 ? (
          <>
            <Text className="mb-1 mt-4 text-xs font-medium text-slate-600">
              Entered in an event (approved registrations, current season)
            </Text>
            <ChoiceList
              choices={eventChoices}
              selected={eventFilter}
              onPick={(k) => setEventFilter(String(k))}
            />
          </>
        ) : null}
        <ButtonRow>
          <Button
            label="Clear"
            tone="secondary"
            onPress={() => {
              setStatus("all");
              setRoleFilter("all");
              setEventFilter("all");
              setCountry("all");
              setCity("");
              setLoft("");
            }}
            full
          />
          <Button label="Done" onPress={() => setOverlay(null)} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={overlay?.kind === "decline"}
        onClose={() => setOverlay(null)}
        title="Decline this registration"
        subtitle={overlay?.kind === "decline" ? nameOf(overlay.user) : null}
      >
        <Notice>
          The account is kept and can still sign in — it drops to guest access, seeing only what a
          visitor sees. A super admin can reopen it later.
        </Notice>
        <Field
          label="Why (optional)"
          value={note}
          onChange={(v) => setNote(v.slice(0, 500))}
          hint="Kept on the account."
          multiline
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setOverlay(null)} full />
          <Button
            label="Decline"
            tone="danger"
            pending={action.pending}
            onPress={() => {
              if (overlay?.kind === "decline") {
                decide(overlay.user, "DECLINED", note.trim() || undefined);
              }
            }}
            full
          />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={overlay?.kind === "delete"}
        title={`Delete ${overlay?.kind === "delete" ? nameOf(overlay.user) : "this account"}?`}
        body="The account is removed and they can no longer sign in. This cannot be undone — to keep the record and only shut them out, decline or deactivate them instead."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={removeOne}
        onCancel={() => setOverlay(null)}
      />

      <Confirm
        open={overlay?.kind === "bulk"}
        title={`Delete ${deletable.length} account${deletable.length === 1 ? "" : "s"}?`}
        body={
          (skipped > 0
            ? `${skipped} legacy breeder${skipped === 1 ? " is" : "s are"} skipped — there is no account behind them. `
            : "") + "The rest are removed and can no longer sign in. This cannot be undone."
        }
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={removeMany}
        onCancel={() => setOverlay(null)}
      />
    </Screen>
  );
}
