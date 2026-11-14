// The background location task must be defined when the JS bundle boots, not
// when its screen is first opened: after Android kills the app, the OS relaunches
// the bundle headless (no UI, so no routes load) to deliver location updates,
// and an undefined task gets dropped — the truck silently stops broadcasting.
// Importing the screen module here runs its top-level TaskManager.defineTask.
import "./app/(app)/liberation";
import "expo-router/entry";
