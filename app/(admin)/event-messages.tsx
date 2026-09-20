import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { usePermissions } from "@/context/PermissionContext";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import { useAdminData } from "@/hooks/useAdminData";
import { Confirm, Empty, Loading, NoAccess, Notice, Screen } from "@/components/admin/ui";

interface Message {
  id: number;
  title: string | null;
  body: string;
  mediaUrls: string[];
  createdAt: string;
  author?: { id: string; name: string | null; lastName: string | null; image: string | null } | null;
}

/**
 * What has been said to the breeders in this event, and saying something new.
 *
 * This is the one admin screen where writing from a phone is clearly better
 * than waiting to be at a desk — a message about a delayed liberation is worth
 * nothing an hour later. So composing is inline rather than behind a button,
 * and posting confirms first: a broadcast reaches everybody entered and cannot
 * be taken back.
 */
export default function EventMessages() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<Message | null>(null);
  const action = useAdminAction();

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    messages?: Message[];
  }>(eventId ? `/admin/event/${eventId}/messages` : null, [eventId]);

  const messages = data?.messages ?? [];
  const canPost = can("messages.manage");

  const post = () => {
    if (!body.trim() || sending) return;
    Alert.alert(
      "Send to everybody",
      "This goes to every breeder entered in this event and cannot be unsent.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            setSending(true);
            try {
              await api.post(`/admin/event/${eventId}/messages`, {
                title: title.trim() || undefined,
                body: body.trim(),
              });
              setTitle("");
              setBody("");
              await reload();
              toast.success("Message sent");
            } catch (err: any) {
              toast.error(err?.response?.data?.message ?? "The message was not sent.");
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run(
      "delete",
      `/admin/event/${eventId}/messages/${removing.id}`,
      undefined,
      { success: "Message removed." }
    );
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  if (forbidden) return <NoAccess what="Messages" />;

  return (
    <Screen
      title="Messages"
      subtitle={name ? `${name} · ${messages.length} posted` : `${messages.length} posted`}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {canPost && (
        <View className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Subject (optional)"
            placeholderTextColor="#94a3b8"
            className="border-b border-slate-100 pb-2 text-sm font-medium text-slate-900"
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write to everybody entered in this event…"
            placeholderTextColor="#94a3b8"
            multiline
            className="min-h-20 py-2 text-sm text-slate-900"
            textAlignVertical="top"
          />
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-slate-400">
              {body.trim().length === 0 ? "Nothing to send yet" : `${body.trim().length} characters`}
            </Text>
            <Pressable
              onPress={post}
              disabled={sending || body.trim().length === 0}
              className={`flex-row items-center gap-2 rounded-lg px-4 py-2 ${
                sending || body.trim().length === 0 ? "bg-slate-200" : "bg-blue-600"
              }`}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={14} color="#fff" />
              )}
              <Text className="text-sm font-medium text-white">Send</Text>
            </Pressable>
          </View>
        </View>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4" style={{ gap: 10 }}>
            {messages.length === 0 ? (
              <Empty>Nothing has been posted to this event yet.</Empty>
            ) : (
              messages.map((m) => {
                const who = `${m.author?.name ?? ""} ${m.author?.lastName ?? ""}`.trim();
                return (
                  <View key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    {m.title ? (
                      <Text className="font-semibold text-slate-900">{m.title}</Text>
                    ) : null}
                    <Text className={`text-sm text-slate-700 ${m.title ? "mt-1" : ""}`}>
                      {m.body}
                    </Text>

                    {m.mediaUrls?.length > 0 && (
                      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                        {m.mediaUrls.slice(0, 4).map((url) => (
                          <Image
                            key={url}
                            source={{ uri: url }}
                            className="h-20 w-20 rounded-lg"
                            resizeMode="cover"
                          />
                        ))}
                      </View>
                    )}

                    <View className="mt-2 flex-row items-center justify-between">
                      <Text className="text-xs text-slate-400">
                        {who || "Staff"} · {new Date(m.createdAt).toLocaleString()}
                      </Text>
                      {canPost ? (
                        <Pressable onPress={() => setRemoving(m)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={15} color="#94a3b8" />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      )}

      <Confirm
        open={removing != null}
        title="Take this message down?"
        body="It stops showing to breeders. People who have already read it keep what they read."
        confirmLabel="Take it down"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
