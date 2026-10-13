import React from "react";
import { Text, View } from "react-native";

/**
 * Things every event screen needs and none of them should each reinvent.
 *
 * The portal's `/api/breeder/events` routes hand back an Event with its
 * seasons nested underneath — the fee scheme, betting scheme and races all
 * belong to a season, not to the event. Screens that reached for
 * `event.feeScheme` or `event.races` were reading fields the API never sends.
 * `seasonOf` is the one place that knows where they really live.
 */

export type BetCategory = "BELGIAN" | "STANDARD" | "WTA";
export type SchemePool = { category: BetCategory; tierIndex: number; amount: number };

/** The season the portal treats as current: the active one, else the first. */
export function seasonOf(event: any): any | null {
  if (!event) return null;
  const seasons: any[] = Array.isArray(event.seasons) ? event.seasons : [];
  return seasons.find((s) => s?.isActive) ?? seasons[0] ?? null;
}

/** Races of the current season, tolerating an event that carries them itself. */
export function racesOf(event: any): any[] {
  return seasonOf(event)?.races ?? event?.races ?? [];
}

export function feeSchemeOf(event: any): any | null {
  return seasonOf(event)?.feeScheme ?? event?.feeScheme ?? null;
}

export function bettingSchemeOf(event: any): any | null {
  return seasonOf(event)?.bettingScheme ?? event?.bettingScheme ?? null;
}

/** A race that has been released and not yet closed. */
export function isLiveRace(race: any): boolean {
  if (race?.status) return race.status === "STARTED";
  return !!race?.startTime && race?.isClosed !== 1;
}

/** Where tapping a race should go: finished races to results, the rest to the live board. */
export function raceRoute(race: any): { pathname: "/result-detail" | "/live-race"; params: Record<string, string> } {
  const name = race?.description ?? race?.name ?? `Race ${race?.raceNumber ?? race?.id}`;
  if (race?.status === "ENDED" || race?.isClosed === 1) {
    return { pathname: "/result-detail", params: { raceId: String(race.id), name } };
  }
  return { pathname: "/live-race", params: { raceId: String(race.id) } };
}

// ── Betting pools ───────────────────────────────────────────────────────────
// Mirror of the portal's lib/betting-pools.ts. A pool is one funded tier.

const TIER_COUNTS: Record<BetCategory, number> = { BELGIAN: 7, STANDARD: 6, WTA: 5 };

function tierField(category: BetCategory, tierIndex: number): string {
  if (category === "BELGIAN") return `belgianShow${tierIndex}`;
  if (category === "STANDARD") return `standardShow${tierIndex}`;
  return `wta${tierIndex}`;
}

export function schemePools(scheme: Record<string, unknown> | null | undefined): SchemePool[] {
  if (!scheme) return [];
  const pools: SchemePool[] = [];
  (["BELGIAN", "STANDARD", "WTA"] as BetCategory[]).forEach((category) => {
    for (let tierIndex = 1; tierIndex <= TIER_COUNTS[category]; tierIndex++) {
      const amount = Number(scheme[tierField(category, tierIndex)] ?? 0) || 0;
      if (amount > 0) pools.push({ category, tierIndex, amount });
    }
  });
  return pools;
}

export function poolKey(p: { category: string; tierIndex: number }): string {
  return `${p.category}:${p.tierIndex}`;
}

// ── Registration fee preview ────────────────────────────────────────────────

export interface RegistrationFees {
  purgeFee: number;
  perchFees: number;
  raceFees: number;
  /** What is billed for hot spots now: one gate, the first one priced. */
  hotspotBilled: number;
  total: number;
  perBird: { position: number; perchFee: number; hotspot: number; purge: number }[];
}

/**
 * The same sum the register route does, for showing before committing.
 *
 * Follows the portal's lib/fee-calculator.ts with its hot spot rule set to
 * SINGLE: the four gates are one obligation, and a registration is billed the
 * first priced gate rather than all four added together. This is a preview —
 * the server works the real figure out again when the registration is made.
 */
