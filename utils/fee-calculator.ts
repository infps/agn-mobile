// Mirror of pigeon_pulse/src/lib/fee-calculator.ts — keep the two identical.
/**
 * Shared fee calculator — pure function, zero DB deps.
 * Used by both server (API routes) and client (UI components).
 */

export interface FeeCalcFeeScheme {
  entryFee: number | null;
  raceFeeMode: "PER_BIRD_PER_RACE" | "FLAT_PER_RACE";
  hotSpot1Fee: number | null;
  hotSpot2Fee: number | null;
  hotSpot3Fee: number | null;
  hotSpotFinalFee: number | null;
  birdFeeItems: { birdNo: number | null; birdFee: number | null }[];
  raceTypeFees: { raceTypeId: number; fee: number }[];
}

export interface FeeCalcRace {
  raceTypeId: number | null;
}

export interface FeeCalculationInput {
  numBirds: number;
  feeScheme: FeeCalcFeeScheme;
  races: FeeCalcRace[];
}

export interface PerBirdFees {
  position: number;
  perchFee: number;
  /** What the hotspot obligation costs if settled at each gate. */
  hotspot1Fee: number;
  hotspot2Fee: number;
  hotspot3Fee: number;
  hotspotFinalFee: number;
  /** Sum of the four gates. Kept for anything still reading the old shape. */
  hotspotFee: number;
}

export interface FeeBreakdown {
  /** The scheme's entry fee, charged on every bird (HayLoft ENTRY_FEE_BATCH_SET). */
  entryFeePerBird: number;
  /** entryFeePerBird × birds. */
  entryFees: number;
  /** @deprecated Same as entryFees: the entry fee is per bird, as in HayLoft, not once. */
  purgeFee: number;
  perchFees: number;
  raceFees: number;
  hotspot1Fees: number;
  hotspot2Fees: number;
  hotspot3Fees: number;
  hotspotFinalFees: number;
  /** Sum of the four gates — what a cumulative scheme eventually collects. */
  hotspotFees: number;
  /**
   * The cheapest gate still on offer — what a SINGLE-rule scheme would charge.
   * Reported either way so the two readings can be compared without a rebuild.
   */
  hotspotDue: number;
  /** What the breeder is billed for hotspots right now, under the active rule. */
  hotspotBilled: number;
  total: number;
  perBirdBreakdown: PerBirdFees[];
}

/**
 * How the four hotspot gates relate to each other.
 *
 * The spec says both things in different places, so it is a setting rather than
 * an assumption:
 *
 *   "CUMULATIVE"  — Task B4. Each gate is its own charge. Paying HS1 leaves
 *                   HS2, HS3 and Final still owed; paying Final settles the lot.
 *                   The breeder eventually pays the sum of the gates.
 *
 *   "SINGLE"      — the Task D table. One obligation with four chances to
 *                   settle it, priced to escalate. Paying at any gate finishes
 *                   it, and the breeder pays that gate's price only.
 *
 * Set to SINGLE, confirmed by the organiser on 2026-09-21: "Pays either of the
 * 4 gates, if 1 is missed the following will be set the next gate, and final
 * race is the final gate, if none of the previous one is paid then they must
 * pay for the final race." One obligation, four chances to meet it, the price
 * escalating for leaving it. This settles the contradiction in the spec — the
 * Task B4 "Cascade rule" wording read the other way. See
 * docs/payment-spec-questions.md Q1.
 */
export const HOTSPOT_CASCADE: "CUMULATIVE" | "SINGLE" = "SINGLE";

/** The four hotspot gates, in the order they fall. */
export const HOTSPOT_GATES = ["HS1", "HS2", "HS3", "FINAL"] as const;
export type HotspotGate = (typeof HOTSPOT_GATES)[number];

/** Bit position of each gate in `EventInventory.hotspotsPaidMask`. */
export const GATE_BIT: Record<HotspotGate, number> = {
  HS1: 0,
  HS2: 1,
  HS3: 2,
  FINAL: 3,
};

/** Has the hotspot obligation been settled, under the active cascade rule? */
export function hotspotSettled(mask: number): boolean {
  if (HOTSPOT_CASCADE === "SINGLE") return mask !== 0;
  // Cumulative: settled only once every priced gate has been met. Paying Final
  // is the exception the spec calls out — it clears whatever came before.
  return (mask & (1 << GATE_BIT.FINAL)) !== 0 || mask === ALL_GATES_MASK;
}

/** Every gate marked. Paying Final sets this, because it clears the earlier ones. */
export const ALL_GATES_MASK = 0b1111;

/**
 * What paying at `gate` marks as settled.
 *
 * Cumulative: only that gate, unless it is Final — which the spec says settles
 * everything earlier too. Single: all of them, since one payment ends it.
 */
export function maskAfterPaying(gate: HotspotGate): number {
  if (HOTSPOT_CASCADE === "SINGLE" || gate === "FINAL") return ALL_GATES_MASK;
  return 1 << GATE_BIT[gate];
}

