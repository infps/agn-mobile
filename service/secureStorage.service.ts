/**
 * Secure Storage Service
 * Uses Expo SecureStore for encrypted storage of sensitive data
 * Falls back to AsyncStorage for non-sensitive data
 */

import { User } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SECURE_KEYS = {
  ACCESS_TOKEN: 'pigeon_plus_access_token',
  REFRESH_TOKEN: 'pigeon_plus_refresh_token',
  USER_ID: 'pigeon_plus_user_id',
};

const STORAGE_KEYS = {
  USER_DATA: 'pigeon_plus_user_data',
  PREFERENCES: 'pigeon_plus_preferences',
  LAST_LOCATION: 'pigeon_plus_last_location',
};

/**
 * Check if SecureStore is available on this device
 */
const isSecureStoreAvailable = async () => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

/**
 * Securely store a value (encrypted)
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
const setSecureItem = async (key: string, value: string) => {
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.setItemAsync(key, value);
    } else {
      // Fallback to AsyncStorage with warning
      console.warn('SecureStore not available, falling back to AsyncStorage');
      await AsyncStorage.setItem(key, value);
    }
  } catch (error) {
    console.error('Error storing secure item:', error);
    throw error;
  }
};

/**
 * Retrieve a securely stored value
 * @param {string} key - Storage key
 * @returns {Promise<string|null>}
 */
const getSecureItem = async (key: string) => {
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  } catch (error) {
    console.error('Error retrieving secure item:', error);
    return null;
  }
};

/**
 * Delete a securely stored value
 * @param {string} key - Storage key
 */
const deleteSecureItem = async (key:string) => {
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error('Error deleting secure item:', error);
  }
};

/**
 * Store regular (non-sensitive) data
 * @param {string} key - Storage key
 * @param {any} value - Value to store (will be JSON stringified)
 */
const setItem = async (key: string, value: any) => {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (error) {
    console.error('Error storing item:', error);
    throw error;
  }
};

/**
 * Retrieve regular stored data
 * @param {string} key - Storage key
 * @returns {Promise<any>}
 */
const getItem = async (key:string) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    console.error('Error retrieving item:', error);
    return null;
  }
};

/**
 * Delete regular stored data
 * @param {string} key - Storage key
 */
const deleteItem = async (key:string) => {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Error deleting item:', error);
  }
};

// Token management functions
const SecureStorageService = {
  // Token management
  setTokens: async (accessToken: string, refreshToken: string) => {
    await setSecureItem(SECURE_KEYS.ACCESS_TOKEN, accessToken);
    if (refreshToken) {
      await setSecureItem(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    }
  },

  getAccessToken: async () => {
    return await getSecureItem(SECURE_KEYS.ACCESS_TOKEN);
  },

  getRefreshToken: async () => {
    return await getSecureItem(SECURE_KEYS.REFRESH_TOKEN);
  },

  clearTokens: async () => {
    await deleteSecureItem(SECURE_KEYS.ACCESS_TOKEN);
    await deleteSecureItem(SECURE_KEYS.REFRESH_TOKEN);
  },

  // User ID (sensitive)
  setUserId: async (userId:string) => {
    await setSecureItem(SECURE_KEYS.USER_ID, userId);
  },

  getUserId: async () => {
    return await getSecureItem(SECURE_KEYS.USER_ID);
  },

  // User data (non-sensitive profile info)
  setUserData: async (userData:User) => {
    await setItem(STORAGE_KEYS.USER_DATA, userData);
  },

  getUserData: async () => {
    return await getItem(STORAGE_KEYS.USER_DATA);
  },

  clearUserData: async () => {
    await deleteItem(STORAGE_KEYS.USER_DATA);
  },

  // Preferences
  setPreferences: async (preferences: any) => {
    await setItem(STORAGE_KEYS.PREFERENCES, preferences);
  },

  getPreferences: async () => {
    return await getItem(STORAGE_KEYS.PREFERENCES);
  },

  // Last known location
  setLastLocation: async (location:any) => {
    await setItem(STORAGE_KEYS.LAST_LOCATION, location);
  },

  getLastLocation: async () => {
    return await getItem(STORAGE_KEYS.LAST_LOCATION);
  },

  // Clear all stored data (logout)
  clearAll: async () => {
    await SecureStorageService.clearTokens();
    await deleteSecureItem(SECURE_KEYS.USER_ID);
    await deleteItem(STORAGE_KEYS.USER_DATA);
    await deleteItem(STORAGE_KEYS.PREFERENCES);
    // Don't clear last location - might be useful for next login
  },

  // Expose keys for direct access if needed
  SECURE_KEYS,
  STORAGE_KEYS,
};

export default SecureStorageService;
