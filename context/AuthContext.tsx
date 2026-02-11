// context/AuthContext.tsx

import SecureStorageService from "@/service/secureStorage.service";
import { router } from "expo-router";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Alert } from "react-native";
import api from "../service/api.service";

export interface User {
  id: string;
  name: string;
  lastName?: string | null;
  email: string;
  username?: string | null;
  displayUsername?: string | null;
  image?: string | null;
  role: string;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
  webAddress?: string | null;
  note?: string | null;
  ssn?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  signUp: (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    username: string;
  }) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  checkSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
updateProfile: (userData: any) => Promise<boolean>;
  initializeAuth: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state
  const initializeAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const storedToken = await SecureStorageService.getAccessToken();
      if (!storedToken) {
        return;
      }
      (api as any).defaults.headers.common["Authorization"] =
        `Bearer ${storedToken}`;
      const profileResponse = await api.get("/user/profile");
      const userData = profileResponse.data.user;
      if (userData) {
        setToken(storedToken);
        setUser(userData);
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        // No valid session — user needs to log in, not an error
        await SecureStorageService.clearTokens();
        delete (api as any).defaults.headers.common["Authorization"];
      } else {
        console.error("Failed to initialize auth:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Sign up function
  const signUp = useCallback(
    async (userData: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      username: string;
    }) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await api.post("/auth/sign-up/email", {
          email: userData.email,
          password: userData.password,
          name: `${userData.firstName} ${userData.lastName}`,
          username: userData.username,
        });
        const { token, user } = response.data;

        // Update state
        setToken(token);
        setUser(user);

        // Set default auth header
        (api as any).defaults.headers.common["Authorization"] =
          `Bearer ${token}`;
        await SecureStorageService.setTokens(token, "ACCESS_TOKEN");
        await SecureStorageService.setUserData(user);

        // Set lastName via profile update
        try {
          const formData = new FormData();
          formData.append("name", `${userData.firstName} ${userData.lastName}`);
          formData.append("lastName", userData.lastName);
          await api.put("/user/profile", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (e) {
          console.warn("Failed to set lastName:", e);
        }

        router.replace("/home" as any);
      } catch (error: any) {
        const errorMessage =
          error.response?.data?.message ||
          "Registration failed. Please try again.";
        setError(errorMessage);
        Alert.alert("Registration Error", errorMessage);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Sign in function
  const signIn = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const loginResponse = await api.post("/auth/sign-in/username", {
        username,
        password,
      });
      const { token } = loginResponse.data;

      (api as any).defaults.headers.common["Authorization"] = `Bearer ${token}`;

      const profileResponse = await api.get("/user/profile");
      const userData = profileResponse.data.user;

      await SecureStorageService.setTokens(token, "ACCESS_TOKEN");
      await SecureStorageService.setUserData(userData);

      setToken(token);
      setUser(userData);

      router.replace("/home" as any);
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Login failed. Please try again.";
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);
  const checkSession = useCallback(async () => {
    try {
      const token = await SecureStorageService.getAccessToken();
      const userData = await SecureStorageService.getUserData();

      if (!token || !userData) {
        return false;
      }

      const res = await api.get("/auth/get-session");
      if (token && res.data.user) {
        setToken(token);
        setUser(res.data.user);
        return true;
      }
      router.navigate("/login");
      return false;
    } catch (error: any) {
      await SecureStorageService.clearAll();
      delete (api as any).defaults.headers.common["Authorization"];
      setUser(null);
      setToken(null);
      router.push("/login");
      return false;
    }
  }, [setToken, setUser]);
  // Sign out function
  const signOut = useCallback(async () => {
    try {
      // Notify server
      try {
        await api.post("/auth/sign-out");
      } catch (e) {
        // Ignore server errors during signout
      }

      await SecureStorageService.clearAll();
      delete (api as any).defaults.headers.common["Authorization"];
      setUser(null);
      setToken(null);
      router.push("/login");
    } catch (error) {
      console.error("Error during sign out:", error);
      throw error;
    }
  }, []);
  const updateProfile = useCallback(async (userData: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      Object.keys(userData).forEach((key) => {
        if (userData[key] !== undefined && userData[key] !== null) {
          formData.append(key, userData[key]);
        }
      });

      const response = await api.put("/user/profile", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const updatedUser = response.data.user;

      await SecureStorageService.setUserData(updatedUser);
      setUser(updatedUser);

      return true;
    } catch (error: any) {
      console.log(error);
      const errorMessage =
        error.response?.data?.message ||
        "Profile update failed. Please try again.";
      setError(errorMessage);
      Alert.alert("Update Error", errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);
  const value = {
    user,
    token,
    isLoading,
    error,
    signUp,
    signIn,
    signOut,
    updateProfile,
    initializeAuth,
    checkSession,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
