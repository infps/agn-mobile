import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import {
  Button,
  ButtonRow,
  Confirm,
  Loading,
  NoAccess,
  Notice,
  Rows,
  Screen,
  SectionTitle,
  money,
} from "@/components/admin/ui";
import { type AdminEvent, EventFormSheet } from "@/components/admin/EventFormSheet";
import { Info, isStaff, showDate } from "@/components/admin/formBits";

interface Stats {
  seasonName: string | null;
  feeSchemeName: string | null;
  bettingSchemeName: string | null;
  finalPrizeSchemeName: string | null;
  hotSpot1PrizeName: string | null;
  hotSpot2PrizeName: string | null;
  hotSpot3PrizeName: string | null;
  hotSpotAvgPrizeName: string | null;
  totalPerchFee: number;
  reservedWaiting: number;
  reservedBirds: number;
  hereCount: number;
  lostBirds: number;
  replacedCount: number;
  entryFeeBirds: number;
  entryFees: number;
  entryRefund: number;
  entryCommission: number;
  entryTotalValue: number;
  hotSpotBirds: number;
  hotSpotFees: number;
  hotSpotRefunds: number;
  hotSpotCommission: number;
  hotSpotValue: number;
  totalBets: number;
  betsRefund: number;
  betsCommission: number;
  betsValue: number;
  paymentClasses: number;
}

interface Season {
  id: number;
  name: string;
  isActive: boolean;
}

/**
 * What an event is, and what its season adds up to.
 *
 * This is the portal's Details tab. The event's own facts — dates, visibility,
 * where it is, who to call — sit beside the season's six totals, because the
 * question asked here is usually "is this set up right, and how is it doing",
 * and that is one glance at both.
 *
 * The totals belong to a season, not to the event. They follow the active one
 * unless the seasons screen sent somebody here to look at an older one, in
 * which case its name is stated in the subtitle — a set of figures with no
 * season on them reads as this year's.
 *
 * Coordinates open the phone's map app rather than drawing one, for the same
 * reason the stations do: somebody checking this on the road wants directions.
 */
