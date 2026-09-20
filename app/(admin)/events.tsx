import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePermissions } from "@/context/PermissionContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
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
  SearchBar,
  Sheet,
  Truncated,
} from "@/components/admin/ui";

interface EventRow {
  id: number;
  name: string | null;
  shortName: string | null;
  eventDate: string | null;
  endDate: string | null;
  isOpen: number | null;
  isPrivate: boolean;
  locationAddress: string | null;
}

/**
 * Every event, as the way into everything else.
 *
 * Almost all admin work is scoped to one event, so this is the front door
 * rather than a report: pick the event, then its sections. Open events sort
 * first because those are the ones being worked on.
 *
 * An event without a season is an empty shell — every section under it reads
 * from the active season and will say it has none. So creating an event offers
 * to open its first season in the same breath, and seasons are managed from the
 * same sheet. Making somebody create the two things in two places is how an
 * event ends up looking broken an hour after it was made.
 */
export default function AdminEvents() {
  const { can } = usePermissions();
  const { isWide, isMedium, gutter } = useResponsive();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const toast = useToast();
  const action = useAdminAction();
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);
  const [form, setForm] = useState({ name: "", shortName: "", eventDate: "", endDate: "" });
  const [seasonsFor, setSeasonsFor] = useState<EventRow | null>(null);
  const [seasonForm, setSeasonForm] = useState({ name: "", startDate: "", endDate: "" });
  const [addingSeason, setAddingSeason] = useState(false);
  const [removing, setRemoving] = useState<EventRow | null>(null);
  const { data, loading, refreshing, forbidden, error, refresh } =
    useAdminData<{ events: EventRow[] }>("/breeder/events");

  const events = data?.events ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? events.filter(
          (e) =>
            (e.name ?? "").toLowerCase().includes(q) ||
            (e.shortName ?? "").toLowerCase().includes(q) ||
            (e.locationAddress ?? "").toLowerCase().includes(q)
        )
      : events;
    // Open first, then newest.
    return [...matching].sort(
      (a, b) =>
        (b.isOpen ?? 0) - (a.isOpen ?? 0) ||
        new Date(b.eventDate ?? 0).getTime() - new Date(a.eventDate ?? 0).getTime()
    );
  }, [events, query]);

  // Only while the seasons sheet for one event is open. Declared before the
  // access guard below: a hook after a conditional return is a hook that
  // sometimes does not run, and React counts them.
  const seasonsReq = useAdminData<{
    seasons?: { id: number; name: string | null; startDate: string; endDate: string; isActive: boolean }[];
  }>(seasonsFor ? `/admin/event/${seasonsFor.id}/seasons` : null, [seasonsFor?.id]);

  if (forbidden || (!can("events.view") && !can("events.manage"))) {
    return <NoAccess what="Events" />;
  }

  const canManage = can("events.manage");

  const startNewEvent = () => {
    setForm({ name: "", shortName: "", eventDate: "", endDate: "" });
    setEditing("new");
  };

  const startEditEvent = (event: EventRow) => {
    setForm({
      name: event.name ?? "",
      shortName: event.shortName ?? "",
      eventDate: event.eventDate ? event.eventDate.slice(0, 10) : "",
      endDate: event.endDate ? event.endDate.slice(0, 10) : "",
    });
    setEditing(event);
  };

  const saveEvent = async () => {
    if (!form.name.trim()) {
      toast.error("Give the event a name.");
      return;
    }
    const isNew = editing === "new";
    const body = {
      name: form.name.trim(),
      shortName: form.shortName.trim() || undefined,
      eventDate: form.eventDate.trim() || undefined,
      endDate: form.endDate.trim() || undefined,
    };
    const { ok } = await action.run(
      isNew ? "post" : "put",
      "/admin/event",
      isNew ? body : { eventId: (editing as EventRow).id, ...body },
      { success: isNew ? "Event created." : "Event updated." }
    );
    if (ok) {
      setEditing(null);
      refresh();
    }
  };

  const saveSeason = async () => {
    if (!seasonsFor) return;
    if (!seasonForm.name.trim() || !seasonForm.startDate.trim() || !seasonForm.endDate.trim()) {
      toast.error("A season needs a name and both dates.");
      return;
    }
    const { ok } = await action.run(
      "post",
      `/admin/event/${seasonsFor.id}/seasons`,
      {
        name: seasonForm.name.trim(),
        startDate: seasonForm.startDate.trim(),
        endDate: seasonForm.endDate.trim(),
      },
      { success: "Season opened." }
    );
    if (ok) {
      setAddingSeason(false);
      setSeasonForm({ name: "", startDate: "", endDate: "" });
      seasonsReq.reload();
    }
  };

  const activate = async (seasonId: number) => {
    if (!seasonsFor) return;
    const { ok } = await action.run(
      "patch",
      `/admin/event/${seasonsFor.id}/seasons/${seasonId}/activate`,
      {},
      { success: "Season activated." }
    );
    if (ok) seasonsReq.reload();
  };

  const removeEvent = async () => {
    if (!removing) return;
    const { ok } = await action.run("delete", "/admin/event", { eventId: removing.id }, {
      success: "Event deleted.",
    });
    if (ok) {
      setRemoving(null);
      refresh();
    }
  };

  const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

  return (
    <View className="flex-1" style={{ paddingHorizontal: gutter, paddingTop: gutter }}>
      <Text className="text-2xl font-bold text-slate-900">Events</Text>
      <Text className="mt-1 text-sm text-slate-500">
        {events.filter((e) => e.isOpen === 1).length} open of {events.length}
      </Text>

      <View className="mt-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Event name or place" />
      </View>

      {canManage ? (
        <ButtonRow>
          <Button label="New event" icon="add" onPress={startNewEvent} />
        </ButtonRow>
      ) : null}

      {loading ? (
        <Loading />
      ) : (
        <ScrollView
          className="mt-3 flex-1"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {error ? <Notice>{error}</Notice> : null}

          {results.length === 0 ? (
            <Empty>{events.length === 0 ? "No events yet." : "No event matches that search."}</Empty>
          ) : (
            <View className={isWide || isMedium ? "flex-row flex-wrap" : ""} style={{ gap: 10 }}>
              {results.slice(0, 60).map((event) => {
                const start = fmt(event.eventDate);
                const end = fmt(event.endDate);
                return (
                  <Pressable
                    key={event.id}
                    onPress={() =>
                      router.push(
                        `/(admin)/event-detail?eventId=${event.id}&name=${encodeURIComponent(
                          event.name ?? ""
                        )}` as never
                      )
                    }
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    style={{ flexGrow: 1, flexBasis: isWide ? "31%" : isMedium ? "47%" : "100%" }}
                  >
                    <View className="flex-row items-start justify-between gap-2">
                      <View className="min-w-0 flex-1">
                        <Text className="font-semibold text-slate-900" numberOfLines={1}>
                          {event.name ?? "Untitled event"}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-500">
                          {event.shortName ?? "—"}
                          {start ? ` · ${start}${end ? ` – ${end}` : ""}` : ""}
                        </Text>
                      </View>
                      <View
                        className={`rounded-full px-2 py-0.5 ${
                          event.isOpen === 1 ? "bg-emerald-100" : "bg-slate-200"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-medium ${
                            event.isOpen === 1 ? "text-emerald-700" : "text-slate-600"
                          }`}
                        >
                          {event.isOpen === 1 ? "open" : "closed"}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-3 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1">
                        <Text className="text-sm font-medium text-blue-600">Open event</Text>
                        <Ionicons name="chevron-forward" size={14} color="#2563eb" />
                      </View>
                      {canManage ? (
                        <View className="flex-row" style={{ gap: 14 }}>
                          <Pressable
                            onPress={() => {
                              setSeasonForm({ name: "", startDate: "", endDate: "" });
                              setSeasonsFor(event);
                            }}
                            hitSlop={8}
                          >
                            <Ionicons name="calendar-outline" size={16} color="#64748b" />
                          </Pressable>
                          <Pressable onPress={() => startEditEvent(event)} hitSlop={8}>
                            <Ionicons name="create-outline" size={16} color="#64748b" />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Truncated shown={Math.min(results.length, 60)} total={results.length} />
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New event" : "Edit event"}
        subtitle={editing === "new" ? "Open its first season straight after" : undefined}
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          autoFocus
        />
        <Field
          label="Short name"
          value={form.shortName}
          onChange={(v) => setForm({ ...form, shortName: v })}
          hint="What it is called on a narrow screen."
        />
        <Field
          label="Starts"
          value={form.eventDate}
          onChange={(v) => setForm({ ...form, eventDate: v })}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label="Ends"
          value={form.endDate}
          onChange={(v) => setForm({ ...form, endDate: v })}
          placeholder="YYYY-MM-DD"
        />
        <ButtonRow>
          {editing !== "new" && editing != null ? (
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => {
                const row = editing as EventRow;
                setEditing(null);
                setRemoving(row);
              }}
              full
            />
          ) : (
            <Button label="Cancel" tone="secondary" onPress={() => setEditing(null)} full />
          )}
          <Button label="Save" onPress={saveEvent} pending={action.pending} full />
        </ButtonRow>
      </Sheet>

      <Sheet
        open={seasonsFor != null}
        onClose={() => {
          setSeasonsFor(null);
          setAddingSeason(false);
        }}
        title={`Seasons · ${seasonsFor?.name ?? ""}`}
        subtitle="Every section reads from the active season"
      >
        {addingSeason ? (
          <>
            <Field
              label="Name"
              value={seasonForm.name}
              onChange={(v) => setSeasonForm({ ...seasonForm, name: v })}
              placeholder="2026"
              autoFocus
            />
            <Field
              label="Starts"
              value={seasonForm.startDate}
              onChange={(v) => setSeasonForm({ ...seasonForm, startDate: v })}
              placeholder="YYYY-MM-DD"
            />
            <Field
              label="Ends"
              value={seasonForm.endDate}
              onChange={(v) => setSeasonForm({ ...seasonForm, endDate: v })}
              placeholder="YYYY-MM-DD"
              hint="Opening a season makes it the active one."
            />
            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setAddingSeason(false)} full />
              <Button label="Open it" onPress={saveSeason} pending={action.pending} full />
            </ButtonRow>
          </>
        ) : seasonsReq.loading ? (
          <Loading />
        ) : (
          <>
            <View className="mt-2">
              {(seasonsReq.data?.seasons ?? []).length === 0 ? (
                <Empty>This event has no season, so its sections have nothing to show.</Empty>
              ) : (
                <Rows>
                  {(seasonsReq.data?.seasons ?? []).map((season) => (
                    <Row
                      key={season.id}
                      title={season.name ?? `Season ${season.id}`}
                      subtitle={`${new Date(season.startDate).toLocaleDateString()} – ${new Date(
                        season.endDate
                      ).toLocaleDateString()}`}
                      right={season.isActive ? "active" : "make active"}
                      rightTone={season.isActive ? "text-emerald-600" : "text-cyan-600"}
                      onPress={season.isActive ? undefined : () => activate(season.id)}
                    />
                  ))}
                </Rows>
              )}
            </View>
            <ButtonRow>
              <Button label="Open a season" icon="add" onPress={() => setAddingSeason(true)} full />
            </ButtonRow>
          </>
        )}
      </Sheet>

      <Confirm
        open={removing != null}
        title={`Delete ${removing?.name ?? "this event"}?`}
        body="Seasons, races, entries and results under it go with it. An event that has been run should be closed, not deleted."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={removeEvent}
        onCancel={() => setRemoving(null)}
      />
    </View>
  );
}