/**
 * Which gate a bird is actually billed at, given the gates its scheme prices
 * and how far the season has run.
 *
 * `openGate` is the earliest gate still payable — see `openHotspotGate` in
 * `hotspot-gates.ts`, which derives it from basketing. Anything before it was
 * missed, and the price has moved on.
 *
 * A gate with no price is not a gate, so the charge lands on the first priced
 * gate at or after the open one. If every priced gate is already behind — a
 * scheme that stops at HS3 in a season that has reached the final — the last
 * priced gate stands. The obligation does not evaporate because the organiser
 * left Final blank; it just stops climbing.
 *
 * Returns null when the scheme prices no gate at all.
 */
export function chargeableGate(
  gates: Record<HotspotGate, number>,
  openGate: HotspotGate
): HotspotGate | null {
  const from = HOTSPOT_GATES.indexOf(openGate);
  const atOrAfter = HOTSPOT_GATES.slice(from).find((g) => gates[g] > 0);
  if (atOrAfter) return atOrAfter;

  const priced = HOTSPOT_GATES.filter((g) => gates[g] > 0);
  return priced.length > 0 ? priced[priced.length - 1] : null;
}

/** What one bird owes at a given gate, from its stored per-gate values. */
export function gateAmount(
  item: {
    hotSpot1FeeValue?: number | null;
    hotSpot2FeeValue?: number | null;
    hotSpot3FeeValue?: number | null;
    hotSpotFinalFeeValue?: number | null;
  },
  gate: HotspotGate
): number {
  switch (gate) {
    case "HS1": return item.hotSpot1FeeValue ?? 0;
    case "HS2": return item.hotSpot2FeeValue ?? 0;
    case "HS3": return item.hotSpot3FeeValue ?? 0;
    case "FINAL": return item.hotSpotFinalFeeValue ?? 0;
  }
}

export function calculateFees(input: FeeCalculationInput): FeeBreakdown {
  const { numBirds, feeScheme, races } = input;

  // Entry fee: the scheme's ENTRY_FEE on every bird, as HayLoft charges it
  // (ENTRY_FEE_BATCH_SET). It was once a flat fee per registration; the
  // client chose HayLoft's rule on 2026-11-15.
  const entryFeePerBird = feeScheme.entryFee ?? 0;
  const entryFees = entryFeePerBird * numBirds;

  const hs1 = feeScheme.hotSpot1Fee ?? 0;
  const hs2 = feeScheme.hotSpot2Fee ?? 0;
  const hs3 = feeScheme.hotSpot3Fee ?? 0;
  const hsF = feeScheme.hotSpotFinalFee ?? 0;
  const hotspotPerBird = hs1 + hs2 + hs3 + hsF;

  // The cheapest gate that is actually priced. A scheme with only HS1 set
  // charges HS1; one that escalates charges the first, and missing it costs
  // more later.
  const duePerBird = [hs1, hs2, hs3, hsF].find((v) => v > 0) ?? 0;

  // Perch Fee = sum of graduated per-bird fees by position
  let perchFees = 0;
  const perBirdBreakdown: PerBirdFees[] = [];

  for (let i = 1; i <= numBirds; i++) {
    const item = feeScheme.birdFeeItems.find((b) => b.birdNo === i);
    const perchFee = item?.birdFee ?? 0;
    perchFees += perchFee;
    perBirdBreakdown.push({
      position: i,
      perchFee,
      hotspot1Fee: hs1,
      hotspot2Fee: hs2,
      hotspot3Fee: hs3,
      hotspotFinalFee: hsF,
      hotspotFee: hotspotPerBird,
    });
  }

  // Race Fees
  let raceFees = 0;
  for (const race of races) {
    if (!race.raceTypeId) continue;
    const rtFee = feeScheme.raceTypeFees.find(
      (rt) => rt.raceTypeId === race.raceTypeId
    );
    if (!rtFee) continue;
    if (feeScheme.raceFeeMode === "PER_BIRD_PER_RACE") {
      raceFees += rtFee.fee * numBirds;
    } else {
      raceFees += rtFee.fee;
    }
  }

  const hotspotFees = hotspotPerBird * numBirds;
  const hotspotDue = duePerBird * numBirds;
  // Cumulative bills every gate; single bills only the one being settled.
  const hotspotBilled = HOTSPOT_CASCADE === "SINGLE" ? hotspotDue : hotspotFees;

  return {
    entryFeePerBird,
    entryFees,
    purgeFee: entryFees,
    perchFees,
    raceFees,
    hotspot1Fees: hs1 * numBirds,
    hotspot2Fees: hs2 * numBirds,
    hotspot3Fees: hs3 * numBirds,
    hotspotFinalFees: hsF * numBirds,
    hotspotFees,
    hotspotDue,
    hotspotBilled,
    // The spec's total, unchanged. Race fees stay in it as a preview: Task C
    // moves where they are *written*, not whether a breeder is shown them.
    total: entryFees + perchFees + raceFees + hotspotBilled,
    perBirdBreakdown,
  };
}
