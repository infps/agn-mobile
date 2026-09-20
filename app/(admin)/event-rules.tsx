import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
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
  Sheet,
} from "@/components/admin/ui";

interface Section {
  id: number;
  title: string | null;
  body: string | null;
  sortOrder: number | null;
  isPublished?: boolean | null;
}

/** Anything beyond paragraphs and line breaks came from the portal's editor. */
const RICH = /<(?!\/?(p|br)\b)[a-z][^>]*>/i;

/** HTML the portal wrote, shown as something readable rather than as tags. */
function toPlain(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Plain text back into the paragraph markup the portal renders. */
function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * The rules as breeders read them, and writing them.
 *
 * Long prose, so sections stay collapsed and open one at a time — the whole
 * document unrolled is the version nobody scrolls.
 *
 * Editing is plain text, not rich text. The portal writes HTML with a proper
 * editor; this reads that back as readable text and writes paragraphs. That is
 * enough for the things actually done away from a desk — publishing a section,
 * fixing a date, adding a notice — and it is honest about the one thing it
 * cannot do: a section that came back with tables or styling in it says so, and
 * warns before flattening them, because losing somebody's formatting silently
 * is worse than refusing the edit.
 */
export default function EventRules() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Section | "new" | null>(null);
  const [form, setForm] = useState({ title: "", body: "", sortOrder: "" });
  const [removing, setRemoving] = useState<Section | null>(null);

  const base = eventId ? `/admin/event/${eventId}/rules` : null;
  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    sections?: Section[];
  }>(base, [eventId]);

  const sections = data?.sections ?? [];
  const mayManage = can("content.manage");

  const wouldFlatten = editing !== "new" && editing != null && RICH.test(editing.body ?? "");

  const startNew = () => {
    setForm({ title: "", body: "", sortOrder: String(sections.length + 1) });
    setEditing("new");
  };

  const startEdit = (section: Section) => {
    setForm({
      title: section.title ?? "",
      body: toPlain(section.body),
      sortOrder: section.sortOrder != null ? String(section.sortOrder) : "",
    });
    setEditing(section);
  };

  const save = async (publish: boolean) => {
    if (!form.title.trim()) {
      toast.error("Give the section a title.");
      return;
    }
    const order = form.sortOrder.trim() ? parseInt(form.sortOrder.trim(), 10) : 0;
    const { ok } = await action.run(
      "post",
      base!,
      {
        ...(editing !== "new" && editing != null ? { id: editing.id } : {}),
        title: form.title.trim(),
        body: toHtml(form.body),
        sortOrder: isNaN(order) ? 0 : order,
        isPublished: publish,
      },
      { success: publish ? "Section published." : "Saved as a draft." }
    );
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  const togglePublished = async (section: Section) => {
    const { ok } = await action.run(
      "post",
      base!,
      {
        id: section.id,
        title: section.title ?? "Untitled",
        body: section.body ?? "",
        sortOrder: section.sortOrder ?? 0,
        isPublished: section.isPublished === false,
      },
      {
        success: section.isPublished === false ? "Published." : "Taken down to a draft.",
      }
    );
    if (ok) reload();
  };

  const remove = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", `${base}?id=${removing.id}`, undefined, {
      success: "Section removed.",
    });
    if (ok) {
      setRemoving(null);
      reload();
    }
  };

  if (forbidden) return <NoAccess what="Rules" />;

  return (
    <Screen
      title="Rules"
      subtitle={name ? `${name} · ${sections.length} sections` : `${sections.length} sections`}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        mayManage ? (
          <ButtonRow>
            <Button label="New section" icon="add" onPress={startNew} />
          </ButtonRow>
        ) : null
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <View className="mt-4" style={{ gap: 10 }}>
            {sections.length === 0 ? (
              <Empty>No rules have been published for this season.</Empty>
            ) : (
              sections.map((s, index) => {
                const isOpen = open === s.id;
                return (
                  <View
                    key={s.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <Pressable
                      onPress={() => setOpen(isOpen ? null : s.id)}
                      className="flex-row items-center gap-3 px-4 py-3"
                    >
                      <Text className="w-6 text-sm font-semibold text-slate-400">{index + 1}</Text>
                      <Text className="flex-1 font-medium text-slate-900">
                        {s.title ?? `Section ${index + 1}`}
                      </Text>
                      {s.isPublished === false && (
                        <View className="rounded-full bg-amber-100 px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-amber-700">draft</Text>
                        </View>
                      )}
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#94a3b8"
                      />
                    </Pressable>

                    {isOpen && (
                      <View className="border-t border-slate-100 px-4 py-3">
                        <Text className="text-sm leading-6 text-slate-700">
                          {toPlain(s.body) || "This section is empty."}
                        </Text>

                        {mayManage ? (
                          <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                            <Button
                              label="Edit"
                              tone="secondary"
                              icon="create-outline"
                              onPress={() => startEdit(s)}
                            />
                            <Button
                              label={s.isPublished === false ? "Publish" : "Make a draft"}
                              tone="secondary"
                              icon={s.isPublished === false ? "eye-outline" : "eye-off-outline"}
                              onPress={() => togglePublished(s)}
                            />
                            <Button
                              label="Delete"
                              tone="secondary"
                              icon="trash-outline"
                              onPress={() => setRemoving(s)}
                            />
                          </View>
                        ) : null}
                      </View>
                    )}
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
        title={editing === "new" ? "New section" : "Edit section"}
        subtitle="Plain text — a blank line starts a new paragraph"
      >
        {wouldFlatten ? (
          <Notice tone="rose">
            This section was written in the portal and has formatting this editor cannot keep —
            lists, tables or styling. Saving here will flatten it to plain paragraphs.
          </Notice>
        ) : null}

        <Field
          label="Title"
          value={form.title}
          onChange={(v) => setForm({ ...form, title: v })}
          autoFocus
        />
        <Field
          label="Order"
          value={form.sortOrder}
          onChange={(v) => setForm({ ...form, sortOrder: v })}
          keyboard="numeric"
          hint="Lower numbers come first."
        />
        <Field
          label="Text"
          value={form.body}
          onChange={(v) => setForm({ ...form, body: v })}
          multiline
        />

        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          <Button
            label="Save as draft"
            tone="secondary"
            onPress={() => save(false)}
            pending={action.pending}
            full
          />
        </ButtonRow>
        <ButtonRow>
          <Button label="Publish" onPress={() => save(true)} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Delete "${removing?.title ?? "this section"}"?`}
        body="Breeders stop seeing it immediately. There is no undo."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
