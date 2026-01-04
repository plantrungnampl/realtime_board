import { apiClient } from "@/shared/api/client";

import type {
  AuthLoginResponse,
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  DeleteAccountRequest,
  UpdatePreferencesRequest,
  UpdateProfileRequest,
  User,
} from "./types";

type VerifyEmailRequest = { token: string };
type MessageResponse = { message: string };

export async function login(data: LoginRequest): Promise<AuthLoginResponse> {
  const response = await apiClient.post<AuthLoginResponse>("/auth/login", data);
  return response.data;
}

export async function register(data: RegisterRequest): Promise<AuthLoginResponse> {
  const response = await apiClient.post<AuthLoginResponse>("/auth/register", data);
  return response.data;
}

export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>("/users/me");
  return response.data;
}

export async function updateProfile(data: UpdateProfileRequest): Promise<User> {
  const response = await apiClient.put<User>("/users/me", data);
  return response.data;
}

export async function updatePreferences(data: UpdatePreferencesRequest): Promise<void> {
  await apiClient.put("/users/me/preferences", data);
}

export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await apiClient.post("/users/me/password", data);
}

export async function deleteAccount(data: DeleteAccountRequest): Promise<void> {
  await apiClient.delete("/users/me", { data });
}

export async function getProfileSetup(): Promise<User> {
  const response = await apiClient.get<User>("/users/me/profile-setup");
  return response.data;
}

export async function completeProfileSetup(
  data: UpdateProfileRequest,
): Promise<User> {
  const response = await apiClient.put<User>("/users/me/profile-setup", data);
  return response.data;
}

export async function requestVerification(): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>("/auth/request-verification");
  return response.data;
}

export async function verifyEmail(
  data: VerifyEmailRequest,
): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>(
    "/auth/verify-email",
    data,
  );
  return response.data;
}
