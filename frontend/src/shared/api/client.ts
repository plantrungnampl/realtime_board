import axios from "axios";

import { getToken } from "@/features/auth/storage";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
