/**
 * The transport's GPS broadcast, reachable from the staff side.
 *
 * The screen itself already exists for the breeder-side app, but that group's
 * layout sends anybody with admin access straight back to the dashboard — which
 * is everyone who is allowed to start a transport. So the same screen is
 * mounted here under its own route name rather than written twice: one
 * background task, one queue, one place to fix.
 *
 * Takes `raceId`, like the race screen that links to it.
 */
export { default } from "../(app)/liberation";
