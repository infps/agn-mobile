import React, { useState } from "react";
import { Text, View } from "react-native";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  type Choice,
  ChoiceList,
  Confirm,
  Field,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Screen,
  SectionTitle,
} from "@/components/admin/ui";

interface Stats {
  devices: number;
  activeDevices: number;
  reachableAccounts: number;
  recent: { title: string; body: string; createdAt: string; recipients: number }[];
}

const AUDIENCES = [
  { value: "all", label: "Everyone with the app" },
  { value: "role:BREEDER", label: "Breeders" },
  { value: "role:ADMIN", label: "Admins" },
  { value: "role:BETTOR", label: "Bettors" },
];

const MAX_TITLE = 100;
const MAX_BODY = 500;

/**
 * Sending an announcement to the phones.
 *
 * Two things happen on send, and the order matters: the announcement is written
 * into everybody's in-app feed first, then pushed. Push is the tap on the
 * shoulder, not the message — somebody with notifications switched off, or a
 * phone that was flat, still finds it when they next open the app.
 *
 * The device count sits next to the send button rather than being buried,
 * because "how many people will this actually reach" is the question worth
 * answering before pressing it, and it is never the same as the number of
 * accounts. A push cannot be recalled, so it asks first and says the audience
 * back in the confirmation.
 *
 * Sending to everyone is a separate permission from sending at all. Without it
 * the choice stays on the list, greyed, with the reason — a missing option
 * reads as a bug, a refused one reads as what it is.
 */
export default function AdminNotifications() {
  const { can, canAny } = usePermissions();
  const action = useAdminAction();
  const toast = useToast();

  const allowed = canAny("notifications.view", "notifications.manage");
  const maySend = can("notifications.manage");
  const mayBroadcast = can("notifications.send");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(mayBroadcast ? "all" : "role:BREEDER");
  const [confirming, setConfirming] = useState(false);
  /** The server's own account of the last send, kept on screen after the toast goes. */
  const [sentNote, setSentNote] = useState<string | null>(null);

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<Stats>(
    allowed ? "/admin/notifications" : null
  );

  if (!allowed || forbidden) return <NoAccess what="Notifications" />;

  const active = data?.activeDevices ?? 0;
  const devicesLine = `${active} device${active === 1 ? "" : "s"}`;
  const audienceLabel = AUDIENCES.find((a) => a.value === audience)?.label ?? "Everyone";
  const ready = title.trim().length > 0 && body.trim().length > 0;

  const choices: Choice[] = AUDIENCES.map((a) => ({
    key: a.value,
    label: a.label,
    disabled: a.value === "all" && !mayBroadcast,
    disabledReason: "Needs the “Send to everybody” permission",
  }));

  const send = async () => {
    const [kind, role] = audience.split(":");
    // No fixed success line: the server says how many people and devices it
    // reached, and that sentence is the receipt.
    const { ok, data: sent } = await action.run<{ message?: string }>(
      "post",
      "/admin/notifications",
      {
        title: title.trim(),
        body: body.trim(),
        audience: kind === "role" ? "role" : "all",
        ...(kind === "role" ? { role } : {}),
      }
    );
    setConfirming(false);
    if (ok) {
      const said = sent?.message ?? "Sent.";
      toast.success(said);
      setSentNote(said);
      setTitle("");
      setBody("");
      reload();
    }
  };

  return (
    <Screen
      title="Notifications"
      subtitle="Push an announcement to everybody running the mobile app."
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Devices reachable now" value={active} basis="30%" />
            <Figure label="Accounts with the app" value={data?.reachableAccounts ?? 0} basis="30%" />
            <Figure
              label="Installs gone quiet — uninstalled or reinstalled"
              value={(data?.devices ?? 0) - active}
              basis="30%"
            />
          </FigureRow>

          {active === 0 ? (
            <Notice>
              No device has registered yet. A phone appears here once somebody signs in to the
              mobile app and allows notifications — the announcement is still written to their
              in-app feed in the meantime.
            </Notice>
          ) : null}

          {maySend ? (
            <>
              <SectionTitle>Write an announcement</SectionTitle>
              {sentNote ? (
                <View className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <Text className="text-sm text-emerald-800">{sentNote}</Text>
                </View>
              ) : null}

              <Text className="mb-1 text-xs font-medium text-slate-600">Who it goes to</Text>
              <ChoiceList
                choices={choices}
                selected={audience}
                onPick={(key) => setAudience(String(key))}
              />

              <Field
                label="Title"
                value={title}
                onChange={(v) => {
                  setTitle(v.slice(0, MAX_TITLE));
                  setSentNote(null);
                }}
                placeholder="Liberation delayed"
                hint={`${title.length}/${MAX_TITLE} — this is the line shown on the lock screen.`}
              />
              <Field
                label="Message"
                value={body}
                onChange={(v) => {
                  setBody(v.slice(0, MAX_BODY));
                  setSentNote(null);
                }}
                placeholder="Fog at the station. Birds will be released at 09:30 instead of 07:00."
                hint={`${body.length}/${MAX_BODY}`}
                multiline
              />

              <View className="mt-4 flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-sm text-slate-500">
                  {audienceLabel} · {devicesLine} will buzz
                </Text>
                <Button
                  label="Send"
                  icon="send"
                  onPress={() => setConfirming(true)}
                  disabled={!ready}
                />
              </View>
            </>
          ) : (
            <Notice>You can see what was sent, but sending is not part of your access.</Notice>
          )}

          {(data?.recent?.length ?? 0) > 0 ? (
            <>
              <SectionTitle>Recently sent</SectionTitle>
              <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {data!.recent.map((r, index) => (
                  <View
                    key={`${r.createdAt}-${index}`}
                    className={`px-4 py-3 ${index > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <View className="flex-row items-baseline justify-between gap-3">
                      <Text className="flex-1 text-sm font-medium text-slate-900">{r.title}</Text>
                      <Text className="text-xs text-slate-400">
                        {new Date(r.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-sm text-slate-500">{r.body}</Text>
                    <Text className="mt-1 text-xs text-slate-400">
                      {r.recipients} recipient{r.recipients === 1 ? "" : "s"}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}

      <Confirm
        open={confirming}
        title={`Send to ${audienceLabel.toLowerCase()}?`}
        body={`${devicesLine} will get a notification, and it will appear in the in-app feed for everybody in that group. A push cannot be recalled.`}
        confirmLabel="Send it"
        pending={action.pending}
        onConfirm={send}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
