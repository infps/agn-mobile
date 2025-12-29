// context/AuthContext.tsx
 
import SecureStorageService from '@/service/secureStorage.service';
import { router } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import api from "../service/api.service";

export interface User {
  idBreeder: number;
  firstName: string;
  lastName: string;
  loginName: string;
  status: number;
  address1?: string | null;
  address2?: string | null;
  city1?: string | null;
  city2?: string | null;
  state1?: string | null;
  state2?: string | null;
  zip1?: string | null;
  zip2?: string | null;
  country?: string | null;
  phone?: string | null;
  cell?: string | null;
  fax?: string | null;
  email?: string | null;
  email2?: string | null;
  webAddress?: string | null;
  note?: string | null;
  number?: number | null;
  sms?: string | null;
  taxNumber?: string | null;
  socialSecurityNumber?: string | null;
  defNameAgn?: string | null;
  defNameAs?: string | null;
  idPicture?: string | null;
  isDefaultAddress1?: boolean | null;
  statusDate?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  signUp: (userData: {
    loginName: string;
    loginPassword: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  signIn: (loginName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (userData: User) => Promise<void>;
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
      const [storedToken, storedUser] = await Promise.all([
        SecureStorageService.getAccessToken(),
        SecureStorageService.getUserData(),
      ]);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(storedUser);
        // Set the default Authorization header
        (api as any).defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      //await SecureStorageService.clearAll();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Sign up function
  const signUp = useCallback(async (userData: {
    loginName: string;
    loginPassword: string;
    firstName: string;
    lastName: string;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/auth/breeder/signup', {
        email: userData.loginName,
        password: userData.loginPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
      });
      const { token, user } = response.data;

      // // Store tokens and user data
      // await Promise.all([
      //   SecureStorageService.setAccessToken(token),
      //   SecureStorageService.setUserData(user),
      // ]);

      // Update state
      setToken(token);
      setUser(user);

      // Set default auth header
      (api as any).defaults.headers.common['Authorization'] = `Bearer ${token}`;
    await SecureStorageService.setTokens(token, 'ACCESS_TOKEN');
    await SecureStorageService.setUserData(user);
      // Navigate to home or verify email screen
      router.replace('/(tabs)' as any);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      Alert.alert('Registration Error', errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign in function
const signIn = useCallback(async (email: string, password: string) => {
  setIsLoading(true);
  setError(null);

  try {
    // 1. Login to get the token
    const loginResponse = await api.post('/auth/breeder/login', {
      email,
      password,
    });
    
    const { token } = loginResponse.data.data;
    
    // Set the auth header for subsequent requests
    (api as any).defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    // 2. Fetch user profile
    const profileResponse = await api.get('/users/breeder/profile');
    const userData = profileResponse.data.data; // Adjust this based on your API response structure
    // 3. Store token and user data
    await SecureStorageService.setTokens(token, 'ACCESS_TOKEN');
    await SecureStorageService.setUserData(userData);

    // 4. Update state
    setToken(token);
    setUser(userData);

    // 5. Navigate to home
    router.replace('/home' as any);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Login failed. Please try again.';
    setError(errorMessage);
    throw error;
  } finally {
    setIsLoading(false);
  }
}, []);

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      // Clear tokens and user data
      await SecureStorageService.clearAll();
      
      // Clear API auth header
      delete (api as any).defaults.headers.common['Authorization'];
      
      // Reset state
      setUser(null);
      setToken(null);
      
      // Navigate to login
      router.push('/login');
    } catch (error) {
      console.error('Error during sign out:', error);
      throw error;
    }
  }, []);
  const updateProfile = useCallback(async (userData:User)=>{
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/auth/breeder/signup', {
        email: userData.loginName,
        firstName: userData.firstName,
        lastName: userData.lastName,
      });
      const { token, user } = response.data;

      // // Store tokens and user data
      // await Promise.all([
      //   SecureStorageService.setAccessToken(token),
      //   SecureStorageService.setUserData(user),
      // ]);

      // Update state
      setToken(token);
      setUser(user);

      // Set default auth header
      (api as any).defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Navigate to home or verify email screen
      router.replace('/(tabs)' as any);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      Alert.alert('Registration Error', errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  },[])
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
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};