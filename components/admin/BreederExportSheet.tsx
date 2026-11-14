import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { downloadAndShare } from "@/service/download.service";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow, Sheet } from "@/components/admin/ui";

/** The columns `/admin/breeders/export` knows, in the order it writes them. */
const FIELDS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "cell", label: "Cell" },
  { key: "sms", label: "SMS" },
  { key: "address1", label: "Address" },
  { key: "city1", label: "City" },
  { key: "state1", label: "State" },
  { key: "zip1", label: "ZIP" },
] as const;

/** The same names are what the importer reads as its header row. */
export const BREEDER_CSV_COLUMNS = FIELDS.map((f) => f.key).join(",");

/**
 * The breeder directory as a CSV, with a say in which columns.
 *
 * Choosing columns matters more than it looks: the usual reason to pull this
 * file is to hand it to somebody else — a mailing house, a club secretary — and
 * the usual reason not to is that it has everybody's phone number in it. So the
 * columns are picked before the file exists rather than deleted afterwards.
 *
 * The file is the whole directory, not one event's entrants; the portal's
 * export from an event's Breeders tab is the same file, and says so here.
 */
export function BreederExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [chosen, setChosen] = useState<Set<string>>(new Set(FIELDS.map((f) => f.key)));
  const [working, setWorking] = useState(false);

  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChosen(next);
  };

  const run = async () => {
    setWorking(true);
    // Sent in the catalogue's order, so the columns come out the same way
    // whatever order they were ticked in.
    const fields = FIELDS.filter((f) => chosen.has(f.key)).map((f) => f.key);
    const res = await downloadAndShare(
      `/admin/breeders/export?fields=${fields.join(",")}`,
      "breeders.csv"
    );
    setWorking(false);
    if (res.ok) onClose();
    else if (res.problem) toast.error(res.problem);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Export breeders"
      subtitle="Every breeder on file, as a CSV"
    >
      <View className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        {FIELDS.map((f, index) => {
          const on = chosen.has(f.key);
          return (
            <Pressable
              key={f.key}
              onPress={() => toggle(f.key)}
              className={
                "flex-row items-center gap-3 bg-white px-4 py-3 " +
                (index > 0 ? "border-t border-slate-100" : "")
              }
            >
              <Ionicons
                name={on ? "checkbox" : "square-outline"}
                size={20}
                color={on ? "#0891b2" : "#cbd5e1"}
              />
              <Text className="flex-1 text-sm text-slate-900">{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ButtonRow>
        <Button label="Cancel" tone="secondary" onPress={onClose} full />
        <Button
          label={`Export ${chosen.size} column${chosen.size === 1 ? "" : "s"}`}
          icon="download-outline"
          onPress={run}
          pending={working}
          disabled={chosen.size === 0}
          full
        />
      </ButtonRow>
    </Sheet>
  );
}
