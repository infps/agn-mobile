# AGN Mobile - Architecture

## Stack

| Layer | Tech |
|-------|------|
| Framework | React Native 0.81.5 + Expo SDK 53 |
| Routing | Expo Router 6 (file-based) |
| Styling | NativeWind 4 (Tailwind for RN) |
| State | React Context (5 providers) |
| HTTP | Axios |
| Storage | expo-secure-store (tokens) + AsyncStorage (prefs) |
| Forms | react-hook-form + yup |

## Directory Structure

```
agn-mobile/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout + provider stack
│   ├── index.tsx           # Auth gate (session check → redirect)
│   ├── (auth)/             # Unauthenticated screens
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (app)/              # Protected screens (28 routes)
│       ├── home.tsx
│       ├── events.tsx
│       ├── event-detail.tsx
│       ├── register-in-event.tsx
│       ├── live-race.tsx
│       ├── birds.tsx
│       ├── my-events.tsx
│       ├── payments.tsx
│       ├── profile.tsx
│       ├── teams.tsx
│       └── ...
├── context/                # Global state providers
│   ├── index.tsx           # Provider composition
│   ├── AuthContext.tsx
│   ├── BirdContext.tsx
│   ├── EventContext.tsx
│   ├── PaymentContext.tsx
│   └── ToastContext.tsx
├── service/
│   ├── api.service.ts      # Axios instance + interceptors
│   └── secureStorage.service.ts
├── components/             # Reusable UI
│   ├── header.tsx
│   ├── carousel.tsx
│   ├── Toast.tsx
│   ├── PayPalButton.tsx
│   └── ...
├── utils/
│   └── fee-calculator.ts   # Pure fee computation
├── hooks/
│   ├── use-color-scheme.ts
│   └── use-theme-color.ts
└── constants/
    └── theme.ts            # Colors, fonts
```

## Provider Stack

Providers wrap the app in this order (`context/index.tsx`):

```
BottomSheetModalProvider
  └─ ToastProvider
     └─ AuthProvider
        └─ BirdProvider
           └─ EventProvider
              └─ PaymentProvider
                 └─ {children}
```

### Context Responsibilities

| Context | State | Key Methods |
|---------|-------|-------------|
| **Auth** | user, token, isAuthenticated | signUp, signIn, signOut, checkSession, updateProfile |
| **Bird** | birds[] | fetchBirds, addBird, updateBird, getBirdsByEvent |
| **Event** | events[], currentEvent, participants[] | listEvents, getEvent, getEventParticipants, createEventInventory |
| **Payment** | payments[] | getMyPayments, getPaymentDetails (PayPal = TODO) |
| **Toast** | visible, message, type | success, error, info |

## API Layer

**Base URL resolution** (`service/api.service.ts`):
- Production: `EXPO_PUBLIC_API_URL` env var
- Expo dev: auto-detects local IP from `Constants.expoConfig.hostUri` → `http://{ip}:3000/api`
- Browser dev: `http://localhost:3000/api`

**Interceptors:**
- Request: auto-attaches Bearer token from SecureStore
- Response: handles token refresh via `set-auth-token` header, clears on 401

**Endpoints consumed** (all prefixed `/api`):

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /auth/sign-up/email`, `POST /auth/sign-in/email`, `POST /auth/sign-out` |
| Breeder | `GET/POST /breeder/birds`, `PATCH /breeder/birds/:id` |
| Events | `GET /breeder/events`, `GET /breeder/events/:id` |
| Registration | `POST /breeder/event/:id/register`, `GET /breeder/my-events` |
| Participants | `GET /breeder/event/:id/inventory-items` |
| Live Race | `GET /breeder/races`, `GET /breeder/races/:id/items` |
| Teams | `GET /breeder/teams` |
| Payments | `GET /breeder/payments` |
| Profile | `PUT /user/profile` (FormData) |

## Storage Strategy

| Store | Engine | Data |
|-------|--------|------|
| Secure | expo-secure-store (encrypted) | ACCESS_TOKEN, REFRESH_TOKEN, USER_ID |
| Async | AsyncStorage | USER_DATA, PREFERENCES, LAST_LOCATION |

Fallback: AsyncStorage used if SecureStore unavailable (web).

## Styling

- **NativeWind 4** — Tailwind utility classes via `className` prop
- Primary color: `#189AB4` (cyan)
- Theme: light/dark via `use-color-scheme` hook
- Colors/fonts defined in `constants/theme.ts`

## Key Dependencies

```
expo-router          6.0.15    File-based routing
nativewind           4.2.1     Tailwind for RN
axios                1.13.2    HTTP client
react-hook-form      7.69.0    Forms
yup                  1.7.1     Validation
expo-secure-store    15.0.8    Encrypted storage
@gorhom/bottom-sheet 4         Bottom sheets
react-native-reanimated 4.1.1  Animations
date-fns             4.1.0     Date formatting
```

## Known Limitations

1. **PayPal not integrated** — `PayPalButton` registers with empty payments array
2. **No real-time** — live race uses 15s polling, not websockets
3. **Payments screen** — mostly scaffolding, needs implementation
4. **No offline support** — all data fetched on demand
