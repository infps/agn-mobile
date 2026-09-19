import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import api from "@/service/api.service";

export interface AdminEvent {
  id: number;
  name: string | null;
  shortName: string | null;
  isOpen: number | null;
}

/**
 * Horizontal strip of events, because almost every admin screen is really
 * "this screen, for one event".
 *
 * A dropdown would be one tap cheaper but hides which event is selected behind
 * a closed control — on a screen where picking the wrong event means checking in
 * somebody else's birds, the current selection is worth the space.
 *
 * Auto-selects the newest event on first load so the screen has data to show
 * before anyone touches it.
 */
export function EventPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (eventId: number, event: AdminEvent) => void;
}) {
  const [events, setEvents] = useState<AdminEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/breeder/events")
      .then(({ data }) => {
        if (cancelled) return;
        const list: AdminEvent[] = data?.events ?? [];
        setEvents(list);
        if (value == null && list.length > 0) onChange(list[0].id, list[0]);
      })
      .catch(() => {
        /* the screen below shows its own empty state */
      });
    return () => {
      cancelled = true;
    };
    // Intentionally once: re-running on every `value` change would fight the
    // user's selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (events.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {events.map((event) => {
        const active = event.id === value;
        return (
          <Pressable
            key={event.id}
            onPress={() => onChange(event.id, event)}
            className={`rounded-full border px-3.5 py-2 ${
              active ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white"
            }`}
          >
            <Text
              className={`text-xs font-medium ${active ? "text-white" : "text-slate-600"}`}
            >
              {event.shortName || event.name || `Event ${event.id}`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
