import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow, Confirm, Field, Loading, Notice } from "@/components/admin/ui";
import { Chips, Heading, when } from "@/components/admin/birdParts";

interface Img {
  id: number;
  url: string;
  type: string;
  takenAt: string;
}

interface Note {
  id: number;
  text: string;
  authorName: string | null;
  createdAt: string;
}

type Kind = "ARRIVAL" | "RACE" | "FINAL";

const KINDS: { key: Kind; label: string }[] = [
  { key: "ARRIVAL", label: "Arrival" },
  { key: "RACE", label: "Race" },
  { key: "FINAL", label: "Final" },
];

/**
 * One bird's pictures and notes for one event's season.
 *
 * These are kept per season rather than on the bird, because they are evidence
 * about a particular campaign: what the bird looked like when it was handed
 * over, what it looked like when it came back, and what was said about it in
 * between. A photograph taken at intake is the thing that settles "it arrived
 * like that" six months later, so it has to be takeable where the bird is —
 * which is at the loft, with a phone, not at a desk.
 *
 * The picture is sent as multipart under the field name the route reads
 * (`image`, with `type` beside it). React Native describes a file as
 * `{ uri, name, type }` rather than handing over a Blob, and Content-Type is
 * left unset so the runtime writes its own boundary.
 *
 * The season is whichever one is active for the event; the route picks it when
 * none is named, exactly as the portal lets it.
 */
