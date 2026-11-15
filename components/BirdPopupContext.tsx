// The bird popup's context, kept apart from the popup itself so shared UI
// (components/admin/ui Row) can open a bird without importing the popup,
// which imports that UI. The provider lives in components/BirdPopup.
import React, { createContext, useContext, type ReactNode } from "react";
import { Pressable } from "react-native";

export const BirdPopupCtx = createContext<{ openBird: (birdId: number) => void; openBand: (band: string) => void } | null>(
  null
);

export function useBirdPopup() {
  const ctx = useContext(BirdPopupCtx);
  if (!ctx) throw new Error("useBirdPopup needs <BirdPopupProvider>");
  return ctx;
}

/** Wraps a band (or any label): pressing it opens the bird popup. */
export function BirdPress({ birdId, band, children }: { birdId?: number | null; band?: string | null; children: ReactNode }) {
  const ctx = useContext(BirdPopupCtx);
  if (!ctx || (birdId == null && !band)) return <>{children}</>;
  return (
    <Pressable onPress={() => (birdId != null ? ctx.openBird(birdId) : ctx.openBand(band!))} hitSlop={6}>
      {children}
    </Pressable>
  );
}
