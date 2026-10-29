import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { usePermissions } from "@/context/PermissionContext";
import {
  Button,
  ButtonRow,
  type Choice,
  ChoiceList,
  Confirm,
  Empty,
  Figure,
  FigureRow,
  Loading,
  NoAccess,
  Notice,
  Row,
  Rows,
  SearchBar,
  Screen,
  Sheet,
  money,
} from "@/components/admin/ui";
import { Caption, Segments, fullName } from "@/components/admin/MoneyBits";

interface ListedBird {
  band: string | null;
  band1: string | null;
  band2: string | null;
  band3: string | null;
  band4: string | null;
  color: string | null;
  sex: number | null;
  isLost: number | null;
  isActive: number | null;
}

interface Listing {
  id: number;
  originalBreederId: number;
  listingPrice: number;
  status: "AVAILABLE" | "SOLD" | string;
  purchasedAt: string | null;
  createdAt: string;
  originalBreeder?: { firstName: string | null; lastName: string | null } | null;
  purchasedBy?: { firstName: string | null; lastName: string | null } | null;
  items?: {
    id: number;
    inventoryItem?: { birdNo: number | null; bird?: ListedBird | null } | null;
  }[];
}

/** One registration on this season — the only people a listing can be sold to. */
interface Registration {
  breederId: number | null;
  loft: string | null;
  breeder?: { firstName: string | null; lastName: string | null } | null;
}

type Filter = "available" | "sold" | "all";

const bandOf = (b: ListedBird | null | undefined) =>
  [b?.band1, b?.band2, b?.band3, b?.band4].filter(Boolean).join("-") || b?.band || null;

/**
 * Birds forfeited by defaulters, and who bought them.
 *
 * Two questions, and the split between them is the screen: what is still for
 * sale, and what has gone. Available comes first because that is the list
 * somebody reads out loud at an event.
 *
 * Listings arrive here from the Defaulters screen, which is where birds are
 * moved into the store. What happens to one afterwards is here: it is sold to
 * a breeder registered on the season, or taken back off the shelf.
 *
 * Selling is the one that cannot be walked back. The birds move onto the
 * buyer's registration the moment the sale is recorded, and nothing in the
 * portal moves them home again — so the buyer and the price are read back
 * before it is sent, not after.
 */
