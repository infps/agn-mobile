// Mirror of the web portal's src/lib/payment-types.ts — keep the two identical.
// The mobile app is a replica of the portal; payment type codes are HayLoft's.

/**
 * Payment types: one table for the whole system.
 *
 * These are HayLoft's codes (stored procedure PAYMENT_CALC), because every
 * imported payment carries them and HayLoft's screens are what the books are
 * checked against. Codes 0–8 must never be reassigned. Codes from 9 up are
 * Pigeon Pulse additions for things HayLoft has no code for.
 *
 * Direction: HayLoft stores money going back to a breeder (refunds, payouts) as
 * a negative value, and money coming in as positive, so a registration's net is
 * a plain sum. Portal-written rows follow the same rule — see `signedAmount`,
 * which every reader should use instead of reading paymentValue directly.
 */

export const PAYMENT_TYPE = {
  PERCH_FEE: 0,
  ENTRY_FEE: 1,
  BETS: 2,
  HOT_SPOT: 3,
  ENTRY_REFUND: 4,
  BETS_REFUND: 5,
  HOT_SPOT_REFUND: 6,
  TRANSFER_DUE: 7,
  WINNER_PAYOUT: 8,
  /** Pigeon Pulse: money received that is none of the above. */
  OTHER: 9,
  /**
   * Pigeon Pulse: one payment for a whole registration (fees and bet stakes
   * together), as self-registration and PayPal checkout create it.
   */
  REGISTRATION: 10,
} as const;

export type PaymentTypeCode = (typeof PAYMENT_TYPE)[keyof typeof PAYMENT_TYPE];
export type PaymentTypeKey = keyof typeof PAYMENT_TYPE;

/** Labels as HayLoft names them. */
export const PAYMENT_TYPE_LABEL: Record<PaymentTypeCode, string> = {
  0: "Perch fee",
  1: "Entry fee",
  2: "Bets",
  3: "Hot spot fee",
  4: "Entry refund",
  5: "Bets refund",
  6: "Hot spot refund",
  7: "Transfer due",
  8: "Winner payout",
  9: "Other",
  10: "Registration",
};

/** Types that are money going back out to a breeder or bettor. */
export const OUTGOING_TYPES: ReadonlySet<number> = new Set([
  PAYMENT_TYPE.ENTRY_REFUND,
  PAYMENT_TYPE.BETS_REFUND,
  PAYMENT_TYPE.HOT_SPOT_REFUND,
  PAYMENT_TYPE.WINNER_PAYOUT,
]);

export function isOutgoing(type: number | null | undefined): boolean {
  return type != null && OUTGOING_TYPES.has(type);
}

export function paymentTypeLabel(type: number | null | undefined): string {
  if (type == null) return "Registration";
  return PAYMENT_TYPE_LABEL[type as PaymentTypeCode] ?? `Type ${type}`;
}

/**
 * The payment's value with HayLoft's sign: money out is negative, money in
 * positive, whatever sign the row was written with. Summing this over a
 * registration's PAID payments gives what it has paid in net.
 */
export function signedAmount(p: { paymentValue?: number | null; paymentType?: number | null }): number {
  const v = p.paymentValue ?? 0;
  return isOutgoing(p.paymentType) ? -Math.abs(v) : v;
}

/** The value as a positive amount, for display beside its type. */
export function absoluteAmount(p: { paymentValue?: number | null }): number {
  return Math.abs(p.paymentValue ?? 0);
}

/** Payments toward a registration's fees (money in). Untyped rows are registration payments. */
const FEE_IN_TYPES: ReadonlySet<number> = new Set([
  PAYMENT_TYPE.PERCH_FEE,
  PAYMENT_TYPE.ENTRY_FEE,
  PAYMENT_TYPE.HOT_SPOT,
  PAYMENT_TYPE.TRANSFER_DUE,
  PAYMENT_TYPE.OTHER,
  PAYMENT_TYPE.REGISTRATION,
]);
/** Fee money returned to the breeder. */
const FEE_OUT_TYPES: ReadonlySet<number> = new Set([PAYMENT_TYPE.ENTRY_REFUND, PAYMENT_TYPE.HOT_SPOT_REFUND]);

export function isFeePayment(type: number | null | undefined): boolean {
  return type == null || FEE_IN_TYPES.has(type) || FEE_OUT_TYPES.has(type);
}

export function isBetPayment(type: number | null | undefined): boolean {
  return type === PAYMENT_TYPE.BETS || type === PAYMENT_TYPE.BETS_REFUND;
}

/**
 * What a registration has paid toward its fees, net of fee refunds paid back.
 * Bets, bet refunds and winner payouts are separate money and left out. Only
 * PAID rows count: a PENDING row is an unpaid order.
 */
export function feesPaidNet(
  payments: ReadonlyArray<{ paymentValue?: number | null; paymentType?: number | null; status?: string | null }>
): number {
  let net = 0;
  for (const p of payments) {
    if (p.status !== "PAID" || !isFeePayment(p.paymentType)) continue;
    net += signedAmount(p);
  }
  return Math.round(net * 100) / 100;
}

/**
 * The type keys an admin may pick when recording a payment by hand, with the
 * label shown. Order follows HayLoft's list.
 */
export const MANUAL_PAYMENT_TYPES: ReadonlyArray<{ key: PaymentTypeKey; label: string; outgoing: boolean }> = (
  Object.keys(PAYMENT_TYPE) as PaymentTypeKey[]
)
  .filter((k) => k !== "REGISTRATION")
  .map((k) => ({ key: k, label: PAYMENT_TYPE_LABEL[PAYMENT_TYPE[k]], outgoing: isOutgoing(PAYMENT_TYPE[k]) }));

export function paymentTypeFromKey(key: string | null | undefined): PaymentTypeCode | null {
  if (!key) return null;
  return (PAYMENT_TYPE as Record<string, PaymentTypeCode>)[key] ?? null;
}

export function paymentTypeKey(type: number | null | undefined): PaymentTypeKey | null {
  if (type == null) return null;
  const hit = (Object.keys(PAYMENT_TYPE) as PaymentTypeKey[]).find((k) => PAYMENT_TYPE[k] === type);
  return hit ?? null;
}
