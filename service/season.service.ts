import { useSyncExternalStore } from "react";

/**
 * Which season of an event the admin is looking at.
 *
 * The portal has a season selector above its event tabs, and every tab then
 * asks the server for that season with `?seasonId=`. A phone has no strip of
 * tabs to hang a selector over — each section is its own screen — so the choice
 * is held here and added to the event's requests as they leave (see the request
 * interceptor in api.service). That way a section does not need to know a
 * season was chosen, and one that is added later follows it without being told.
 *
 * Nothing is stored for the active season: no choice means the server's own
 * default, which is what every section did before this existed. The choice is
 * kept in memory only, so reopening the app always starts on the active season
 * rather than on something picked last week and forgotten about.
 */
export interface SeasonChoice {
  id: number;
  name: string | null;
}

const chosen = new Map<string, SeasonChoice>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function chooseSeason(eventId: string | number, season: SeasonChoice | null) {
  const key = String(eventId);
  if (season) chosen.set(key, season);
  else chosen.delete(key);
  emit();
}

export function chosenSeason(eventId: string | number | null | undefined): SeasonChoice | null {
  if (eventId == null) return null;
  return chosen.get(String(eventId)) ?? null;
}

export function useChosenSeason(eventId: string | number | null | undefined): SeasonChoice | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => chosenSeason(eventId)
  );
}

/**
 * Adds the chosen season to a request for one of an event's sections.
 *
 * Left alone: requests that already name a season, and the seasons routes
 * themselves, which are about all of them rather than one.
 */
export function withChosenSeason(url: string | undefined, params?: Record<string, unknown>): string | undefined {
  if (!url) return url;
  const match = url.match(/^\/admin\/event\/(\d+)\/(?!seasons(?:[/?]|$))/);
  if (!match) return url;
  const season = chosen.get(match[1]);
  if (!season) return url;
  if (/[?&]seasonId=/.test(url) || (params && "seasonId" in params)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}seasonId=${season.id}`;
}

/**
 * The race list for an event, in the season chosen for it.
 *
 * The portal's Races, Classes, Knockout and Averages tabs ask GET /admin/race
 * for `?seasonId=` of the season selected above the tabs (the route prefers it
 * over the event's active season); its Baskets, Betting and Result tabs ask by
 * `?eventId=`, which is always the active season. Screens mirroring the first
 * group build their URL here; the rest keep asking by event.
 */
export function seasonRacesUrl(eventId: string | number, season: SeasonChoice | null): string {
  return season ? `/admin/race?seasonId=${season.id}` : `/admin/race?eventId=${eventId}`;
}
