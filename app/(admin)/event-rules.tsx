import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
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
  Row,
  Rows,
  Screen,
  SectionTitle,
  Sheet,
} from "@/components/admin/ui";

interface Section {
  id: number;
  title: string | null;
  body: string | null;
  sortOrder: number | null;
  isPublished?: boolean | null;
}

interface Video {
  id: number;
  title: string;
  url: string;
  description: string | null;
  publishedAt: string | null;
  isPublic: boolean;
  race?: { name?: string | null; raceNumber?: number | null } | null;
}

/** The headings AGN publishes, offered so an organizer starts from a shape. */
const STARTER_SECTIONS = [
  "Perch Fees",
  "Entry Fees",
  "Accepting Birds",
  "Total Payout",
  "Race Schedule",
  "General Rules",
  "Activation",
  "Refunded Payments",
  "Bird Management",
  "Teams and Syndicates",
  "Prize and Payout",
  "Return and Shipping",
];

/**
 * Published content for a season: the rules and fees page, and race videos.
 *
 * Rules are long prose, so sections stay collapsed and open one at a time — the
 * whole document unrolled is the version nobody scrolls. Fees are not a
 * separate thing: they are sections ("Perch Fees", "Entry Fees") like any
 * other, which is why changing one fee means editing one section.
 *
 * A section's text is Markdown, exactly as the portal stores it and the public
 * page renders it. It is edited here as the same raw text the portal's box
 * shows, so nothing is converted on the way in or out and a section can go
 * back and forth between phone and desk without changing shape.
 *
 * Videos are links, not uploads — recordings of releases and arrivals that
 * already live somewhere else.
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

  const [addingVideo, setAddingVideo] = useState(false);
  const [video, setVideo] = useState({ title: "", url: "" });
  const [removingVideo, setRemovingVideo] = useState<Video | null>(null);

  const base = eventId ? `/admin/event/${eventId}/rules` : null;
  const videosBase = eventId ? `/admin/event/${eventId}/videos` : null;

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    sections?: Section[];
  }>(base, [eventId]);
  const videosReq = useAdminData<{ videos?: Video[] }>(videosBase, [eventId]);

  const sections = data?.sections ?? [];
  const videos = videosReq.data?.videos ?? [];
  const mayManage = can("content.manage");

  const startNew = () => {
    setForm({ title: "", body: "", sortOrder: String(sections.length) });
    setEditing("new");
  };

  const startEdit = (section: Section) => {
    setForm({
      title: section.title ?? "",
      body: section.body ?? "",
      sortOrder: section.sortOrder != null ? String(section.sortOrder) : "",
    });
    setEditing(section);
  };

  const save = async (publish: boolean) => {
    if (!form.title.trim()) {
      toast.error("Give the section a heading.");
      return;
    }
    const order = form.sortOrder.trim() ? parseInt(form.sortOrder.trim(), 10) : 0;
    const { ok } = await action.run(
      "post",
      base!,
      {
        ...(editing !== "new" && editing != null ? { id: editing.id } : {}),
        title: form.title.trim(),
        body: form.body,
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

  const saveVideo = async () => {
    if (!video.title.trim() || !video.url.trim()) {
      toast.error("A video needs a title and a URL.");
      return;
    }
    const { ok } = await action.run(
      "post",
      videosBase!,
      { title: video.title.trim(), url: video.url.trim() },
      { success: "Video added." }
    );
    if (ok) {
      setAddingVideo(false);
      setVideo({ title: "", url: "" });
      videosReq.reload();
    }
  };

  const removeVideo = async () => {
    if (!removingVideo) return;
    const { ok } = await action.run(
      "delete",
      `${videosBase}?id=${removingVideo.id}`,
      undefined,
      { success: "Video removed." }
    );
    if (ok) {
      setRemovingVideo(null);
      videosReq.reload();
    }
  };

  /** The page breeders read sits on the portal's own site, beside its API. */
  const openPublicPage = () => {
    const site = (api.defaults.baseURL ?? "").replace(/\/api\/?$/, "");
    if (!site) {
      toast.error("The app does not know where the portal is.");
      return;
    }
    Linking.openURL(`${site}/events/${eventId}/rules`);
  };

  if (forbidden) return <NoAccess what="Rules" />;

  const starters =
    editing === "new" ? STARTER_SECTIONS.filter((s) => !sections.some((x) => x.title === s)) : [];

  return (
    <Screen
      title="Rules & videos"
      subtitle={
        `${name ? `${name} · ` : ""}${sections.length} sections · ${videos.length} videos`
      }
      onRefresh={() => {
        refresh();
        videosReq.refresh();
      }}
      refreshing={refreshing || videosReq.refreshing}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <SectionTitle>Rules & fees</SectionTitle>
          <Text className="mb-2 text-xs text-slate-500">
            Published sections are readable without an account — these are the terms a breeder
            agrees to by entering. Markdown is supported.
          </Text>
          <View className="mb-3 flex-row flex-wrap" style={{ gap: 8 }}>
            {mayManage ? <Button label="Add section" icon="add" onPress={startNew} /> : null}
            <Button
              label="View public page"
              tone="secondary"
              icon="open-outline"
              onPress={openPublicPage}
            />
          </View>

          <View style={{ gap: 10 }}>
            {sections.length === 0 ? (
              <Empty>
                {mayManage
                  ? "No sections yet. Add one — the form offers the headings AGN uses."
                  : "No rules have been written for this season."}
              </Empty>
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
                          {(s.body ?? "").trim() || "This section is empty."}
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
                              disabled={action.pending}
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

          <SectionTitle
            action={
              mayManage ? (
                <Button
                  label="Add video"
                  icon="add"
                  onPress={() => {
                    setVideo({ title: "", url: "" });
                    setAddingVideo(true);
                  }}
                />
              ) : null
            }
          >
            Videos
          </SectionTitle>
          <Text className="mb-2 text-xs text-slate-500">
            Links to recordings — releases, arrivals, loft updates. Nothing is uploaded here.
          </Text>

          {videosReq.error ? <Notice>{videosReq.error}</Notice> : null}

          {videosReq.loading ? (
            <Loading />
          ) : videos.length === 0 ? (
            <Empty>No videos yet.</Empty>
          ) : (
            <Rows>
              {videos.map((v) => {
                const race = v.race
                  ? v.race.name ?? (v.race.raceNumber != null ? `Race ${v.race.raceNumber}` : null)
                  : null;
                return (
                  <Row
                    key={v.id}
                    title={v.title}
                    subtitle={[race, v.description, v.url].filter(Boolean).join(" · ")}
                    badge={
                      v.isPublic
                        ? null
                        : { label: "private", bg: "bg-slate-100", text: "text-slate-600" }
                    }
                    leading={<Ionicons name="film-outline" size={18} color="#94a3b8" />}
                    onPress={() => Linking.openURL(v.url)}
                    onLongPress={mayManage ? () => setRemovingVideo(v) : undefined}
                  />
                );
              })}
            </Rows>
          )}
          {mayManage && videos.length > 0 ? (
            <Text className="mt-2 text-center text-xs text-slate-400">
              Tap to open a video. Press and hold to remove it.
            </Text>
          ) : null}
        </>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add section" : "Edit section"}
        subtitle="Markdown — a line starting with a dash is a bullet"
      >
        <Field
          label="Heading"
          value={form.title}
          onChange={(v) => setForm({ ...form, title: v })}
          placeholder="Perch Fees"
        />
        {starters.length > 0 ? (
          <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
            {starters.map((s) => (
              <Pressable
                key={s}
                onPress={() => setForm({ ...form, title: s })}
                className={`rounded-md border px-2 py-1 ${
                  form.title === s ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white"
                }`}
              >
                <Text className="text-[11px] text-slate-600">{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Field
          label="Order"
          value={form.sortOrder}
          onChange={(v) => setForm({ ...form, sortOrder: v })}
          keyboard="numeric"
          hint="Lower numbers come first."
        />
        <Field
          label="Body"
          value={form.body}
          onChange={(v) => setForm({ ...form, body: v })}
          placeholder={"- Per Bird – $140.00\n  - Five Birds get One FREE!\n- Perch fee is non-refundable"}
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

      <Sheet
        open={addingVideo}
        onClose={() => setAddingVideo(false)}
        title="Add video"
        subtitle="A link to where the recording already lives"
      >
        <Field
          label="Title"
          value={video.title}
          onChange={(v) => setVideo({ ...video, title: v })}
          placeholder="Hot Spot 1 release"
        />
        <Field
          label="URL"
          value={video.url}
          onChange={(v) => setVideo({ ...video, url: v })}
          placeholder="https://youtube.com/watch?v=…"
          hint="The full address, starting with https://"
        />
        <ButtonRow>
          <Button label="Cancel" tone="secondary" onPress={() => setAddingVideo(false)} full />
          <Button label="Add video" onPress={saveVideo} pending={action.pending} full />
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

      <Confirm
        open={removingVideo != null}
        title={`Remove "${removingVideo?.title ?? "this video"}"?`}
        body="The link comes off the event. The recording itself is not touched."
        confirmLabel="Remove"
        pending={action.pending}
        onConfirm={removeVideo}
        onCancel={() => setRemovingVideo(null)}
      />
    </Screen>
  );
}
