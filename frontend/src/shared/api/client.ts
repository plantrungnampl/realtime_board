import axios from "axios";

import { getToken } from "@/features/auth/storage";
import {
  buildTraceHeaders,
  setActiveTraceContextFromRequest,
  updateTraceContextFromHeaders,
  type TraceContext,
} from "@/lib/logger/trace";

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
  const { headers, traceContext } = buildTraceHeaders();
  config.headers = {
    ...(config.headers ?? {}),
    ...headers,
  };
  (config as ApiClientConfig).metadata = { traceContext };
  setActiveTraceContextFromRequest(traceContext);
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const traceContext =
      updateTraceContextFromHeaders(response.headers)
      ?? (response.config as ApiClientConfig).metadata?.traceContext
      ?? null;
    if (traceContext) {
      setActiveTraceContextFromRequest(traceContext);
    }
    return response;
  },
  (error) => {
    const responseHeaders =
      error?.response?.headers as Record<string, string | string[] | undefined> | undefined;
    const traceContext =
      (responseHeaders && updateTraceContextFromHeaders(responseHeaders))
      ?? (error?.config as ApiClientConfig | undefined)?.metadata?.traceContext
      ?? null;
    if (traceContext) {
      setActiveTraceContextFromRequest(traceContext);
    }
    return Promise.reject(error);
  },
);

type ApiClientConfig = {
  metadata?: {
    traceContext?: TraceContext;
  };
};
