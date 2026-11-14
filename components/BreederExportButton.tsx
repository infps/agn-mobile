import { useToast } from "@/context/ToastContext";
import { downloadAndShare } from "@/service/download.service";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TouchableOpacity, View } from "react-native";

/**
 * The portal's "Export" dropdown, for a phone.
 *
 * GET /api/breeder/export/[kind] renders the file server-side in whichever of
 * four formats is asked for, scoped to the signed-in breeder. All this does is
 * pick the format, fetch the bytes with the bearer token and hand them to the
 * share sheet.
 */

export type BreederExportKind = "registrations" | "results" | "baskets" | "birds" | "payments";
type ExportFormat = "xlsx" | "csv" | "pdf" | "html";

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "csv", label: "CSV (.csv)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "html", label: "Web Page (.html)" },
];

interface Props {
  kind: BreederExportKind;
  eventId?: string | number;
  raceId?: string | number;
  label?: string;
}

export default function BreederExportButton({ kind, eventId, raceId, label }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(true);
    const params = [`format=${format}`];
    if (eventId !== undefined && eventId !== "") params.push(`eventId=${encodeURIComponent(String(eventId))}`);
    if (raceId !== undefined && raceId !== "") params.push(`raceId=${encodeURIComponent(String(raceId))}`);
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await downloadAndShare(
      `/breeder/export/${kind}?${params.join("&")}`,
      `${kind}-${stamp}.${format}`
    );
    setBusy(false);
    if (!result.ok) toast.error(result.problem || "Export failed");
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        disabled={busy}
        className="flex-row items-center border border-primary rounded-lg px-3 py-2 bg-white"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#189AB4" />
        ) : (
          <Ionicons name="download-outline" size={16} color="#189AB4" />
        )}
        <Text className="text-primary text-xs font-semibold ml-1">{label ?? "Export"}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable className="bg-white rounded-t-2xl p-4" onPress={() => {}}>
            <Text className="text-xs font-bold text-gray-400 uppercase mb-2">Export as</Text>
            {FORMATS.map((f) => (
              <TouchableOpacity
                key={f.format}
                onPress={() => run(f.format)}
                className="py-3 border-b border-gray-100 flex-row items-center"
              >
                <Ionicons name="document-outline" size={18} color="#189AB4" />
                <Text className="ml-3 text-base text-gray-800">{f.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setOpen(false)} className="py-3 items-center">
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
