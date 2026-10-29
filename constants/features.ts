/**
 * Store builds set EXPO_PUBLIC_HIDE_BETTING=1: real-money betting and the
 * Calcutta auction need gambling licences under App Store 5.3 / Play policy,
 * so those builds hide every way in. Internal APKs keep them.
 */
export const BETTING_ENABLED = process.env.EXPO_PUBLIC_HIDE_BETTING !== "1";
