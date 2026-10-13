import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import {
  Button,
  ButtonRow,
  Confirm,
  Empty,
  Field,
  Loading,
  NoAccess,
  Notice,
  Screen,
  SearchBar,
  Sheet,
} from "@/components/admin/ui";

interface Message {
  id: number;
  title: string | null;
  body: string;
  mediaUrls: string[];
  createdAt: string;
  author?: { id: string; name: string | null; lastName: string | null; image: string | null } | null;
}

/** The portal's editor writes HTML; anything beyond paragraphs is formatting. */
const RICH = /<(?!\/?(p|br)\b)[a-z][^>]*>/i;

/** HTML the portal wrote, shown as something readable rather than as tags. */
function toPlain(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>\s*/gi, "\n\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pictures attached to a message, and adding more.
 *
 * Each picture is uploaded the moment it is picked, the way the portal does it:
 * the message itself only ever carries URLs. The upload is multipart with one
 * `file` field, and React Native describes a file as `{ uri, name, type }`
 * rather than reading it into memory — Content-Type is left unset so the
 * runtime writes its own boundary.
 */
function Attachments({
  eventId,
  urls,
  onChange,
}: {
  eventId: string;
  urls: string[];
  onChange: (next: string[]) => void;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const add = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    setUploading(true);
    const added: string[] = [];
    let failed: string | null = null;
    for (const asset of picked.assets) {
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName || asset.uri.split("/").pop() || "photo.jpg",
        // The route refuses anything that does not call itself an image.
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);
      try {
        const { data } = await api.post(`/admin/event/${eventId}/messages/upload`, form, {
          headers: { "Content-Type": undefined as unknown as string },
          transformRequest: (value) => value,
          // A photo over mobile data outlasts the budget a JSON call gets.
          timeout: 60000,
        });
        if (data?.url) added.push(data.url as string);
      } catch (err: any) {
        failed = err?.response?.data?.message ?? "A picture did not upload.";
      }
    }
    setUploading(false);

    if (added.length > 0) onChange([...urls, ...added]);
    if (failed) toast.error(failed);
  };

  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs font-medium text-slate-600">Pictures (optional)</Text>
      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        {urls.map((url, index) => (
          <View key={`${url}-${index}`}>
            <Image source={{ uri: url }} className="h-16 w-16 rounded-lg" resizeMode="cover" />
            <Pressable
              onPress={() => onChange(urls.filter((_, i) => i !== index))}
              hitSlop={8}
              className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-rose-600"
            >
              <Ionicons name="close" size={12} color="#fff" />
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={add}
          disabled={uploading}
          className={`flex-row items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 ${
            uploading ? "opacity-50" : ""
          }`}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#475569" />
          ) : (
            <Ionicons name="image-outline" size={16} color="#475569" />
          )}
          <Text className="text-xs font-medium text-slate-600">
            {uploading ? "Uploading…" : "Add picture"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * What has been said to the breeders in this event, and saying something new.
 *
 * This is the one admin screen where writing from a phone is clearly better
 * than waiting to be at a desk — a message about a delayed liberation is worth
 * nothing an hour later. So composing is inline rather than behind a button,
 * and posting confirms first: a broadcast is pushed to everybody entered and
 * cannot be taken back.
 *
 * Messages go out as plain text. The portal's editor writes HTML, which is read
 * back here as readable text; correcting one of those from the phone only
 * touches the wording if the wording was actually changed, so fixing a title or
 * a picture never flattens somebody's formatting by accident.
 */
export default function EventMessages() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const action = useAdminAction();

  const [query, setQuery] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const [editing, setEditing] = useState<Message | null>(null);
  const [form, setForm] = useState({ title: "", body: "", media: [] as string[] });
  const [removing, setRemoving] = useState<Message | null>(null);

  const base = eventId ? `/admin/event/${eventId}/messages` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    messages?: Message[];
  }>(base, [eventId]);

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const canPost = can("messages.manage");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) => (m.title ?? "").toLowerCase().includes(q) || toPlain(m.body).toLowerCase().includes(q)
    );
  }, [messages, query]);

  const post = async () => {
    const { ok } = await action.run(
      "post",
      base!,
      { title: title.trim() || undefined, body: body.trim(), mediaUrls: media },
      { success: "Message posted." }
    );
    setConfirming(false);
    if (ok) {
      setTitle("");
      setBody("");
      setMedia([]);
      reload();
    }
  };

  const startEdit = (m: Message) => {
    setForm({ title: m.title ?? "", body: toPlain(m.body), media: m.mediaUrls ?? [] });
    setEditing(m);
  };

  const bodyChanged = editing != null && form.body.trim() !== toPlain(editing.body);
  const wouldFlatten = editing != null && RICH.test(editing.body);

  const saveEdit = async () => {
    if (!editing) return;
    const { ok } = await action.run(
      "patch",
      `${base}/${editing.id}`,
      {
        title: form.title.trim() || null,
        // Left out when untouched, so the portal's formatting survives.
        ...(bodyChanged ? { body: form.body.trim() } : {}),
        mediaUrls: form.media,
      },
      { success: "Message updated." }
    );
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}/${removing.id}`, undefined, {
      success: "Message deleted.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  if (forbidden) return <NoAccess what="Messages" />;

  const ready = body.trim().length > 0;

  return (
    <Screen
      title="Messages"
      subtitle={name ? `${name} · ${messages.length} posted` : `${messages.length} posted`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        messages.length > 0 ? (
          <SearchBar value={query} onChange={setQuery} placeholder="Search messages" />
        ) : null
      }
    >
      {canPost && eventId ? (
        <View className="mt-4 rounded-xl border border-slate-200 bg-white px-3 pb-3">
          <Field label="Title (optional)" value={title} onChange={setTitle} />
          <Field
            label="Message"
            value={body}
            onChange={setBody}
            placeholder="Write to everybody entered in this event…"
            multiline
          />
          <Attachments eventId={eventId} urls={media} onChange={setMedia} />
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-xs text-slate-400">
              {ready ? `${body.trim().length} characters` : "Nothing to send yet"}
            </Text>
            <Button
              label="Post"
              icon="send"
              onPress={() => setConfirming(true)}
              disabled={!ready}
              pending={action.pending && confirming}
            />
          </View>
        </View>
      ) : null}

      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4" style={{ gap: 10 }}>
            {messages.length === 0 ? (
              <Empty>Nothing has been posted to this event yet.</Empty>
            ) : shown.length === 0 ? (
              <Empty>No message matches “{query.trim()}”.</Empty>
            ) : (
              shown.map((m) => {
                const who = `${m.author?.name ?? ""} ${m.author?.lastName ?? ""}`.trim();
                return (
                  <View key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <View className="flex-row items-center gap-3">
                      {m.author?.image ? (
                        <Image source={{ uri: m.author.image }} className="h-9 w-9 rounded-full" />
                      ) : (
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                          <Text className="text-sm font-semibold text-slate-500">
                            {(who[0] ?? "?").toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View className="min-w-0 flex-1">
                        {m.title ? (
                          <Text className="font-semibold text-slate-900" numberOfLines={2}>
                            {m.title}
                          </Text>
                        ) : null}
                        <Text className="text-xs text-slate-400">
                          {who || "Unknown"} · {new Date(m.createdAt).toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    <Text className="mt-3 text-sm leading-5 text-slate-700">{toPlain(m.body)}</Text>

                    {m.mediaUrls?.length > 0 && (
                      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                        {m.mediaUrls.map((url, index) => (
                          <Pressable key={`${url}-${index}`} onPress={() => Linking.openURL(url)}>
                            <Image
                              source={{ uri: url }}
                              className="h-20 w-20 rounded-lg"
                              resizeMode="cover"
                            />
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {canPost ? (
                      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                        <Pressable
                          onPress={() => startEdit(m)}
                          className="flex-row items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5"
                        >
                          <Ionicons name="create-outline" size={14} color="#475569" />
                          <Text className="text-xs font-medium text-slate-600">Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setRemoving(m)}
                          className="flex-row items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5"
                        >
                          <Ionicons name="trash-outline" size={14} color="#475569" />
                          <Text className="text-xs font-medium text-slate-600">Delete</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title="Edit message"
        subtitle="Corrects what is shown — it is not pushed to phones again"
      >
        {wouldFlatten ? (
          <Notice tone={bodyChanged ? "rose" : "amber"}>
            {bodyChanged
              ? "This message was written in the portal with formatting this editor cannot keep. Saving will flatten it to plain text."
              : "This message was written in the portal with formatting. The title and pictures can be changed safely; changing the wording here will flatten it to plain text."}
          </Notice>
        ) : null}

        <Field
          label="Title (optional)"
          value={form.title}
          onChange={(v) => setForm({ ...form, title: v })}
        />
        <Field
          label="Message"
          value={form.body}
          onChange={(v) => setForm({ ...form, body: v })}
          multiline
        />
        {eventId ? (
          <Attachments
            eventId={eventId}
            urls={form.media}
            onChange={(next) => setForm({ ...form, media: next })}
          />
        ) : null}

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button
            label="Save"
            onPress={saveEdit}
            pending={action.pending}
            disabled={form.body.trim().length === 0}
            full
          />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={confirming}
        title="Post to everybody in this event?"
        body={`${
          title.trim() ? `“${title.trim()}” ` : "This "
        }is published to the event and sent as a notification to every breeder entered in the season. It can be edited or deleted afterwards, but the notification cannot be recalled.`}
        confirmLabel="Post it"
        tone="primary"
        pending={action.pending}
        onConfirm={post}
        onCancel={() => setConfirming(false)}
      />

      <Confirm
        open={removing != null}
        title="Delete this message?"
        body="It stops showing to breeders. This cannot be undone, and people who have already read it keep what they read."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
