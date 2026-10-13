import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * How figures and words are shown on this device.
 *
 * The portal keeps these two preferences in the browser rather than on the
 * account, so they are per-device there and per-device here: the same key, the
 * same two values each, the same defaults.
 *
 * A screen that shows a speed or a bird's sex reads them with
 * `useDisplaySettings()` and formats with the helpers below.
 */
export type VelocityUnit = "YPM" | "MPM";
export type SexTerminology = "traditional" | "neutral";

export interface DisplaySettings {
  velocityUnit: VelocityUnit;
  sexTerminology: SexTerminology;
}

const STORAGE_KEY = "pigeon-pulse-settings";
const DEFAULTS: DisplaySettings = { velocityUnit: "YPM", sexTerminology: "traditional" };

/** Every mounted reader, so a change on the settings screen reaches them all. */
const listeners = new Set<(next: DisplaySettings) => void>();
let current: DisplaySettings = DEFAULTS;
let loaded: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        current = {
          velocityUnit: parsed.velocityUnit === "MPM" ? "MPM" : "YPM",
          sexTerminology: parsed.sexTerminology === "neutral" ? "neutral" : "traditional",
        };
      })
      // An unreadable preference is not worth failing a screen over.
      .catch(() => undefined);
  }
  return loaded;
}

export function useDisplaySettings() {
  const [settings, setSettings] = useState<DisplaySettings>(current);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    listeners.add(setSettings);
    load().then(() => {
      if (!alive) return;
      setSettings(current);
      setReady(true);
    });
    return () => {
      alive = false;
      listeners.delete(setSettings);
    };
  }, []);

  const update = useCallback((patch: Partial<DisplaySettings>) => {
    current = { ...current, ...patch };
    listeners.forEach((tell) => tell(current));
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => undefined);
  }, []);

  return { ...settings, ready, update };
}

/** Sex 1 and sex 2, in the words this device was set to. */
export const sexLabel = (sex: number | null | undefined, terminology: SexTerminology) =>
  sex === 1
    ? terminology === "neutral" ? "Male" : "Cock"
    : sex === 2
      ? terminology === "neutral" ? "Female" : "Hen"
      : "—";

/** A speed held in yards per minute, shown in the unit this device was set to. */
export const velocity = (ypm: number | null | undefined, unit: VelocityUnit) =>
  ypm == null ? "—" : `${(unit === "MPM" ? ypm * 0.9144 : ypm).toFixed(2)} ${unit}`;