export function BirdEventMedia({
  eventId,
  birdId,
}: {
  eventId: number | string;
  birdId: number | string;
}) {
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const base = `/admin/event/${eventId}/birds/${birdId}`;
  const images = useAdminData<Partial<Record<Kind, Img[]>>>(`${base}/images`, [eventId, birdId]);
  const notes = useAdminData<{ notes?: Note[] }>(`${base}/notes`, [eventId, birdId]);

  const [kind, setKind] = useState<Kind>("ARRIVAL");
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState("");
  const [removingImage, setRemovingImage] = useState<Img | null>(null);
  const [removingNote, setRemovingNote] = useState<Note | null>(null);

  const mayEdit = can("events.manage");

  if (images.forbidden && notes.forbidden) {
    return <Notice>This event's pictures and notes are not part of your access.</Notice>;
  }

  const send = async (asset: ImagePicker.ImagePickerAsset) => {
    setUploading(true);
    try {
      const form = new FormData();
      // React Native wants the file described, not read into memory.
      form.append("image", {
        uri: asset.uri,
        name: asset.fileName || asset.uri.split("/").pop() || `bird-${birdId}.jpg`,
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);
      form.append("type", kind);

      await api.post(`${base}/images`, form, {
        // Unset so the runtime writes its own multipart boundary.
        headers: { "Content-Type": undefined as unknown as string },
        transformRequest: (value) => value,
      });
      toast.success("Picture added.");
      images.reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "That picture did not upload.");
    } finally {
      setUploading(false);
    }
  };

  const pick = async (from: "camera" | "library") => {
    try {
      if (from === "camera") {
        const asked = await ImagePicker.requestCameraPermissionsAsync();
        if (!asked.granted) {
          toast.error("The camera is switched off for this app in the phone's settings.");
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
      const result =
        from === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      // Backing out of a picker is the normal way to leave it.
      if (result.canceled || !result.assets?.[0]) return;
      await send(result.assets[0]);
    } catch {
      toast.error("The picture could not be opened.");
    }
  };

  const addNote = async () => {
    const text = draft.trim();
    if (!text) return;
    const { ok } = await action.run("post", `${base}/notes`, { text }, { success: "Note added." });
    if (ok) {
      setDraft("");
      notes.reload();
    }
  };

  const list = notes.data?.notes ?? [];

  return (
    <View>
      <Heading>Event pictures</Heading>
      {images.loading ? (
        <Loading />
      ) : images.error ? (
        <Notice>{images.error}</Notice>
      ) : (
        <View className="rounded-xl border border-slate-200 bg-white p-3">
          {KINDS.map((k) => {
            const shown = images.data?.[k.key] ?? [];
            return (
              <View key={k.key} className="mb-3">
                <Text className="mb-1.5 text-xs text-slate-500">
                  {k.label} ({shown.length})
                </Text>
                {shown.length === 0 ? (
                  <Text className="text-xs text-slate-300">None</Text>
                ) : (
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {shown.map((im) => (
                      <Pressable
                        key={im.id}
                        onPress={() => Linking.openURL(im.url)}
                        onLongPress={mayEdit ? () => setRemovingImage(im) : undefined}
                        delayLongPress={400}
                      >
                        <Image
                          source={{ uri: im.url }}
                          style={{ width: 76, height: 76, borderRadius: 8 }}
                          contentFit="cover"
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {mayEdit ? (
            <>
              <Text className="mb-1.5 text-xs font-medium text-slate-600">Add one as</Text>
              <Chips options={KINDS} selected={kind} onPick={(k) => setKind(k as Kind)} />
              <ButtonRow>
                <Button
                  label="Camera"
                  icon="camera-outline"
                  onPress={() => pick("camera")}
                  pending={uploading}
                  full
                />
                <Button
                  label="Library"
                  tone="secondary"
                  icon="images-outline"
                  onPress={() => pick("library")}
                  disabled={uploading}
                  full
                />
              </ButtonRow>
              <Text className="mt-2 text-xs text-slate-400">
                Tap a picture to open it. Hold one to remove it.
              </Text>
            </>
          ) : null}
        </View>
      )}

      <Heading>Notes timeline</Heading>
      {mayEdit ? (
        <View className="-mt-3">
          <Field label="" value={draft} onChange={setDraft} placeholder="Add a note…" multiline />
          <ButtonRow>
            <Button
              label="Add note"
              icon="send-outline"
              onPress={addNote}
              pending={action.pending}
              disabled={!draft.trim()}
              full
            />
          </ButtonRow>
        </View>
      ) : null}

      {notes.loading ? (
        <Loading />
      ) : notes.error ? (
        <Notice>{notes.error}</Notice>
      ) : list.length === 0 ? (
        <Text className="mt-3 text-sm text-slate-500">No notes yet.</Text>
      ) : (
        <View className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {list.map((n, index) => (
            <View
              key={n.id}
              className={`flex-row items-start gap-3 px-4 py-3 ${
                index > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-sm text-slate-900">{n.text}</Text>
                <Text className="mt-0.5 text-xs text-slate-400">
                  {n.authorName ? `${n.authorName} · ` : ""}
                  {when(n.createdAt)}
                </Text>
              </View>
              {mayEdit ? (
                <Pressable onPress={() => setRemovingNote(n)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <Confirm
        open={removingImage != null}
        title="Remove this picture?"
        body="It is deleted from the bird's record for this season and cannot be brought back."
        confirmLabel="Remove"
        pending={action.pending}
        onCancel={() => setRemovingImage(null)}
        onConfirm={async () => {
          if (!removingImage) return;
          const { ok } = await action.run("delete", `${base}/images/${removingImage.id}`, undefined, {
            success: "Picture removed.",
          });
          if (ok) {
            setRemovingImage(null);
            images.reload();
          }
        }}
      />

      <Confirm
        open={removingNote != null}
        title="Delete this note?"
        body="It is removed from the timeline for everyone."
        confirmLabel="Delete"
        pending={action.pending}
        onCancel={() => setRemovingNote(null)}
        onConfirm={async () => {
          if (!removingNote) return;
          const { ok } = await action.run("delete", `${base}/notes?noteId=${removingNote.id}`, undefined, {
            success: "Note deleted.",
          });
          if (ok) {
            setRemovingNote(null);
            notes.reload();
          }
        }}
      />
    </View>
  );
}
