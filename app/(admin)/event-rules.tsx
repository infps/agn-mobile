import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { Empty, Loading, NoAccess, Notice, Screen } from "@/components/admin/ui";

interface Section {
  id: number;
  title: string | null;
  body: string | null;
  sortOrder: number | null;
  isPublished?: boolean | null;
}

/**
 * The rules as breeders read them.
 *
 * Long prose, so sections stay collapsed and open one at a time — the whole
 * document unrolled is the version nobody scrolls. This is the published text
 * rather than an editor: rules are argued over in writing, at a desk, and a
 * half-finished edit made on a phone is worse than no edit.
 */
export default function EventRules() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const [open, setOpen] = useState<number | null>(null);

  const { data, loading, refreshing, forbidden, error, refresh } = useAdminData<{
    sections?: Section[];
  }>(eventId ? `/admin/event/${eventId}/rules` : null, [eventId]);

  const sections = data?.sections ?? [];

  if (forbidden) return <NoAccess what="Rules" />;

  return (
    <Screen
      title="Rules"
      subtitle={name ? `${name} · ${sections.length} sections` : `${sections.length} sections`}
      onRefresh={refresh}
      refreshing={refreshing}
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
                          {s.body?.trim() || "This section is empty."}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
