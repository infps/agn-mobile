import React, { useCallback, useMemo, useState, type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "@/service/api.service";
import { BirdPopupCtx, BirdPress, useBirdPopup } from "@/components/BirdPopupContext";
import { useAdminData } from "@/hooks/useAdminData";
import { useAdminAction } from "@/hooks/useAdminAction";
import { useToast } from "@/context/ToastContext";
import { Button, ButtonRow, ChoiceList, Sheet, money, tabular, Loading } from "@/components/admin/ui";

/**
 * The bird popup — the same one the portal opens (GET /api/birds/:id/card).
 *
 * Every detail of the bird, its entry in the event (perch, loft group,
 * baskets, owner, partners, dates), its fees and its registration's HayLoft
 * account, its race history, owners and lost history. Admins can move it to
 * another perch, loft group, basket or owner (POST
 * /api/admin/event-inventory-item/:id/move), with HayLoft's rules applied by
 * the server. The close X stays fixed at the top while the content scrolls.
 *
 * Open it from any list with useBirdPopup().openBird(birdId) or by wrapping a
 * band in <BirdPress>.
 */

// ---------------------------------------------------------------- shape of the card

interface BirdCard {
  access: "admin" | "owner" | "public";
  bird: {
    id: number; band: string; name: string | null; color: string | null; sex: number | null; rfid: string | null;
    image: string | null; active: boolean; lost: boolean; lostDate: string | null; lostRace: string | null;
    health: string | null; healthNote: string | null; note: string | null;
    father: { id: number; band: string; name: string | null } | null;
    mother: { id: number; band: string; name: string | null } | null;
    owner: { breederId: number; name: string } | null;
  };
  entry: null | {
    inventoryItemId: number; event: string | null; season: string | null; seasonId: number | null;
    registrationOwner: { breederId: number; name: string } | null; partners: string[]; loft: string | null;
    signInDate: string | null; perch: number | null; backup: boolean; replaced: boolean;
    arrivalDate: string | null; departureDate: string | null;
    loftGroup: { id: number; name: string } | null; tagColor: { id: number; name: string } | null;
    baskets: { assignmentId: number; label: string; phase: string; race: string | null }[];
    ownerHistory: { fromBreederName: string; transferredAt: string }[];
    fees: null | {
      perch: number; entry: number; entryPaid: boolean; hotSpot: number; race: number; bets: number; betsActive: boolean;
      transferDue: number; entryRefund: number; hotSpotRefund: number; betsRefund: number;
    };
    prizes: null | { capital: number; hotSpot1: number; hotSpot2: number; avgSpeed: number; bets: number };
    account: null | { charges: number; payments: number; won: number; balance: number };
  };
  races: {
    raceItemId: number; race: string; raceType: string | null; event: string | null; date: string | null;
    distance: number | null; status: string; lost: boolean; arrival: string | null; position: number | null;
    hotSpotPosition: number | null; yardsPerMin: number | null; prize: number | null;
  }[];
  lostHistory: { lost: boolean; date: string | null; race: string | null }[];
}

interface MoveOptions {
  perchCount: number;
  groups: { id: number; name: string; capacity: number | null }[];
  baskets: { id: number; label: string; phase: string; race: string | null; capacity: number; used: number }[];
  registrations: { id: number; name: string; loft: string | null }[];
}

// ---------------------------------------------------------------- open from anywhere


export function BirdPopupProvider({ children }: { children: ReactNode }) {
  const [birdId, setBirdId] = useState<number | null>(null);
  const toast = useToast();
  const openBird = useCallback((id: number) => setBirdId(id), []);
  const openBand = useCallback(
    async (band: string) => {
      try {
        const res = await api.get(`/birds/lookup?band=${encodeURIComponent(band)}`);
        setBirdId(res.data.birdId);
      } catch {
        toast.error("Bird not found");
      }
    },
    [toast]
  );
  const value = useMemo(() => ({ openBird, openBand }), [openBird, openBand]);
  return (
    <BirdPopupCtx.Provider value={value}>
      {children}
      {birdId != null && <BirdPopup birdId={birdId} onClose={() => setBirdId(null)} onOpenBird={setBirdId} />}
    </BirdPopupCtx.Provider>
  );
}

export { BirdPress, useBirdPopup };

// ---------------------------------------------------------------- the popup

const SEX = ["Cock", "Hen", "Unknown"];
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : "—");

