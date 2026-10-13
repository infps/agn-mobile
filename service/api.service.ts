import axios from 'axios';
import Constants from "expo-constants";
import SecureStorageService from './secureStorage.service';
import { withChosenSeason } from './season.service';

// Where the deployed portal lives. Overridable per build profile so a staging
// APK can be pointed somewhere else without touching code.
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://pigeon-pulse.vercel.app/api';

/**
 * Whether this build should talk to the deployed portal.
 *
 * `__DEV__` is the authority, not the env var. A release build has no Metro to
 * discover a laptop from, so a shipped app that fell back to hunting for one on
 * the local network would simply never reach a server — and that is exactly
 * what happened whenever EXPO_PUBLIC_NODE_ENV was left at "development", which
 * is its committed value. The env var is kept as an override in the other
 * direction: it lets a development build be pointed at production deliberately.
 */
const inProduction = !__DEV__ || process.env.EXPO_PUBLIC_NODE_ENV === "production";
const inBrowser = typeof document !== "undefined";

/**
 * Where the machine running Metro can be reached.
 *
 * In development the app has to find the portal on somebody's laptop, and the
 * only clue it has is the address it was served from. Expo has moved that clue
 * around between SDKs — expoConfig.hostUri, expoGoConfig.debuggerHost,
 * experienceUrl — and any of them can be missing depending on how the app was
 * launched. So all of them are tried.
 *
 * Getting this wrong used to fall through to localhost, which on a phone means
 * the phone itself: every request fails, and it looks like the login is broken
 * rather than the address.
 */
function devHost(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    (Constants as any).expoGoConfig?.debuggerHost,
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost,
    Constants.experienceUrl,
    (Constants as any).linkingUri,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const candidate of candidates) {
    // Values arrive as bare host:port, exp://host:port, or http://host:port.
    const host = candidate
      .replace(/^[a-z+]+:\/\//i, "")
      .split("/")[0]
      .split("?")[0]
      .split(":")[0];
    if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  }
  return null;
}

const getApiUrl = () => {
  if (inProduction) return PRODUCTION_API_URL;

  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  const host = devHost();
  if (host) return `http://${host}:3000/api`;

  if (inBrowser) return `http://${document.location.hostname}:3000/api`;

  return "http://localhost:3000/api";
};

const apiUrl = getApiUrl();

// Said once, at startup. When requests fail in development the first question
// is always "what address is it even calling", and this answers it in the
// Metro logs without anybody having to add a breakpoint.
if (!inProduction) {
  console.log(`[api] talking to ${apiUrl}`);
}
// 10s was not enough in development. The portal is a Next dev server that
// compiles each API route the first time it is asked for, and behind it sits a
// Postgres that suspends when idle and takes a moment to wake. Neither is slow
// in steady state, but the first request after a quiet spell pays for both at
// once, and the old budget ran out while the server was still working — which
// surfaced as "could not reach the server" when the server was reachable the
// whole time.
const REQUEST_TIMEOUT_MS = inProduction ? 15000 : 30000;

const api = axios.create({
  baseURL: apiUrl,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Request interceptor - Add auth token + expo-origin for CSRF
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStorageService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.url = withChosenSeason(config.url, config.params);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle errors and token refresh
api.interceptors.response.use(
  async (response) => {
    // Check for token refresh from bearer plugin
    const newToken = response.headers['set-auth-token'];
    if (newToken) {
      await SecureStorageService.setTokens(newToken, "ACCESS_TOKEN");
      (api as any).defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401 && !(await sessionStillValid(error.config))) {
      await SecureStorageService.clearTokens();
    }
    return Promise.reject(error);
  }
);

/**
 * Whether a 401 was a refusal rather than an expired session.
 *
 * Several portal routes answer 401 when the caller is signed in but lacks the
 * role — "not a superadmin" comes back the same as "not signed in". Clearing
 * the tokens on those logged an admin out for tapping a button that was not
 * theirs. So before throwing the session away, the server is asked whether it
 * still recognises it. If that question cannot be asked at all, the tokens are
 * kept: a dropped connection is not a reason to sign somebody out.
 */
async function sessionStillValid(failed?: { url?: string; headers?: any }): Promise<boolean> {
  if (failed?.url?.includes("/auth/")) return false;
  const authorization = failed?.headers?.Authorization;
  if (!authorization) return false;
  try {
    const res = await axios.get(`${apiUrl}/auth/get-session`, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: authorization, 'ngrok-skip-browser-warning': 'true' },
    });
    return Boolean(res.data?.user ?? res.data?.session);
  } catch (probe: any) {
    return !probe?.response;
  }
}

export default api;