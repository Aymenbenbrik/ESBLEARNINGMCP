'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types/auth';
import { authApi } from '../api/auth';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in on mount
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { user } = await authApi.getCurrentUser();
      console.log('[AuthContext] User authenticated:', user.username);
      setUser(user);
    } catch (error: any) {
      // Log the specific error for debugging
      if (error.response?.status === 401) {
        console.warn('[AuthContext] 401 - No valid session found');
      } else if (error.response?.status === 422) {
        console.warn('[AuthContext] 422 - Invalid token');
      } else if (error.code === 'ERR_NETWORK') {
        console.error('[AuthContext] Network error - Backend may be down');
      } else {
        console.error('[AuthContext] Auth check failed:', error.message || error);
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const { user } = await authApi.login({ username, password });
      setUser(user);
      router.push('/dashboard');
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout failed:', error);
      // If logout fails (422 or any error), clear cookies anyway
      // This handles cases where JWT is invalid/corrupted
      document.cookie = 'access_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'refresh_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } finally {
      // Always clear local state and redirect, regardless of API success
      setUser(null);
      router.push('/login');
    }
  };

  const value = {
    user,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
