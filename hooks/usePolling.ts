import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Runs fn every `ms` while the screen is focused and the app is in the
 * foreground; `ms = null` turns it off. Coming back from blur/background
 * refreshes at once; `leading` also calls it on every start (incl. the first).
 */
export function usePolling(fn: () => unknown, ms: number | null, leading = false) {
  const focused = useIsFocused();
  const [awake, setAwake] = useState(AppState.currentState === "active");
  const fnRef = useRef(fn);
  const paused = useRef(false);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAwake(s === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (ms == null) return;
    if (!focused || !awake) {
      paused.current = true;
      return;
    }
    if (leading || paused.current) fnRef.current();
    paused.current = false;
    const t = setInterval(() => fnRef.current(), ms);
    return () => clearInterval(t);
  }, [ms, focused, awake, leading]);
}