export default function EventStore() {
  const { eventId, name } = useLocalSearchParams<{ eventId?: string; name?: string }>();
  const { can } = usePermissions();
  const action = useAdminAction();

  const [filter, setFilter] = useState<Filter>("available");
  const [opened, setOpened] = useState<Listing | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyer, setBuyer] = useState<{ id: number; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const { data, loading, refreshing, forbidden, error, refresh, reload } = useAdminData<{
    listings?: Listing[];
  }>(eventId ? `/admin/event/${eventId}/store` : null, [eventId]);

  // Only once a sale is actually being recorded: the registration list is long
  // and nobody browsing the store needs it loaded.
  const buyersReq = useAdminData<{ eventInventory?: Registration[] }>(
    choosing && eventId ? `/admin/event/${eventId}/event-inventory` : null,
    [choosing, eventId]
  );

  const listings = useMemo(() => data?.listings ?? [], [data]);
  const mayManage = can("store.manage");

  const isSold = (l: Listing) => (l.status ?? "").toUpperCase() === "SOLD";

  const rows = useMemo(
    () =>
      listings.filter((l) =>
        filter === "all" ? true : filter === "sold" ? isSold(l) : !isSold(l)
      ),
    [listings, filter]
  );

  // Every listing opens on its own summary, with no buyer carried over.
  useEffect(() => {
    setChoosing(false);
    setBuyer(null);
    setBuyerQuery("");
    setRemoving(false);
  }, [opened?.id]);

  const buyers: Choice[] = useMemo(() => {
    const seen = new Set<number>();
    const all = (buyersReq.data?.eventInventory ?? []).filter((r) => {
      if (r.breederId == null || seen.has(r.breederId)) return false;
      seen.add(r.breederId);
      return true;
    });
    const q = buyerQuery.trim().toLowerCase();
    const matched = q
      ? all.filter((r) => `${fullName(r.breeder, "")} ${r.loft ?? ""}`.toLowerCase().includes(q))
      : all;
    return matched.map((r) => ({
      key: r.breederId as number,
      label: fullName(r.breeder, `Breeder #${r.breederId}`),
      hint: r.loft,
    }));
  }, [buyersReq.data, buyerQuery]);

  const sell = async () => {
    if (!opened || !buyer) return;
    const { ok } = await action.run(
      "post",
      `/admin/event/${eventId}/store/${opened.id}/purchase`,
      { buyerBreederId: buyer.id },
      { success: `Sold to ${buyer.name}.` }
    );
    setBuyer(null);
    if (ok) {
      setOpened(null);
      reload();
    }
  };

  const remove = async () => {
    if (!opened) return;
    const { ok } = await action.run(
      "delete",
      `/admin/event/${eventId}/store`,
      { listingId: opened.id },
      { success: "Listing removed." }
    );
    setRemoving(false);
    if (ok) {
      setOpened(null);
      reload();
    }
  };

  if (forbidden) return <NoAccess what="The event store" />;

  const sold = listings.filter(isSold);
  const takings = sold.reduce((s, l) => s + (l.listingPrice ?? 0), 0);
  const seller = (l: Listing | null) =>
    fullName(l?.originalBreeder, l ? `Breeder #${l.originalBreederId}` : "");
  const openedBirds = opened?.items ?? [];

  return (
    <Screen
      title="Store"
      subtitle={name ?? undefined}
      onRefresh={refresh}
      refreshing={refreshing}
      header={
        <Segments<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "available", label: `For sale (${listings.length - sold.length})` },
            { key: "sold", label: `Sold (${sold.length})` },
            { key: "all", label: "All" },
          ]}
        />
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice>{error}</Notice> : null}

          <FigureRow>
            <Figure label="Listings" value={listings.length} basis="31%" />
            <Figure label="Sold" value={sold.length} basis="31%" />
            <Figure label="Taken" value={money(takings)} tone="text-emerald-600" basis="31%" />
          </FigureRow>

          <View className="mt-4">
            {rows.length === 0 ? (
              <Empty>
                {listings.length === 0
                  ? "Nothing has been listed in the store. Birds are moved here from the Defaulters screen."
                  : filter === "available"
                    ? "Everything listed has sold."
                    : "Nothing has sold yet."}
              </Empty>
            ) : (
              <Rows>
                {rows.map((l) => {
                  const count = l.items?.length ?? 0;
                  const to = l.purchasedBy ? fullName(l.purchasedBy, "") : "";
                  return (
                    <Row
                      key={l.id}
                      title={seller(l)}
                      subtitle={
                        [
                          `${count} bird${count === 1 ? "" : "s"}`,
                          to ? `sold to ${to}` : null,
                          l.purchasedAt ? new Date(l.purchasedAt).toLocaleDateString() : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      right={money(l.listingPrice)}
                      rightSub={isSold(l) ? "sold" : "for sale"}
                      rightTone={isSold(l) ? "text-emerald-600" : "text-slate-900"}
                      onPress={() => setOpened(l)}
                    />
                  );
                })}
              </Rows>
            )}
          </View>
        </>
      )}

      <Sheet
        open={opened != null}
        onClose={() => setOpened(null)}
        title={choosing ? "Assign purchase" : `${seller(opened)}'s birds`}
        subtitle={
          choosing
            ? `${money(opened?.listingPrice)} — pick the breeder who bought this listing`
            : `${money(opened?.listingPrice)} · ${
                opened && isSold(opened)
                  ? `sold to ${fullName(opened.purchasedBy, "a buyer")}${
                      opened.purchasedAt
                        ? ` on ${new Date(opened.purchasedAt).toLocaleDateString()}`
                        : ""
                    }`
                  : "for sale"
              }`
        }
      >
        {choosing ? (
          <>
            <View className="mt-2">
              <SearchBar value={buyerQuery} onChange={setBuyerQuery} placeholder="Breeder or loft" />
            </View>
            {buyersReq.loading ? (
              <Loading />
            ) : buyersReq.forbidden ? (
              <Notice>
                Buyers are picked from the breeders registered on this season, and breeder access
                has not been given to you.
              </Notice>
            ) : buyersReq.error ? (
              <Notice>{buyersReq.error}</Notice>
            ) : (
              <ChoiceList
                choices={buyers}
                onPick={(key) => {
                  const found = buyers.find((b) => b.key === key);
                  if (found) setBuyer({ id: Number(key), name: found.label });
                }}
                empty={buyerQuery ? "Nobody matches that." : "No breeders are registered on this season."}
              />
            )}
            <ButtonRow>
              <Button label="Back" tone="secondary" onPress={() => setChoosing(false)} full />
            </ButtonRow>
          </>
        ) : (
          <>
            <Caption>Birds ({openedBirds.length})</Caption>
            {openedBirds.length === 0 ? (
              <Empty>No birds are left on this listing.</Empty>
            ) : (
              <Rows>
                {openedBirds.map((i) => {
                  const b = i.inventoryItem?.bird;
                  const sex = b?.sex === 1 ? "Cock" : b?.sex === 0 ? "Hen" : null;
                  return (
                    <Row
                      key={i.id}
                      title={bandOf(b) ?? `Bird #${i.inventoryItem?.birdNo ?? "?"}`}
                      subtitle={[b?.color, sex].filter(Boolean).join(" · ") || undefined}
                      badge={
                        b?.isLost === 1
                          ? { label: "lost", bg: "bg-rose-100", text: "text-rose-700" }
                          : b?.isActive === 0
                            ? { label: "inactive", bg: "bg-slate-200", text: "text-slate-600" }
                            : null
                      }
                    />
                  );
                })}
              </Rows>
            )}

            {mayManage && opened && !isSold(opened) ? (
              <ButtonRow>
                <Button
                  label="Remove"
                  tone="danger"
                  icon="trash-outline"
                  onPress={() => setRemoving(true)}
                  full
                />
                <Button
                  label="Assign purchase"
                  icon="person-outline"
                  onPress={() => setChoosing(true)}
                  full
                />
              </ButtonRow>
            ) : null}
          </>
        )}

        <Confirm
          open={buyer != null}
          title={`Sell to ${buyer?.name ?? ""} for ${money(opened?.listingPrice)}?`}
          body={`${openedBirds.length} bird${openedBirds.length === 1 ? "" : "s"} from ${seller(
            opened
          )} move onto ${buyer?.name ?? "the buyer"}'s registration at ${money(
            opened?.listingPrice
          )}. This cannot be undone from the app or the portal.`}
          confirmLabel="Confirm purchase"
          pending={action.pending}
          onConfirm={sell}
          onCancel={() => setBuyer(null)}
        />

        <Confirm
          open={removing}
          title="Remove this listing?"
          body={`${seller(opened)}'s ${openedBirds.length} bird${
            openedBirds.length === 1 ? "" : "s"
          } at ${money(opened?.listingPrice)} come off the store. The birds stay on their registration and can be listed again from Defaulters.`}
          confirmLabel="Remove"
          pending={action.pending}
          onConfirm={remove}
          onCancel={() => setRemoving(false)}
        />
      </Sheet>
    </Screen>
  );
}

export { ErrorBoundary } from "@/components/ErrorScreen";
