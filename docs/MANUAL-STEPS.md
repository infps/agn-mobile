# Mobile ERP parity — what still has to be done by hand

**Written:** 13 Oct 2026
**Mobile branch:** `mobile-erp-parity` (repo `infps/agn-mobile`)
**Portal branch:** `feat/big-tasks` (repo `infps/pigeon_pulse`)

The mobile app now has a screen for every section of the portal, gated by the
same server-side permissions. It type-checks, passes `expo-doctor` 21/21 and
bundles for iOS and Android. **None of it has been run on a device or against
live data.** Everything below is what a person has to do before it can ship.

---

## 1. Get a build onto phones

Nothing here can be done from the Windows machine the work was done on: it has
no Android SDK, cannot build iOS, and is not logged in to EAS.

1. **Install and log in to EAS.** `npx eas-cli login` with an account that has
   access to the Expo project owned by `dragoon4002` (project id in `app.json`).
2. **Package manager is bun.** `package-lock.json` was removed because it pinned
   Expo SDK 54 while `package.json` declares SDK 57. `bun.lock` is the only
   lockfile. This reverses the earlier "use npm for eas builds" commit — if EAS
   must use npm, regenerate `package-lock.json` from the current `package.json`
   rather than restoring the old one.
3. **Android build:** `npx eas-cli build --profile preview --platform android`
   produces an APK for internal testing.
4. **iOS build:** needs an Apple Developer account. The `preview` profile builds
   for the **simulator only**; add a profile with `distribution: internal` and
   no `simulator: true` (or use `production` + TestFlight) for real iPhones.
5. **Deploy the portal branch first.** The mobile bulk-payment flow needs
   `approveUrl` from `/api/payment/paypal/create-bulk`, added on
   `feat/big-tasks`. Against an older deployment the Payments screen refuses to
   start a PayPal payment.

## 2. Keys and services to supply

| What | Where | Without it |
|---|---|---|
| Google Maps API key (Android) | `app.json` → `android.config.googleMaps.apiKey` (currently empty) | Map screens will most likely crash or stay blank on Android. iOS is unaffected. |
| Firebase `google-services.json` | project root + `android.googleServicesFile` in `app.json` | No push notifications on Android. |
| APNs key | set up through EAS credentials | No push notifications on iOS. |
| `PAYPAL_*` on the portal deployment | portal environment | Every online payment path fails. |
| `WINDY_POINT_KEY` on the portal deployment | portal environment | "Wind on route" shows the server's error. |
| `EXPO_PUBLIC_API_URL` | `eas.json` build profiles (currently `https://pigeon-pulse.vercel.app/api`) | Change it if the production portal lives elsewhere. |

App identity is still the placeholder: name `agn`, bundle id `com.mobile.agn`.
Decide the store name and ids before the first store submission — the bundle id
cannot be changed afterwards.

## 3. Device test pass

Expect bugs on first run; this is a large amount of untested UI. Test in this
order, since later items depend on earlier ones.

**Access**
- [ ] Sign in as SUPERADMIN, ADMIN, BREEDER and BETTOR. Each sees the right
      shell and only the sections their permissions allow.
- [ ] Revoke a module from an admin in the portal; it disappears on next load.
- [ ] Tap an action the account is not allowed to do. It must show a refusal
      and **must not sign the user out** (this was a bug; the fix is untested).

**Highest-risk areas (untested native behaviour)**
- [ ] Every upload: event logo/banner, breeder picture and documents, bird
      season photos (camera and library), message pictures, vaccination
      documents, CSV imports.
- [ ] Opening one pop-up sheet from another on iOS (edit from detail, confirm
      from a sheet). Several screens use a short delay to avoid a clash.
- [ ] File exports through the share sheet: reports (PDF/XLSX/CSV/HTML), ledger,
      race results, receipts, basket entries CSV.
- [ ] Maps: stations (tap to place), race track, live race map.
- [ ] Background location for transport broadcast ("Always" permission on iOS,
      foreground service on Android).

**Money — test against a test event, never American Showcase / fee scheme 4**
- [ ] PayPal: registration, pay balance, bulk payments, race bet, hot spot.
- [ ] Record / edit / delete a payment; record a refund; cash promise.
- [ ] Class payouts and betting payouts: preview, then settle once.
- [ ] Calcutta: set up, generate lots, start, bid from a breeder phone, close.

