import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import api from "@/service/api.service";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow, Confirm, Field, Sheet } from "@/components/admin/ui";
import { Caption } from "@/components/admin/scan";

export interface Vaccination {
  id: number;
  vaccineName: string;
  vaccinationDate: string;
  vet: string | null;
  batchNo: string | null;
  notes: string | null;
  documentUrl: string | null;
}

const BLANK = { vaccineName: "", vaccinationDate: "", vet: "", batchNo: "", notes: "" };

/** Today, in the YYYY-MM-DD the date field is typed in. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function validDate(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(new Date(raw).getTime());
}

/** The server only needs a sensible content type to store beside the bytes. */
function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "heic") return "image/heic";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * What has been given to the birds in one section.
 *
 * A record is taken against the section rather than a bird: the server
 * snapshots whoever is in the section at that moment, so a bird moved out
 * tomorrow still carries today's shot. That is why the date is a field and not
 * simply "now" — records get written up after the vet has left, and a record
 * dated the day it was typed is a wrong record.
 *
 * The certificate travels with the record. On a phone the natural way to
 * attach one is to photograph it where it lies, so the camera sits beside the
 * file picker instead of behind it.
 */
export function GroupVaccinations({
  base,
  groupId,
  groupName,
  vaccinations,
  mayManage,
  onChanged,
}: {
  /** `/admin/event/{eventId}/groups` */
  base: string;
  groupId: number;
  groupName: string;
  vaccinations: Vaccination[];
  mayManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const action = useAdminAction();
  const path = `${base}/${groupId}/vaccinations`;

  const [editing, setEditing] = useState<Vaccination | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [removing, setRemoving] = useState<Vaccination | null>(null);
  const [attaching, setAttaching] = useState<Vaccination | null>(null);
  const [detaching, setDetaching] = useState<Vaccination | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);

  const startNew = () => {
    setForm({ ...BLANK, vaccinationDate: today() });
    setEditing("new");
  };

  const startEdit = (v: Vaccination) => {
    setForm({
      vaccineName: v.vaccineName ?? "",
      vaccinationDate: v.vaccinationDate ? v.vaccinationDate.slice(0, 10) : "",
      vet: v.vet ?? "",
      batchNo: v.batchNo ?? "",
      notes: v.notes ?? "",
    });
    setEditing(v);
  };

  const save = async () => {
    if (!form.vaccineName.trim()) {
      toast.error("Name the vaccine.");
      return;
    }
    if (!validDate(form.vaccinationDate.trim())) {
      toast.error("The date has to be written as YYYY-MM-DD.");
      return;
    }

    const body = {
      vaccineName: form.vaccineName.trim(),
      vaccinationDate: form.vaccinationDate.trim(),
      vet: form.vet.trim() || null,
      batchNo: form.batchNo.trim() || null,
      notes: form.notes.trim() || null,
    };

    const { ok } =
      editing === "new"
        ? await action.run("post", path, body, { success: `Recorded for ${groupName}.` })
        : await action.run("patch", `${path}/${(editing as Vaccination).id}`, body, {
            success: "Record updated.",
          });

    if (ok) {
      setEditing(null);
      onChanged();
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${path}/${removing.id}`, undefined, {
      success: "Record deleted.",
    });
    if (ok) {
      setRemoving(null);
      onChanged();
    }
  };

  /**
   * Multipart, with the file described rather than read: React Native's
   * FormData takes `{ uri, name, type }`, and Content-Type is left unset so the
   * runtime can write its own boundary.
   */
  const upload = async (record: Vaccination, uri: string, name: string, type?: string | null) => {
    setUploading(record.id);
    try {
      const body = new FormData();
      body.append("document", { uri, name, type: type || mimeFor(name) } as unknown as Blob);
      await api.post(`${path}/${record.id}/document`, body, {
        headers: { "Content-Type": undefined as unknown as string },
        transformRequest: (value) => value,
      });
      toast.success("Document attached.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "That document did not upload.");
    } finally {
      setUploading(null);
    }
  };

  const pickFile = async () => {
    const record = attaching;
    if (!record) return;
    setAttaching(null);
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ["image/*", "application/pdf"] });
      // Backing out of a picker is the normal way to leave it, not an error.
      if (picked.canceled || !picked.result) return;
      const uri = picked.result.uri;
      await upload(record, uri, uri.split("/").pop() || "vaccination-document");
    } catch (err: any) {
      if (!/cancel/i.test(String(err?.message ?? ""))) {
        toast.error("That file could not be opened.");
      }
    }
  };

  const takePhoto = async () => {
    const record = attaching;
    if (!record) return;
    setAttaching(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toast.error("The camera is not allowed for this app. Choose a file instead.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (shot.canceled || !shot.assets?.[0]) return;
    const asset = shot.assets[0];
    await upload(
      record,
      asset.uri,
      asset.fileName || asset.uri.split("/").pop() || "vaccination.jpg",
      asset.mimeType
    );
  };

  const detach = async () => {
    if (!detaching) return;
    const { ok } = await action.run("delete", `${path}/${detaching.id}/document`, undefined, {
      success: "Document removed.",
    });
    if (ok) {
      setDetaching(null);
      onChanged();
    }
  };

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Caption>Vaccination records</Caption>
        {mayManage ? (
          <Pressable onPress={startNew} hitSlop={8} className="mt-3 flex-row items-center gap-1">
            <Ionicons name="add" size={14} color="#0891b2" />
            <Text className="text-xs font-medium text-cyan-700">Add</Text>
          </Pressable>
        ) : null}
      </View>

      {vaccinations.length === 0 ? (
        <Text className="text-xs text-slate-500">No records yet.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {vaccinations.map((v) => (
            <View key={v.id} className="rounded-lg border border-slate-200 p-3">
              <View className="flex-row items-start justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium text-slate-900">{v.vaccineName}</Text>
                  <Text className="text-xs text-slate-500">
                    {new Date(v.vaccinationDate).toLocaleDateString()}
                  </Text>
                </View>
                {mayManage ? (
                  <View className="flex-row items-center" style={{ gap: 14 }}>
                    <Pressable onPress={() => startEdit(v)} hitSlop={8}>
                      <Ionicons name="create-outline" size={16} color="#475569" />
                    </Pressable>
                    <Pressable onPress={() => setRemoving(v)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color="#e11d48" />
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {v.vet ? <Text className="mt-1 text-xs text-slate-500">Vet: {v.vet}</Text> : null}
              {v.batchNo ? <Text className="text-xs text-slate-500">Batch: {v.batchNo}</Text> : null}
              {v.notes ? <Text className="mt-1 text-xs text-slate-700">{v.notes}</Text> : null}

              <View className="mt-2 flex-row items-center" style={{ gap: 14 }}>
                {uploading === v.id ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" />
                    <Text className="text-xs text-slate-500">Uploading…</Text>
                  </View>
                ) : v.documentUrl ? (
                  <>
                    <Pressable
                      onPress={() => Linking.openURL(v.documentUrl as string)}
                      className="flex-row items-center gap-1"
                    >
                      <Ionicons name="document-attach-outline" size={14} color="#2563eb" />
                      <Text className="text-xs font-medium text-blue-600">View document</Text>
                    </Pressable>
                    {mayManage ? (
                      <>
                        <Pressable onPress={() => setAttaching(v)} hitSlop={6}>
                          <Text className="text-xs font-medium text-slate-600">Replace</Text>
                        </Pressable>
                        <Pressable onPress={() => setDetaching(v)} hitSlop={6}>
                          <Text className="text-xs font-medium text-rose-600">Remove</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </>
                ) : mayManage ? (
                  <Pressable onPress={() => setAttaching(v)} className="flex-row items-center gap-1">
                    <Ionicons name="cloud-upload-outline" size={14} color="#475569" />
                    <Text className="text-xs font-medium text-slate-600">Attach document</Text>
                  </Pressable>
                ) : (
                  <Text className="text-xs text-slate-400">No document attached.</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Record a vaccination" : "Edit vaccination"}
        subtitle={
          editing === "new"
            ? `Against every bird in ${groupName} right now`
            : `In ${groupName}`
        }
      >
        <Field
          label="Vaccine *"
          value={form.vaccineName}
          onChange={(v) => setForm({ ...form, vaccineName: v })}
          placeholder="e.g. Newcastle"
          autoFocus
        />
        <Field
          label="Date *"
          value={form.vaccinationDate}
          onChange={(v) => setForm({ ...form, vaccinationDate: v })}
          placeholder="YYYY-MM-DD"
          hint="The day it was given, not the day it is written up."
        />
        <Field
          label="Vet"
          value={form.vet}
          onChange={(v) => setForm({ ...form, vet: v })}
          placeholder="Vet name"
        />
        <Field
          label="Batch number"
          value={form.batchNo}
          onChange={(v) => setForm({ ...form, batchNo: v })}
          placeholder="Batch / lot"
        />
        <Field
          label="Notes"
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
          multiline
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button
            label={editing === "new" ? "Add record" : "Save"}
            onPress={save}
            pending={action.pending}
            full
          />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={attaching != null}
        onClose={() => setAttaching(null)}
        title="Attach a document"
        subtitle={attaching ? `${attaching.vaccineName} — an image or a PDF` : null}
      >
        <View className="mt-3" style={{ gap: 8 }}>
          <Button label="Take a photo" icon="camera-outline" onPress={takePhoto} />
          <Button
            label="Choose a file"
            icon="folder-open-outline"
            tone="secondary"
            onPress={pickFile}
          />
        </View>
        {attaching?.documentUrl ? (
          <Text className="mt-3 text-xs text-slate-500">
            The document already attached is replaced.
          </Text>
        ) : null}
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Delete ${removing?.vaccineName ?? "this record"}?`}
        body="The record and any document attached to it are removed. This cannot be undone."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />

      <Confirm
        open={detaching != null}
        title="Remove the document?"
        body="The record stays; only the attached file is deleted."
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={detach}
        onCancel={() => setDetaching(null)}
      />
    </View>
  );
}
