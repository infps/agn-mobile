import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Empty, Screen, SearchBar, SectionTitle } from "@/components/admin/ui";
import { eventTour, sidebarHelp, tabHelp, type HelpEntry } from "@/constants/help";

/**
 * What each part of the system is for.
 *
 * The portal keeps this behind a Help entry in its sidebar; it is the same text
 * here. It needs no permission and makes no request — somebody working out
 * what a section does should not have to be granted it first, and should be
 * able to read this with no signal at a liberation point.
 *
 * The portal's guided tour highlights tabs one after another. A phone has no
 * tab strip to point at, so the tour is given as the numbered order to set a
 * season up in, which is what the tour was really teaching.
 */
export default function AdminHelp() {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const match = useMemo(
    () => (entries: HelpEntry[]) =>
      q
        ? entries.filter(
            (e) => e.title.toLowerCase().includes(q) || e.blurb.toLowerCase().includes(q)
          )
        : entries,
    [q]
  );

  const main = match(Object.values(sidebarHelp));
  const inEvent = match(Object.values(tabHelp));

  return (
    <Screen
      title="Help & Feature Guide"
      subtitle="A quick tour of what each part of Pigeon Pulse does."
      header={<SearchBar value={query} onChange={setQuery} placeholder="Search the guide" />}
    >
      {main.length === 0 && inEvent.length === 0 ? (
        <View className="mt-4">
          <Empty>Nothing in the guide matches that.</Empty>
        </View>
      ) : null}

      <Entries title="Main Menu" entries={main} />
      <Entries title="Inside an Event (season sections)" entries={inEvent} />

      {q ? null : (
        <>
          <SectionTitle>Running a season, in order</SectionTitle>
          <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {eventTour.map((step, index) => (
              <View
                key={step.tab}
                className={`flex-row gap-3 px-4 py-3 ${index > 0 ? "border-t border-slate-100" : ""}`}
              >
                <Text className="w-5 text-sm font-semibold text-slate-400">{index + 1}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-900">{step.title}</Text>
                  <Text className="mt-0.5 text-sm text-slate-500">{step.blurb}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function Entries({ title, entries }: { title: string; entries: HelpEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <View className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {entries.map((entry, index) => (
          <View
            key={entry.title}
            className={`px-4 py-3 ${index > 0 ? "border-t border-slate-100" : ""}`}
          >
            <Text className="text-sm font-medium text-slate-900">{entry.title}</Text>
            <Text className="mt-0.5 text-sm text-slate-500">{entry.blurb}</Text>
          </View>
        ))}
      </View>
    </>
  );
}