function Line({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <View className="flex-row justify-between border-b border-slate-100 py-1.5">
      <Text className="text-sm text-slate-500">{label}</Text>
      <Text className={`max-w-[60%] text-right text-sm font-medium ${tone ?? "text-slate-900"}`} style={tabular}>
        {value}
      </Text>
    </View>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-3 rounded-xl border border-slate-200 px-3 py-2">
      <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</Text>
      {children}
    </View>
  );
}

type Tab = "details" | "fees" | "races" | "history" | "move";

function BirdPopup({ birdId, onClose, onOpenBird }: { birdId: number; onClose: () => void; onOpenBird: (id: number) => void }) {
  const { data: card, loading, error, reload } = useAdminData<BirdCard>(`/birds/${birdId}/card`, [birdId]);
  const [tab, setTab] = useState<Tab>("details");
  const b = card?.bird;
  const e = card?.entry;
  const full = card != null && card.access !== "public";

  const tabs: { key: Tab; label: string }[] = [
    { key: "details", label: "Details" },
    ...(full ? [{ key: "fees" as Tab, label: "Fees" }] : []),
    { key: "races", label: `Races (${card?.races.length ?? 0})` },
    { key: "history", label: "History" },
    ...(card?.access === "admin" && e ? [{ key: "move" as Tab, label: "Move" }] : []),
  ];

  const subtitle = e ? `${e.event ?? "Event"}${e.season && e.season !== e.event ? ` · ${e.season}` : ""}` : b?.name ?? null;

  return (
    <Sheet open onClose={onClose} title={b?.band || "Bird"} subtitle={subtitle}>
      {loading && <Loading />}
      {error && <Text className="py-6 text-center text-sm text-rose-600">{error}</Text>}
      {card && b && (
        <View>
          <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
            {tabs.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 ${tab === t.key ? "bg-slate-900" : "bg-slate-100"}`}
              >
                <Text className={`text-xs font-medium ${tab === t.key ? "text-white" : "text-slate-700"}`}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {tab === "details" && (
            <View>
              <View className="mt-3 h-48 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                {b.image ? (
                  <Image source={{ uri: b.image }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                ) : (
                  <Ionicons name="image-outline" size={40} color="#94a3b8" />
                )}
              </View>
              <Block title="Bird">
                <Line label="Band" value={b.band || "—"} />
                <Line label="Name" value={b.name || "—"} />
                <Line label="Gender" value={b.sex != null ? SEX[b.sex] ?? "—" : "—"} />
                <Line label="Color" value={b.color || "—"} />
                <Line label="RFID" value={b.rfid || "—"} />
                <Line
                  label="Status"
                  value={b.lost ? `Lost${b.lostRace ? ` · ${b.lostRace}` : ""}` : b.active ? "Active" : "Inactive"}
                  tone={b.lost ? "text-rose-600" : undefined}
                />
                <Line label="Health" value={`${b.health ?? "—"}${b.healthNote ? ` · ${b.healthNote}` : ""}`} />
                <Line label="Owner" value={b.owner?.name || "—"} />
                {b.father && (
                  <Pressable onPress={() => onOpenBird(b.father!.id)}>
                    <Line label="Father" value={b.father.band} tone="text-sky-700" />
                  </Pressable>
                )}
                {b.mother && (
                  <Pressable onPress={() => onOpenBird(b.mother!.id)}>
                    <Line label="Mother" value={b.mother.band} tone="text-sky-700" />
                  </Pressable>
                )}
              </Block>
              {e ? (
                <Block title="In this event">
                  <Line label="Registration" value={`${e.registrationOwner?.name ?? "—"}${e.loft ? ` · ${e.loft}` : ""}`} />
                  {e.partners.length > 0 && <Line label="Partners" value={e.partners.join(", ")} />}
                  <Line label="Perch" value={`${e.perch ?? "—"}${e.backup ? " (backup)" : ""}`} />
                  <Line label="Loft group" value={e.loftGroup?.name ?? "—"} />
                  <Line label="Tag color" value={e.tagColor?.name ?? "—"} />
                  <Line label="Signed in" value={day(e.signInDate)} />
                  <Line label="Arrival" value={day(e.arrivalDate)} />
                  <Line label="Departure" value={day(e.departureDate)} />
                  <Line
                    label="Baskets"
                    value={e.baskets.length ? e.baskets.map((x) => `${x.label} · ${x.phase.toLowerCase()}${x.race ? ` · ${x.race}` : ""}`).join("\n") : "—"}
                  />
                </Block>
              ) : (
                <Text className="mt-3 text-sm text-slate-500">Not entered in an event.</Text>
              )}
              {full && b.note ? (
                <Block title="Notes">
                  <Text className="text-sm text-slate-800">{b.note}</Text>
                </Block>
              ) : null}
            </View>
          )}

          {tab === "fees" && full && (
            <View>
              {e?.fees ? (
                <>
                  <Block title="This bird's fees">
                    <Line label="Perch fee" value={money(e.fees.perch)} />
                    <Line label="Entry fee" value={`${money(e.fees.entry)}${e.fees.entry > 0 ? (e.fees.entryPaid ? " · paid" : " · unpaid") : ""}`} />
                    <Line label="Hot spot fee" value={money(e.fees.hotSpot)} />
                    <Line label="Race fee" value={money(e.fees.race)} />
                    <Line label="Class bets" value={`${money(e.fees.bets)}${e.fees.betsActive ? "" : " (off)"}`} />
                    <Line label="Transfer due" value={money(e.fees.transferDue)} />
                    <Line label="Entry refund" value={money(-e.fees.entryRefund)} />
                    <Line label="Hot spot refund" value={money(-e.fees.hotSpotRefund)} />
                    <Line label="Bets refund" value={money(-e.fees.betsRefund)} />
                  </Block>
                  <Block title="This bird won">
                    <Line label="Final race" value={money(e.prizes?.capital ?? 0)} />
                    <Line label="Hot Spot 1" value={money(e.prizes?.hotSpot1 ?? 0)} />
                    <Line label="Hot Spot 2" value={money(e.prizes?.hotSpot2 ?? 0)} />
                    <Line label="Average speed" value={money(e.prizes?.avgSpeed ?? 0)} />
                    <Line label="Class bets" value={money(e.prizes?.bets ?? 0)} />
                  </Block>
                  {e.account && (
                    <Block title={`Registration account${e.registrationOwner ? ` · ${e.registrationOwner.name}` : ""}`}>
                      <Line label="Charged" value={money(e.account.charges)} />
                      <Line label="Paid" value={money(e.account.payments)} />
                      <Line label="Won" value={money(e.account.won)} />
                      <Line
                        label={e.account.balance < 0 ? "Owed to breeder" : "Balance due"}
                        value={money(Math.abs(e.account.balance))}
                        tone={e.account.balance > 0 ? "text-rose-600" : e.account.balance < 0 ? "text-emerald-600" : undefined}
                      />
                      <Text className="pt-1 text-[11px] text-slate-400">As HayLoft computes it: charged − won − paid.</Text>
                    </Block>
                  )}
                </>
              ) : (
                <Text className="mt-3 text-sm text-slate-500">No event entry.</Text>
              )}
            </View>
          )}

          {tab === "races" && (
            <View className="mt-3">
              {card.races.length === 0 ? (
                <Text className="text-sm text-slate-500">No races yet.</Text>
              ) : (
                card.races.map((r) => (
                  <View key={r.raceItemId} className="border-b border-slate-100 py-2">
                    <View className="flex-row justify-between">
                      <Text className="text-sm font-medium text-slate-900">
                        {r.race}
                        {r.raceType ? <Text className="text-slate-400"> · {r.raceType}</Text> : null}
                      </Text>
                      <Text className="text-sm font-semibold text-slate-900" style={tabular}>
                        {r.lost ? "Lost" : r.position != null ? `#${r.position}` : r.status.replace(/_/g, " ").toLowerCase()}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-500" style={tabular}>
                      {day(r.date)}
                      {r.distance ? ` · ${r.distance} mi` : ""}
                      {r.arrival ? ` · arrived ${new Date(r.arrival).toLocaleTimeString()}` : ""}
                      {r.yardsPerMin ? ` · ${r.yardsPerMin.toFixed(2)} yd/min` : ""}
                      {r.hotSpotPosition ? ` · HS #${r.hotSpotPosition}` : ""}
                      {full && r.prize ? ` · ${money(r.prize)}` : ""}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === "history" && (
            <View>
              <Block title="Owners">
                <Line label="Now" value={e?.registrationOwner?.name ?? b.owner?.name ?? "—"} />
                {(e?.ownerHistory ?? []).map((h, i) => (
                  <Line key={i} label={`Until ${day(h.transferredAt)}`} value={h.fromBreederName} />
                ))}
              </Block>
              <Block title="Lost / found">
                {card.lostHistory.length === 0 ? (
                  <Text className="py-1 text-sm text-slate-500">Never lost.</Text>
                ) : (
                  card.lostHistory.map((l, i) => (
                    <Line key={i} label={day(l.date)} value={`${l.lost ? "Lost" : "Found"}${l.race ? ` · ${l.race}` : ""}`} />
                  ))
                )}
              </Block>
            </View>
          )}

          {tab === "move" && card.access === "admin" && e && (
            <MovePanel inventoryItemId={e.inventoryItemId} entry={e} onMoved={reload} />
          )}
        </View>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- admin: move

type MoveKind = "perch" | "group" | "basket" | "owner";

function MovePanel({ inventoryItemId, entry, onMoved }: { inventoryItemId: number; entry: NonNullable<BirdCard["entry"]>; onMoved: () => void }) {
  const { data: opts, loading, reload } = useAdminData<MoveOptions>(`/admin/event-inventory-item/${inventoryItemId}/move`, [inventoryItemId]);
  const action = useAdminAction();
  const toast = useToast();
  const [kind, setKind] = useState<MoveKind>("perch");
  const [target, setTarget] = useState<string | number | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (loading || !opts) return <Loading />;

  const choices =
    kind === "perch"
      ? Array.from({ length: Math.max(opts.perchCount, 1) }, (_, i) => i + 1).map((n) => ({
          key: n, label: `Perch ${n}`, disabled: n === entry.perch, disabledReason: n === entry.perch ? "Its perch now" : null,
        }))
      : kind === "group"
        ? opts.groups.map((g) => ({ key: g.id, label: g.name, hint: g.capacity != null ? `Capacity ${g.capacity}` : null, disabled: g.id === entry.loftGroup?.id, disabledReason: "Its group now" }))
        : kind === "basket"
          ? opts.baskets.map((x) => ({
              key: x.id,
              label: x.label,
              hint: `${x.phase.toLowerCase()}${x.race ? ` · ${x.race}` : ""} · ${x.used}/${x.capacity}`,
              disabled: x.used >= x.capacity,
              disabledReason: "Full",
            }))
          : opts.registrations.map((r) => ({ key: r.id, label: r.name || "—", hint: r.loft }));

  const now =
    kind === "perch" ? `Perch ${entry.perch ?? "none"}`
    : kind === "group" ? entry.loftGroup?.name ?? "No group"
    : kind === "basket" ? entry.baskets.map((x) => x.label).join(", ") || "No basket"
    : entry.registrationOwner?.name ?? "—";

  const move = async () => {
    if (target == null) return;
    const body =
      kind === "perch" ? { kind, perch: Number(target) }
      : kind === "group" ? { kind, groupId: Number(target) }
      : kind === "basket" ? { kind, basketId: Number(target) }
      : { kind, eventInventoryId: Number(target) };
    const out = await action.run<{ message?: string }>("post", `/admin/event-inventory-item/${inventoryItemId}/move`, body);
    if (out.ok) {
      // The server says what it did (e.g. "fees cleared, perches recalculated").
      toast.success(out.data?.message ?? "Moved");
      setTarget(null);
      setConfirming(false);
      onMoved();
      reload();
    }
  };

  return (
    <View className="mt-3">
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {(["perch", "group", "basket", "owner"] as MoveKind[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setKind(k);
              setTarget(null);
              setConfirming(false);
            }}
            className={`rounded-lg border px-3 py-1.5 ${kind === k ? "border-slate-900 bg-slate-900" : "border-slate-200"}`}
          >
            <Text className={`text-xs font-medium ${kind === k ? "text-white" : "text-slate-700"}`}>
              {k === "perch" ? "Perch" : k === "group" ? "Loft group" : k === "basket" ? "Basket" : "Owner"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-3 text-xs text-slate-500">Now: {now}</Text>
      <ChoiceList choices={choices} selected={target} onPick={(k) => { setTarget(k); setConfirming(false); }} empty="Nothing to move it to." />
      <Text className="mt-2 text-[11px] text-slate-500">
        {kind === "perch" && "The other birds shift; perch fees are recalculated as in HayLoft."}
        {kind === "basket" && "Replaces the bird's basket for that phase and race."}
        {kind === "owner" &&
          "Moves this one bird to that breeder. As in HayLoft its entry fee, hot spot fee and class bets are cleared and both registrations' perch fees recalculated. Not allowed while it has refunds."}
      </Text>
      <ButtonRow>
        {kind === "owner" && !confirming ? (
          <Button label="Move" onPress={() => setConfirming(true)} disabled={target == null} full />
        ) : (
          <Button
            label={kind === "owner" ? "Confirm move" : "Move"}
            tone={kind === "owner" ? "danger" : "primary"}
            onPress={move}
            pending={action.pending}
            disabled={target == null}
            full
          />
        )}
      </ButtonRow>
    </View>
  );
}
