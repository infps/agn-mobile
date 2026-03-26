import axios from 'axios';
import Constants from "expo-constants";
import SecureStorageService from './secureStorage.service';

// Production API URL - update this with your actual Vercel backend URL after deployment
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://pigeon-pulse.vercel.app/api';

const inProduction = process.env.EXPO_PUBLIC_NODE_ENV === "production";
const inExpo = Constants.expoConfig && Constants.expoConfig.hostUri;
const inBrowser = typeof document !== "undefined";
// Get API URL based on environment
const getApiUrl = () => {
  // Production mode
  if (inProduction) {
    return PRODUCTION_API_URL;
  }

  // Development mode - connect to local backend
  if (inExpo && Constants.expoConfig?.hostUri) {
    const localIp = Constants.expoConfig.hostUri.split(':')[0];
    return `http://${localIp}:3000/api`;
  }

  if (inBrowser) {
    return `http://${document.location.hostname}:3000/api`;
  }

  return 'http://localhost:3000/api';
};

const apiUrl = getApiUrl();
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