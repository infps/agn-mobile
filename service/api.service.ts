import axios from 'axios';
import Constants from "expo-constants";
import SecureStorageService from './secureStorage.service';

// Production API URL - update this with your actual Vercel backend URL after deployment
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://pigeon-pulse.vercel.app/api';

const inProduction = process.env.EXPO_PUBLIC_NODE_ENV === "production";
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
const api = axios.create({
  baseURL: apiUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token + expo-origin for CSRF
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStorageService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
    if (error.response?.status === 401) {
      await SecureStorageService.clearTokens();
    }
    return Promise.reject(error);
  }
);

export default api;