export default function EventSettings() {
  const { eventId, name, seasonId } = useLocalSearchParams<{
    eventId?: string;
    name?: string;
    seasonId?: string;
  }>();
  const { can, canAny, role } = usePermissions();
  const router = useRouter();
  const action = useAdminAction();

  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const detail = useAdminData<{ event?: AdminEvent }>(
    eventId ? `/admin/event?eventId=${eventId}` : null,
    [eventId]
  );
  const seasonsReq = useAdminData<{ seasons?: Season[]; activeSeasonId?: number | null }>(
    eventId ? `/admin/event/${eventId}/seasons` : null,
    [eventId]
  );
  // The figures are guarded on viewing specifically, so they are only asked for
  // by somebody who holds it.
  const mayStats = can("events.view");
  const viewed = seasonId ? Number(seasonId) : (seasonsReq.data?.activeSeasonId ?? null);
  const statsReq = useAdminData<Stats>(
    eventId && mayStats && viewed != null
      ? `/admin/event/${eventId}/dashboard-stats?seasonId=${viewed}`
      : null,
    [eventId, viewed, mayStats]
  );

  if (detail.forbidden || !canAny("events.view", "events.manage")) {
    return <NoAccess what="Event details" />;
  }

  const event = detail.data?.event ?? null;
  const stats = statsReq.data;
  const seasons = seasonsReq.data?.seasons ?? [];
  const season = seasons.find((s) => s.id === viewed) ?? null;
  // The event's own routes check the account's role, not a permission.
  const mayWrite = isStaff(role);
  const title = event?.name ?? name ?? "Event";

  const refresh = () => {
    detail.refresh();
    seasonsReq.reload();
    statsReq.reload();
  };

  const remove = async () => {
    const { ok } = await action.run("delete", "/admin/event", { eventId: Number(eventId) }, {
      success: "Event deleted.",
    });
    if (ok) {
      setRemoving(false);
      router.replace("/(admin)/events" as never);
    }
  };

  const hasPin = event?.latitude != null && event?.longitude != null;
  const start = showDate(event?.eventDate);
  const end = showDate(event?.endDate);

  return (
    <Screen
      title={title}
      subtitle={
        [
          event?.shortName,
          event?.eventType?.name,
          season ? `${season.name}${season.isActive ? "" : " (not the active season)"}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Details"
      }
      onRefresh={refresh}
      refreshing={detail.refreshing}
      header={
        <ButtonRow>
          {mayWrite && event ? (
            <Button label="Edit event" icon="create-outline" onPress={() => setEditing(true)} />
          ) : null}
          <Button
            label="Seasons"
            tone="secondary"
            icon="calendar-outline"
            onPress={() =>
              router.push(
                `/(admin)/event-seasons?eventId=${eventId}&name=${encodeURIComponent(title)}` as never
              )
            }
          />
        </ButtonRow>
      }
    >
      {detail.loading ? (
        <Loading />
      ) : (
        <>
          {detail.error ? <Notice>{detail.error}</Notice> : null}

          {event ? (
            <>
              {event.bannerImage ? (
                <Image
                  source={{ uri: event.bannerImage }}
                  style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12, marginTop: 16 }}
                  contentFit="cover"
                />
              ) : null}

              <View className="mt-4 flex-row items-start gap-3">
                {event.logoImage ? (
                  <Image
                    source={{ uri: event.logoImage }}
                    style={{ width: 56, height: 56, borderRadius: 8 }}
                    contentFit="cover"
                  />
                ) : null}
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap" style={{ gap: 6 }}>
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
                    <View
                      className={`rounded-full px-2 py-0.5 ${
                        event.isPrivate ? "bg-amber-100" : "bg-slate-100"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-medium ${
                          event.isPrivate ? "text-amber-700" : "text-slate-600"
                        }`}
                      >
                        {event.isPrivate ? "private" : "public"}
                      </Text>
                    </View>
                  </View>
                  {event.description ? (
                    <Text className="mt-2 text-sm text-slate-600">{event.description}</Text>
                  ) : null}
                </View>
              </View>
            </>
          ) : null}

          {!mayStats ? null : viewed == null && !seasonsReq.loading ? (
            <Notice>This event has no season yet, so there are no figures to show.</Notice>
          ) : statsReq.loading || seasonsReq.loading ? (
            <Loading />
          ) : statsReq.error ? (
            <Notice>{statsReq.error}</Notice>
          ) : stats ? (
            <>
              <SectionTitle>Birds</SectionTitle>
              <Rows>
                <Info label="Reserved, waiting" value={stats.reservedWaiting} />
                <Info label="Reserved" value={stats.reservedBirds} />
                <Info label="Here" value={stats.hereCount} />
                <Info label="Lost" value={stats.lostBirds} />
                <Info label="Replaced" value={stats.replacedCount} />
              </Rows>

              <SectionTitle>Capital</SectionTitle>
              <Rows>
                <Info label="Birds" value={stats.entryFeeBirds} />
                <Info label="Entry fees" value={money(stats.entryFees)} />
                <Info label="Entry refund" value={money(stats.entryRefund)} />
                <Info label="Commission" value={money(stats.entryCommission)} />
                <Info label="Total value" value={money(stats.entryTotalValue)} />
              </Rows>

              <SectionTitle>Hot spot capital</SectionTitle>
              <Rows>
                <Info label="Birds" value={stats.hotSpotBirds} />
                <Info label="Perch fees (hot spot)" value={money(stats.hotSpotFees)} />
                <Info label="Refunds" value={money(stats.hotSpotRefunds)} />
                <Info label="Commission" value={money(stats.hotSpotCommission)} />
                <Info label="Value" value={money(stats.hotSpotValue)} />
              </Rows>

              <SectionTitle>Bets</SectionTitle>
              <Rows>
                <Info label="Bets" value={money(stats.totalBets)} />
                <Info label="Bets refund" value={money(stats.betsRefund)} />
                <Info label="Commission" value={money(stats.betsCommission)} />
                <Info label="Value" value={money(stats.betsValue)} />
              </Rows>

              <SectionTitle>Payment</SectionTitle>
              <Rows>
                <Info label="Perch fee" value={money(stats.totalPerchFee)} />
                <Info label="Entry fee" value={money(stats.entryFees)} />
                <Info label="Perch fee (hot spot)" value={money(stats.hotSpotFees)} />
                <Info label="Classes" value={money(stats.paymentClasses)} />
              </Rows>

              <SectionTitle>Season schemes</SectionTitle>
              <Rows>
                <Info label="Season" value={stats.seasonName} />
                <Info label="Fee scheme" value={stats.feeSchemeName} />
                <Info label="Betting scheme" value={stats.bettingSchemeName} />
                <Info label="Final prize" value={stats.finalPrizeSchemeName} />
                <Info label="Hot spot 1" value={stats.hotSpot1PrizeName} />
                <Info label="Hot spot 2" value={stats.hotSpot2PrizeName} />
                <Info label="Hot spot 3" value={stats.hotSpot3PrizeName} />
                <Info label="Hot spot average" value={stats.hotSpotAvgPrizeName} />
              </Rows>
            </>
          ) : null}

          {event ? (
            <>
              <SectionTitle>Event</SectionTitle>
              <Rows>
                <Info label="Dates" value={start ? `${start}${end ? ` – ${end}` : ""}` : null} />
                <Info label="Type" value={event.eventType?.name} />
                <Info label="Status" value={event.isOpen === 1 ? "Open" : "Closed"} />
                <Info
                  label="Visibility"
                  value={event.isPrivate ? "Private — registered breeders only" : "Public"}
                />
                <Info label="Created by" value={event.createdBy?.name} />
              </Rows>

              <SectionTitle>Location</SectionTitle>
              <Rows>
                <Info label="Address" value={event.locationAddress} />
                <Info
                  label="Pin"
                  value={
                    hasPin
                      ? `${event.latitude!.toFixed(5)}, ${event.longitude!.toFixed(5)}`
                      : "No location pinned"
                  }
                />
              </Rows>
              {hasPin ? (
                <Pressable
                  onPress={() =>
                    Linking.openURL(
                      `https://maps.google.com/?q=${event.latitude},${event.longitude}`
                    )
                  }
                  className="mt-2 flex-row items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5"
                >
                  <Ionicons name="navigate-outline" size={14} color="#2563eb" />
                  <Text className="text-xs font-medium text-blue-600">Open in maps</Text>
                </Pressable>
              ) : null}

              <SectionTitle>Contact</SectionTitle>
              <Rows>
                <Info label="Name" value={event.contactName} />
                <Info label="Email" value={event.contactEmail} />
                <Info label="Phone" value={event.contactPhone} />
                <Info label="Website" value={event.contactWebsite} />
                <Info label="Address" value={event.contactAddress} />
              </Rows>

              <SectionTitle>Social</SectionTitle>
              <Rows>
                <Info label="YouTube" value={event.socialYt} />
                <Info label="Facebook" value={event.socialFb} />
                <Info label="Twitter" value={event.socialTwitter} />
                <Info label="Instagram" value={event.socialInsta} />
              </Rows>

              {mayWrite ? (
                <ButtonRow>
                  <Button
                    label="Delete event"
                    tone="secondary"
                    icon="trash-outline"
                    onPress={() => setRemoving(true)}
                  />
                </ButtonRow>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <EventFormSheet
        open={editing}
        event={event}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          detail.reload();
        }}
      />

      <Confirm
        open={removing}
        title={`Delete ${title}?`}
        body="This cannot be undone, and the server refuses while the event still has seasons under it. An event that has been run should be closed, not deleted."
        confirmLabel="Delete"
        pending={action.pending}
        onConfirm={remove}
        onCancel={() => setRemoving(false)}
      />
    </Screen>
  );
}
