export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
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

export interface LoginResponse {
  token: string;
  user: User;
}