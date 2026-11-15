# Testing — agn-mobile

How to check a change before it ships. The API side (and the server
benchmarks) is covered in `pigeon_pulse/docs/testing.md`.

## 1. Static checks (no device)

```bash
bun install            # or npm install
npx tsc --noEmit -p .  # baseline: 5 known errors, must not grow
npx expo lint          # or: npx eslint <changed files> — don't add new problems
npx expo export --platform android --output-dir /tmp/agn-export   # bundles = no import/syntax breakage
```

The 5 known TypeScript errors (pre-existing, not caused by recent work):

- `app/(app)/messages.tsx:88` and `components/EventDetailTabs.tsx:266`: `Element | null` passed as a FlatList header/empty component
- `components/admin/scan.tsx:139,149`: TextInput ref typing (RN 0.88 types)
- `node_modules/@react-native-async-storage/async-storage`: missing `merge-options` declaration

Compare counts, not output: `npx tsc --noEmit -p . | grep -c "error TS"`.

## 2. Which API the app talks to

| How you run it | API |
|---|---|
| `npx expo start` with `.env` (`EXPO_PUBLIC_NODE_ENV` unset) | `EXPO_PUBLIC_API_URL` from `.env`, e.g. your local `next dev` on the LAN IP |
| EAS `preview` / `production` builds | `https://pigeonpulse.com/api` (eas.json) |
| EAS `aws` profile | `http://52.35.79.242/api` (plain HTTP — testing only) |

For local API work, run the web app (`pigeon_pulse`, see its testing doc
section 2 for a throwaway database) and point `EXPO_PUBLIC_API_URL` at
`http://<your-LAN-IP>:3000/api`. Check the sign-in route the app uses with
`bun scripts/probe-login.ts` in `pigeon_pulse`.

## 3. Device checks (Expo Go / dev build)

Open React Native DevTools (press `j` in the `expo start` terminal) and keep
the Network tab open. For performance-related changes, check:

- **Startup requests.** Cold open with a saved session. Expected after
  2026-11-16 work: breeder ≈ 6 requests (profile, permissions once, events,
  live races, birds, pending payments), admin ≈ 4. A second `/me/permissions`
  or `/breeder/events` means a context re-fetch regressed.
- **Polling pauses.** On live race, notifications, races map, race detail and
  calcutta screens, requests repeat on their interval only while the screen is
  visible. Push another screen or background the app: requests stop. Come
  back: one immediate refresh, then the interval resumes.
- **Phone cache.** Birds list, admin users and event detail tabs show data
  instantly on second open (from AsyncStorage), then refresh. Sign out → sign
  in as another user: no previous user's data appears.
- **Calcutta.** Countdown ticks smoothly; the rest of the screen should not
  flicker each tick (React DevTools "Highlight updates" shows only the clock).
- **Long lists.** Baskets, bets, admin races, history show a "showing N of M"
  cap; result detail scrolls smoothly with 300+ rows.
- **Images.** Bird/user/message images load once and come from cache on
  re-open (no repeated image requests in Network).

## 4. Before a store build

- `tsc` count unchanged, lint no new problems, `expo export` succeeds.
- Smoke test on one Android and one iOS device against `pigeonpulse.com`:
  sign in, birds, register in event, live race, calcutta, sign out.
- See `docs/MANUAL-STEPS.md` for release steps that are still manual.
