/**
 * Shared fee calculator — pure function, zero deps.
 * Mirror of pigeon_pulse/src/lib/fee-calculator.ts for mobile.
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
  hotspotFee: number;
}

export interface FeeBreakdown {
  purgeFee: number;
  perchFees: number;
  raceFees: number;
  hotspotFees: number;
  total: number;
  perBirdBreakdown: PerBirdFees[];
}

export function calculateFees(input: FeeCalculationInput): FeeBreakdown {
  const { numBirds, feeScheme, races } = input;

  // Purge Fee = 1-time flat fee (NOT per bird)
  const purgeFee = feeScheme.entryFee ?? 0;

  // Perch Fee = sum of graduated per-bird fees by position
  let perchFees = 0;
  const perBirdBreakdown: PerBirdFees[] = [];
  const hotspotPerBird =
    (feeScheme.hotSpot1Fee ?? 0) +
    (feeScheme.hotSpot2Fee ?? 0) +
    (feeScheme.hotSpot3Fee ?? 0) +
    (feeScheme.hotSpotFinalFee ?? 0);

  for (let i = 1; i <= numBirds; i++) {
    const item = feeScheme.birdFeeItems.find((b) => b.birdNo === i);
    const perchFee = item?.birdFee ?? 0;
    perchFees += perchFee;
    perBirdBreakdown.push({
      position: i,
      perchFee,
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

  // Hotspot Fees = per bird
  const hotspotFees = hotspotPerBird * numBirds;

  return {
    purgeFee,
    perchFees,
    raceFees,
    hotspotFees,
    total: purgeFee + perchFees + raceFees + hotspotFees,
    perBirdBreakdown,
  };
}
