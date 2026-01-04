export type SubscriptionTier = "free" | "starter" | "professional" | "enterprise";

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  mentions: boolean;
}

export interface DefaultBoardSettings {
  gridEnabled: boolean;
  snapToGrid: boolean;
}

export interface UserPreferences {
  theme: string;
  language: string;
  notifications: NotificationSettings;
  defaultBoardSettings?: DefaultBoardSettings | null;
}

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  profile_setup_completed: boolean;
  bio?: string | null;
  subscription_tier?: SubscriptionTier;
  subscription_expires_at?: string | null;
  preferences?: UserPreferences;
  created_at?: string;
  updated_at?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password_hash: string;
  display_name: string;
  username: string;
}

export interface UpdateProfileRequest {
  display_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
}

export type UpdatePreferencesRequest = UserPreferences;

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface DeleteAccountRequest {
  password: string;
  confirmation: string;
}

export type AuthLoginResponse = {
  token: string;
  user: User;
};
