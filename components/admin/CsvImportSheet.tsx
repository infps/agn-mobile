import React, { useState } from "react";
import { Text, View } from "react-native";
import { File } from "expo-file-system";
import api from "@/service/api.service";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  ButtonRow,
  Empty,
  Figure,
  FigureRow,
  Loading,
  Notice,
  Row,
  Rows,
  Sheet,
} from "@/components/admin/ui";

/** Every importer's rows carry at least these; the rest differs per kind. */
interface PreviewRow {
  rowIndex: number;
  status: "ok" | "error";
  message?: string;
  [key: string]: unknown;
}

/**
 * Importing a CSV, in the two halves the portal already splits it into.
 *
 * The server parses and validates the file and hands back a row-by-row verdict
 * without writing anything; only the rows it marked `ok` are then sent to be
 * committed. That split is the whole safety of the thing — a spreadsheet with
 * one bad row in the middle imports the other ninety-nine instead of failing
 * whole, and somebody can see which one it refused before agreeing to any of it.
 *
 * The file is sent as multipart because that is what the endpoint reads. React
 * Native's FormData takes a `{ uri, name, type }` shape rather than a real Blob,
 * and Content-Type has to be left unset so the runtime can write its own
 * boundary — setting it by hand produces a body the server cannot split.
 */
export function CsvImportSheet({
  open,
  onClose,
  onImported,
  title,
  previewPath,
  commitPath,
  /** Which fields to show on a row, in order. */
  describe,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  title: string;
  previewPath: string;
  commitPath: string;
  describe: (row: PreviewRow) => { title: string; subtitle?: string };
}) {
  const toast = useToast();
  const action = useAdminAction();

  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const ok = (rows ?? []).filter((r) => r.status === "ok");
  const bad = (rows ?? []).filter((r) => r.status !== "ok");

  const pick = async () => {
    setReading(true);
    try {
      const picked = await File.pickFileAsync({
        mimeTypes: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain"],
      });
      // Cancelling is the normal way out of a picker, not an error.
      if (picked.canceled || !picked.result) {
        setReading(false);
        return;
      }

      const uri = picked.result.uri;
      const name = uri.split("/").pop() || "import.csv";
      const form = new FormData();
      // React Native wants the file described, not read into memory.
      form.append("file", {
        uri,
        name,
        type: "text/csv",
      } as unknown as Blob);

      const { data } = await api.post(previewPath, form, {
        // Unset so the runtime writes its own multipart boundary.
        headers: { "Content-Type": undefined as unknown as string },
        transformRequest: (value) => value,
      });

      setFilename(name);
      setRows(data?.preview ?? []);
    } catch (err: any) {
      const said = err?.response?.data?.message;
      // A cancelled picker is not a failure worth a red toast.
      if (!/cancel/i.test(String(err?.message ?? ""))) {
        toast.error(said ?? "That file could not be read.");
      }
    } finally {
      setReading(false);
    }
  };

  const commit = async () => {
    if (ok.length === 0) return;
    const { ok: done } = await action.run("post", commitPath, { rows: ok }, {
      success: `${ok.length} row${ok.length === 1 ? "" : "s"} imported.`,
    });
    if (done) {
      setRows(null);
      setFilename(null);
      onClose();
      onImported();
    }
  };

  const close = () => {
    setRows(null);
    setFilename(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      subtitle={filename ?? "Pick a CSV — nothing is written until you agree to it"}
    >
      {reading ? (
        <Loading />
      ) : rows == null ? (
        <>
          <Notice>
            The file is checked row by row first. You will see what it would import, and what it
            refused, before anything is written.
          </Notice>
          <ButtonRow>
            <Button label="Choose a file" icon="document-outline" onPress={pick} full />
          </ButtonRow>
        </>
      ) : (
        <>
          <FigureRow>
            <Figure label="Will import" value={ok.length} tone="text-emerald-600" basis="47%" />
            <Figure
              label="Refused"
              value={bad.length}
              tone={bad.length > 0 ? "text-rose-600" : "text-slate-900"}
              basis="47%"
            />
          </FigureRow>

          {rows.length === 0 ? (
            <View className="mt-4">
              <Empty>That file had no rows the importer could read.</Empty>
            </View>
          ) : null}

          {bad.length > 0 ? (
            <>
              <Text className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Refused
              </Text>
              <Rows>
                {bad.slice(0, 20).map((r) => (
                  <Row
                    key={`bad-${r.rowIndex}`}
                    title={`Row ${r.rowIndex}`}
                    subtitle={r.message ?? "not valid"}
                    right="skip"
                    rightTone="text-rose-600"
                  />
                ))}
              </Rows>
              {bad.length > 20 ? (
                <Text className="mt-2 text-xs text-slate-400">
                  and {bad.length - 20} more.
                </Text>
              ) : null}
            </>
          ) : null}

          {ok.length > 0 ? (
            <>
              <Text className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Will import
              </Text>
              <Rows>
                {ok.slice(0, 25).map((r) => {
                  const shown = describe(r);
                  return (
                    <Row
                      key={`ok-${r.rowIndex}`}
                      title={shown.title}
                      subtitle={shown.subtitle}
                      right={`row ${r.rowIndex}`}
                      rightTone="text-slate-400"
                    />
                  );
                })}
              </Rows>
              {ok.length > 25 ? (
                <Text className="mt-2 text-xs text-slate-400">
                  and {ok.length - 25} more.
                </Text>
              ) : null}
            </>
          ) : null}

          <ButtonRow>
            <Button
              label="Pick another"
              tone="secondary"
              onPress={() => {
                setRows(null);
                setFilename(null);
              }}
              full
            />
            <Button
              label={`Import ${ok.length}`}
              onPress={commit}
              pending={action.pending}
              disabled={ok.length === 0}
              full
            />
          </ButtonRow>
        </>
      )}
    </Sheet>
  );
}