export function registrationFees(feeScheme: any, races: any[], numBirds: number): RegistrationFees | null {
  if (!feeScheme || numBirds <= 0) return null;

  const purgeFee = feeScheme.entryFee ?? 0;
  const gates = [
    feeScheme.hotSpot1Fee ?? 0,
    feeScheme.hotSpot2Fee ?? 0,
    feeScheme.hotSpot3Fee ?? 0,
    feeScheme.hotSpotFinalFee ?? 0,
  ];
  const duePerBird = gates.find((v) => v > 0) ?? 0;

  const birdFeeItems: any[] = feeScheme.birdFeeItems ?? [];
  const raceTypeFees: any[] = feeScheme.raceTypeFees ?? [];

  let perchFees = 0;
  const perBird: RegistrationFees["perBird"] = [];
  for (let i = 1; i <= numBirds; i++) {
    const item = birdFeeItems.find((b) => b.birdNo === i);
    const perchFee = item?.birdFee ?? item?.fee ?? 0;
    perchFees += perchFee;
    perBird.push({ position: i, perchFee, hotspot: duePerBird, purge: i === 1 ? purgeFee : 0 });
  }

  let raceFees = 0;
  for (const race of races ?? []) {
    if (!race?.raceTypeId) continue;
    const rt = raceTypeFees.find((r) => r.raceTypeId === race.raceTypeId);
    if (!rt) continue;
    raceFees += feeScheme.raceFeeMode === "PER_BIRD_PER_RACE" ? rt.fee * numBirds : rt.fee;
  }

  const hotspotBilled = duePerBird * numBirds;
  return {
    purgeFee,
    perchFees,
    raceFees,
    hotspotBilled,
    total: purgeFee + perchFees + raceFees + hotspotBilled,
    perBird,
  };
}

// ── Text helpers ────────────────────────────────────────────────────────────

/** The portal shows bands without the federation prefix clutter when it can. */
export function bandOf(bird: any): string {
  if (!bird) return "";
  return (
    bird.band ||
    [bird.band1, bird.band2, bird.band3, bird.band4].filter(Boolean).join("-")
  );
}

export function money(n: number | null | undefined): string {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

/**
 * Event messages are written in the portal's rich text editor and arrive as
 * HTML. There is no web view in this app, so the markup is reduced to the text
 * it carries, keeping paragraph and list breaks.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|tr|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Bold and italic markers inside one line of markdown. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (/^(\*\*|__)/.test(part)) {
      return (
        <Text key={key} style={{ fontWeight: "700" }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (/^\*/.test(part)) {
      return (
        <Text key={key} style={{ fontStyle: "italic" }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (/^`/.test(part)) {
      return (
        <Text key={key} style={{ fontFamily: "monospace" }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    // Links read as their label; the address follows so it is not lost.
    return part.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  });
}

/**
 * Rule sections are stored as markdown. This covers what organisers actually
 * write — headings, bullet and numbered lists, emphasis, table rows — without
 * pulling in a markdown library.
 */
export function SimpleMarkdown({ source }: { source: string }) {
  const lines = (source ?? "").replace(/\r/g, "").split("\n");
  return (
    <View>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 6 }} />;

        const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
        if (heading) {
          const size = heading[1].length <= 2 ? 16 : 14;
          return (
            <Text key={i} style={{ fontSize: size, fontWeight: "700", color: "#111827", marginTop: 8, marginBottom: 2 }}>
              {inline(heading[2], `h${i}`)}
            </Text>
          );
        }

        const bullet = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
        if (bullet) {
          const marker = /^\d/.test(bullet[2]) ? bullet[2] : "•";
          return (
            <View key={i} style={{ flexDirection: "row", paddingLeft: 4 + bullet[1].length * 6, marginVertical: 1 }}>
              <Text style={{ width: 20, color: "#374151", fontSize: 14 }}>{marker}</Text>
              <Text style={{ flex: 1, color: "#374151", fontSize: 14, lineHeight: 20 }}>
                {inline(bullet[3], `b${i}`)}
              </Text>
            </View>
          );
        }

        // A table's separator row carries nothing to read.
        if (/^\s*\|?\s*:?-{2,}/.test(line)) return null;
        if (line.trim().startsWith("|")) {
          const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
          return (
            <View key={i} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 4 }}>
              {cells.map((c, ci) => (
                <Text key={ci} style={{ flex: 1, fontSize: 13, color: "#374151" }}>
                  {inline(c, `t${i}-${ci}`)}
                </Text>
              ))}
            </View>
          );
        }

        return (
          <Text key={i} style={{ color: "#374151", fontSize: 14, lineHeight: 20, marginVertical: 1 }}>
            {inline(line.replace(/^>\s?/, ""), `p${i}`)}
          </Text>
        );
      })}
    </View>
  );
}

/** Tells a breeder when their own registration is not (yet) taking part. */
export function ApprovalBanner({ status }: { status?: string | null }) {
  if (status !== "WAITING" && status !== "REJECTED") return null;
  const waiting = status === "WAITING";
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: waiting ? "#facc15" : "#f87171",
        backgroundColor: waiting ? "#fefce8" : "#fef2f2",
      }}
    >
      <Text style={{ fontSize: 13, color: "#1f2937", lineHeight: 18 }}>
        <Text style={{ fontWeight: "700" }}>
          {waiting ? "Pending approval. " : "Registration not approved. "}
        </Text>
        {waiting
          ? "Your registration is waiting for the organizer to approve it. Your birds take part once it is approved; you can pay in the meantime."
          : "The organizer did not accept this registration. Anything you paid will be refunded."}
      </Text>
    </View>
  );
}
