import { create } from "zustand";
import axios from "axios";

import type {
  AuthLoginResponse,
  ChangePasswordRequest,
  DeleteAccountRequest,
  LoginRequest,
  RegisterRequest,
  UpdatePreferencesRequest,
  UpdateProfileRequest,
  User,
} from "../types";
import {
  clearToken,
  getToken,
  setToken,
} from "../storage";
import * as authApi from "../api";
import { clearOrganizationStorage } from "@/features/organizations/storage";
import { getApiErrorMessage } from "@/shared/api/errors";

function getApiErrorCode(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return null;
  }
  const data = error.response?.data;
  if (!data || typeof data !== "object") {
    return null;
  }
  if ("error" in data) {
    const errorData = (data as { error?: unknown }).error;
    if (errorData && typeof errorData === "object" && "code" in errorData) {
      const code = (errorData as { code?: unknown }).code;
      if (typeof code === "string" && code.trim()) return code;
    }
  }
  return null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  requiresEmailVerification: boolean;
  isLoading: boolean;
  error: string | null;

  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  updateProfile: (data: UpdateProfileRequest) => Promise<void>;
  updatePreferences: (data: UpdatePreferencesRequest) => Promise<void>;
  changePassword: (data: ChangePasswordRequest) => Promise<void>;
  deleteAccount: (data: DeleteAccountRequest) => Promise<void>;
  loadProfileSetup: () => Promise<void>;
  completeProfileSetup: (data: UpdateProfileRequest) => Promise<void>;
  requestVerification: () => Promise<string>;
  verifyEmail: (token: string) => Promise<string>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  requiresEmailVerification: false,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  login: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await authApi.login(data);
      setToken(token);
      set({
        user,
        isAuthenticated: true,
        requiresEmailVerification: false,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Login failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response: AuthLoginResponse = await authApi.register(data);
      setToken(response.token);
      set({
        user: response.user,
        isAuthenticated: true,
        requiresEmailVerification: true,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Registration failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  updateProfile: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const user = await authApi.updateProfile(data);
      set({
        user,
        isAuthenticated: true,
        requiresEmailVerification: false,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Profile update failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  loadProfileSetup: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await authApi.getProfileSetup();
      set({
        user,
        isAuthenticated: true,
        requiresEmailVerification: true,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Profile setup load failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  completeProfileSetup: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const user = await authApi.completeProfileSetup(data);
      set({
        user,
        isAuthenticated: true,
        requiresEmailVerification: true,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Profile setup failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  updatePreferences: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.updatePreferences(data);
      set((state) => ({
        user: state.user
          ? {
              ...state.user,
              preferences: data,
            }
          : state.user,
        isLoading: false,
      }));
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Update preferences failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  changePassword: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.changePassword(data);
      set({ isLoading: false });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Change password failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  deleteAccount: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.deleteAccount(data);
      clearToken();
      clearOrganizationStorage();
      set({
        user: null,
        isAuthenticated: false,
        requiresEmailVerification: false,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Delete account failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  requestVerification: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.requestVerification();
      set({
        isLoading: false,
      });
      return response.message;
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Request verification failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  verifyEmail: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.verifyEmail({ token });
      const storedToken = getToken();
      if (storedToken) {
        try {
          const user = await authApi.getMe();
          set({
            user,
            isAuthenticated: true,
            requiresEmailVerification: false,
            isLoading: false,
          });
        } catch (refreshError: unknown) {
          const message = getApiErrorMessage(refreshError, "Profile refresh failed");
          set({ error: message, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
      return response.message;
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Verify email failed");
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  logout: () => {
    clearToken();
    clearOrganizationStorage();
    set({ user: null, isAuthenticated: false, requiresEmailVerification: false });
  },

  checkAuth: async () => {
    const token = getToken();
    if (!token) {
      set({ isAuthenticated: false, user: null, requiresEmailVerification: false });
      return;
    }

    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, requiresEmailVerification: false });
    } catch (error) {
      const code = getApiErrorCode(error);
      if (code === "EMAIL_NOT_VERIFIED") {
        try {
          const user = await authApi.getProfileSetup();
          set({
            user,
            isAuthenticated: true,
            requiresEmailVerification: true,
          });
          return;
        } catch (profileError) {
          console.warn("checkAuth profile setup failed", profileError);
        }
      }
      console.warn("checkAuth failed", error);
      clearToken();
      set({ user: null, isAuthenticated: false, requiresEmailVerification: false });
    }
  },
}));
