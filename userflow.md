# AGN Mobile - User Flows

## 1. Authentication

### Signup
```
Onboarding → Signup Screen
  ├─ Enter: firstName, lastName, email, username, password
  ├─ Client validation: all required, username alphanumeric+underscore
  ├─ POST /auth/sign-up/email { email, password, name, username }
  ├─ Server: creates User → auto-creates Breeder record (databaseHook)
  ├─ Response: token + user object
  ├─ Store token (SecureStore) + user (AsyncStorage)
  ├─ POST /user/profile { name, lastName } (sets lastName separately)
  └─ Redirect → /home
```

### Login
```
Login Screen
  ├─ Enter: username, password
  ├─ POST /auth/sign-in/email { username, password }
  ├─ Store token + user
  └─ Redirect → /home
```

### Session Restore (App Launch)
```
index.tsx (auth gate)
  ├─ Read token from SecureStore
  ├─ GET /auth/get-session (validate token)
  │   ├─ Valid → load user → Redirect /home
  │   └─ Invalid → clear storage → Redirect /login
  └─ No token → Redirect /login
```

### Logout
```
Settings → Logout
  ├─ POST /auth/sign-out
  ├─ Clear SecureStore + AsyncStorage
  └─ Redirect → /login
```

---

## 2. Home Dashboard

```
/home
  ├─ Event carousel (ongoing/upcoming events)
  │   └─ Tap event → /event-detail?id={eventId}
  ├─ Quick stats (total events, birds, registrations)
  └─ Win pedigree section
```

---

## 3. Browse & View Events

```
/events
  ├─ Search bar (filter by name)
  ├─ Pull-to-refresh
  ├─ Event cards list (name, date, type, participant count)
  └─ Tap event → /event-detail?id={eventId}

/event-detail
  ├─ Header: event name
  ├─ Fee info row: perch fee | bird fee | race date | participants
  ├─ Live race banner (if active race exists)
  │   └─ Tap → /live-race?raceId={id}
  ├─ Registered participants table
  │   └─ Columns: #, breeder name, loft name, total birds
  └─ Register button → /register-in-event?eventId={id}
```

---

## 4. Event Registration (Core Flow)

```
/register-in-event?eventId={id}
  │
  ├─ Guard: check if already registered
  │   └─ Yes → Show "Already Registered" message
  │
  ├─ Guard: check if live race active
  │   └─ Yes → Show "Race is Live" + "Watch Live" button
  │
  ├─ Step 1: Owner Information (read-only)
  │   ├─ First Name (from user.name)
  │   ├─ Last Name (from user.lastName)
  │   └─ Email (from user.email)
  │
  ├─ Step 2: Team/Loft Selection
  │   ├─ Dropdown: "Main Loft (Default)" + user's teams
  │   └─ Teams fetched from GET /breeder/teams
  │
  ├─ Step 3: Bird Selection
  │   ├─ Note: "Max {N} birds for this event"
  │   ├─ Bird cards grid (from BirdContext)
  │   │   ├─ Shows: name, color, sex
  │   │   ├─ Tap to select (up to maxBirdCount)
  │   │   └─ Disabled + "Limit reached" when at max
  │   └─ Selected birds list with Remove/Clear All
  │
  ├─ Step 4: Payment Information (shows when birds selected)
  │   ├─ Fee breakdown:
  │   │   ├─ Purge Fee (flat entry fee)
  │   │   ├─ Per Bird Fees (graduated by position)
  │   │   ├─ Race Fees (per bird per race or flat)
  │   │   └─ Hotspot Fees (per bird × 4 hotspot tiers)
  │   ├─ Per-bird cost list
  │   ├─ Total amount
  │   └─ Actions:
  │       ├─ PayPal Button → POST /event-inventory (TODO: actual payment)
  │       └─ "Register & Pay Later" → POST /breeder/event/{id}/register
  │           └─ Success → Alert → router.back()
  │
  └─ Registration payload:
      { loftName, reservedBirds, birds: [{name,color,sex,band1-4}], payments: [] }
```

---

## 5. My Events

```
/my-events
  ├─ GET /breeder/my-events
  └─ Table: event name | date | reserved birds | loft
```

---

## 6. Bird Management

```
/birds
  ├─ Bird list (name, color, sex, band)
  ├─ "Add Bird" button → modal
  │   ├─ 2x3 grid: federation, year, letters, band number, color, sex
  │   ├─ Band fields: federation (dropdown), year, letters (uppercase), number
  │   ├─ Color dropdown, Sex dropdown
  │   └─ POST /breeder/birds
  └─ Tap bird → /bird-detail?id={id}

/bird-detail
  └─ View/edit bird properties
```

---

## 7. Live Race

```
/live-race?raceId={id}
  ├─ GET /breeder/races/{id}/items (initial load)
  ├─ Auto-refresh every 15 seconds
  ├─ Sorted results table:
  │   ├─ Position, bird name, band, arrival time
  │   └─ Status indicators
  └─ Real-time(ish) race tracking
```

---

## 8. Profile Management

```
/profile
  ├─ Display: name, email, phone, address, location
  └─ "Edit" → /profile-update

/profile-update
  ├─ Edit all profile fields
  ├─ Image upload (expo-image-picker)
  ├─ PUT /user/profile (FormData, multipart)
  └─ Save → back to /profile
```

---

## 9. Payments (WIP)

```
/payments
  ├─ GET /breeder/payments
  ├─ Payment list: date, amount, status, event
  └─ Tap → /payment-detail?id={id}

Note: PayPal integration not implemented.
Registrations go through with payments: [] (empty).
```

---

## 10. Teams

```
/teams
  ├─ List user's teams/federations
  └─ Team management (CRUD)
```

---

## 11. Settings & Info

```
/settings
  ├─ Theme toggle (light/dark)
  ├─ Help
  ├─ About → /about-us
  ├─ Contact → /contact-us
  ├─ Privacy Policy → /privacy-policy
  ├─ Terms → /terms-condition
  └─ Logout

Info pages are static content screens.
```

---

## Navigation Map

```
Root (_layout.tsx + providers)
│
├── index.tsx ─── Auth Gate
│
├── (auth)/
│   ├── login
│   └── signup
│
└── (app)/ ─── Stack Navigator
    ├── home ────────────┐
    ├── events ──────────┤
    ├── event-detail ────┤── Core Loop
    ├── register-in-event┤
    ├── my-events ───────┘
    ├── live-race
    ├── birds
    ├── bird-detail
    ├── payments
    ├── profile
    ├── profile-update
    ├── teams
    ├── settings
    └── [info pages]
```
