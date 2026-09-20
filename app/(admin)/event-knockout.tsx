import React, { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import { useToast } from "@/context/ToastContext";
import {
  Confirm,
  Empty,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  Screen,
} from "@/components/admin/ui";

interface Tournament {
  id: number;
  name: string;
  cutMode: string;
  cutValue: number;
  status: string;
  entryCount: number;
  aliveCount: number;
}

const STATUS: Record<string, { bg: string; text: string }> = {
  SETUP: { bg: "bg-slate-200", text: "text-slate-600" },
  RUNNING: { bg: "bg-emerald-100", text: "text-emerald-700" },
  FINISHED: { bg: "bg-blue-100", text: "text-blue-700" },
};

/**
 * Knockouts, and how many birds are still in them.
 *
 * The one number that matters is survivors against starters — a knockout is
 * defined by what it has eliminated.
 *
 * Advancing a round is here, but it is the most irreversible button in the app:
 * it reads the last race's finishing order, applies the cut, and eliminates
 * everything below the line. There is no undo on either side, portal or phone.
 * So the confirmation spells out the cut in the tournament's own terms —
 * "top 20%, 47 birds in" — because that is the sentence somebody can check
 * against what they meant to do.
 */
export default function EventKnockout() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const action = useAdminAction();

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    tournaments?: Tournament[];
  }>(eventId ? `/admin/event/${eventId}/tournaments` : null, [eventId]);

  const [advancing, setAdvancing] = useState<Tournament | null>(null);

  const rows = data?.tournaments ?? [];
  const mayManage = can("tournaments.manage");

  const cut = (t: Tournament) =>
    t.cutMode === "TOP_PERCENT"
      ? `top ${t.cutValue}%`
      : t.cutMode === "TOP_N"
        ? `top ${t.cutValue}`
        : t.cutMode.toLowerCase().replace(/_/g, " ");

  const advance = async () => {
    if (!advancing) return;
    // No body: the server applies the tournament's own cut rule rather than a
    // hand-picked survivor list, which is the only form that makes sense here.
    const { ok, data: said } = await action.run<{ message?: string }>(
      "post",
      `/admin/tournament/${advancing.id}/advance`
    );
    if (ok) {
      toast.success(said?.message ?? "Round advanced.");
      setAdvancing(null);
      reload();
    }
  };

  if (forbidden) return <NoAccess what="Knockout" />;

  const alive = rows.reduce((s, t) => s + t.aliveCount, 0);
  const entered = rows.reduce((s, t) => s + t.entryCount, 0);

  return (
    <Screen
      title="Knockout"
      subtitle={name ? `${name} · ${rows.length} running` : `${rows.length} running`}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Knockouts" value={rows.length} basis="31%" />
            <Figure label="Birds entered" value={entered} basis="31%" />
            <Figure label="Still alive" value={alive} tone="text-emerald-600" basis="31%" />
          </FigureRow>

          <View className="mt-4">
            {rows.length === 0 ? (
              <Empty>No knockouts have been set up for this season.</Empty>
            ) : (
              <Rows>
                {rows.map((t) => {
                  const runnable = mayManage && t.status !== "FINISHED" && t.aliveCount > 0;
                  return (
                    <Row
                      key={t.id}
                      title={t.name}
                      subtitle={`Cut to ${cut(t)}`}
                      right={runnable ? "Cut" : `${t.aliveCount} of ${t.entryCount}`}
                      rightSub={runnable ? `${t.aliveCount} in` : "still in"}
                      rightTone={
                        runnable
                          ? "text-rose-600"
                          : t.aliveCount > 0
                            ? "text-emerald-600"
                            : "text-slate-400"
                      }
                      badge={{
                        label: t.status.toLowerCase(),
                        ...(STATUS[t.status] ?? STATUS.SETUP),
                      }}
                      onPress={runnable ? () => setAdvancing(t) : undefined}
                    />
                  );
                })}
              </Rows>
            )}
          </View>
        </>
      )}

      <Confirm
        open={advancing != null}
        title={`Cut ${advancing?.name ?? "this knockout"}?`}
        body={
          advancing
            ? `${advancing.aliveCount} birds are still in. The cut keeps ${cut(
                advancing
              )} from the last race's finishing order and eliminates the rest. This cannot be undone, here or in the portal.`
            : ""
        }
        confirmLabel="Make the cut"
        pending={action.pending}
        onConfirm={advance}
        onCancel={() => setAdvancing(null)}
      />
    </Screen>
  );
}