**Race day**
- [ ] Create a race, start with basket selection, manual scan, batch scan, end.
- [ ] Recalculate: dry-run preview, then apply.
- [ ] Corrections: phantom scans, exclude and re-include a bird.
- [ ] Season switching: Seasons → "Work in this season", check that sections
      show that season, then "Back to active". The Races list does not follow
      the chosen season.

## 4. Data to clean up

- **Rules saved from the old mobile app may be damaged.** It wrapped rule text
  in HTML, while the public rules page renders Markdown. Open each event's rules
  in the portal and remove any literal `<p>` / `<br>` tags.

## 5. Portal fixes needed (found during this work, not changed)

Only one portal file was changed (`create-bulk/route.ts`). These are open.

**Blocking a mobile feature**
- **Penalties route missing.** `GET/POST /api/admin/event/[eventId]/penalties`
  exists only on the local branch `Roger-9-basketing-structure` (with
  `src/lib/late-penalty.ts`). Merge it; until then the mobile Penalties tab
  shows a notice.
- **Admin cannot upload a bird's profile photo.** The portal calls
  `/api/breeder/birds/[id]/image`, which rejects anyone but the bird's breeder.

**Bugs**
- **Saving an event in the portal's edit form makes it private.** The form sends
  the string `"false"` and `updateEventSchema` uses `z.coerce.boolean()`.
- **Create-event drops contact, social and address fields**
  (`createEventSchema` has no such fields).
- **Edit-entry dialog blanks arrival/departure dates on every save** (sends
  `arrivalTime`/`departureTime`; the route reads `arrivalDate`/`departureDate`).
- **Teams dialog sends the user's string id as `breederId`**, which parses to
  NaN.
- **`scan/batch` parses timestamps in server-local time**, the single-scan route
  in UTC. Mobile sends UTC to both.
- **Re-pricing the live Calcutta lot** sets it to PENDING without clearing
  `activeGroupId`.
- **`calculate-payouts` run twice** appears to create a second pending payout
  for winners. Read from code, not reproduced — verify before relying on it.

**Permission checks that do not hold**
- `status-presets` (both route files) and `bird-status-codes`: the guard returns
  the error response, which is truthy, so the check never blocks.
- `api/admin/bird/[birdId]/route.ts`: `requireAdmin` does not enforce
  `birds.manage`.
- `PUT /api/admin/users` checks `users.manage` after it has already written.
- Many routes answer **401** for "signed in, wrong role". They should answer
  403. The app now works around this, but it is still wrong.
- `/api/scanner/poll` is unauthenticated and matches the reader by caller IP.

**Form fields the server ignores**
- Register-a-breeder: amount paid and method (always one PENDING payment).
- Race form: YouTube / Facebook stream URLs.
- Messages: the "Send To: Public / Active Breeders" checkboxes.
- Basket create: `label`.

## 6. Decisions for the owner

- **Season edit and clone on mobile** are allowed for anyone with
  `events.manage`, as the API allows. The portal UI hides them from everyone but
  SUPERADMIN. Say if mobile should match the portal UI instead.
- **Hot spot payment is PayPal only on mobile.** The route's cash option marks
  the fee paid on the breeder's own say-so, so it was not exposed.
- **Display settings** (velocity unit, sex wording) are saved per device but no
  screen reads them yet.
- **Lint:** `expo lint` reported 30 React Compiler rule errors before this work
  and was not re-run after. They do not stop the build.

## 7. Not on mobile, by design or by limit

- USB serial scanners and browser print (not possible on a phone; a keyboard
  wedge scanner and PDF export stand in).
- Watching a portal operator's scan display (the portal shares it only inside
  one browser).
- Calcutta bid history (Pusher-only; mobile polls for the leading bid).
- Embedded stream player (links open in the browser).
- Country/state dropdowns (free text), date pickers (typed `YYYY-MM-DD`),
  pagination of long results lists (first 300 rows plus search).
- Bird adder demo page, portal `test/*` pages, OBS overlay pages.
