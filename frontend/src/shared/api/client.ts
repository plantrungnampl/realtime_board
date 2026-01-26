import axios, { AxiosHeaders } from "axios";

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

const normalizeHeaders = (
  headers: unknown,
): Record<string, string | string[] | undefined> => {
  if (!headers) return {};
  if (headers instanceof AxiosHeaders) {
    return headers.toJSON() as Record<string, string | string[] | undefined>;
  }
  return headers as Record<string, string | string[] | undefined>;
};

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  const nextHeaders = new AxiosHeaders(config.headers);
  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }
  const { headers, traceContext } = buildTraceHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined) {
      nextHeaders.set(key, value);
    }
  });
  config.headers = nextHeaders;
  (config as ApiClientConfig).metadata = { traceContext };
  setActiveTraceContextFromRequest(traceContext);
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const traceContext =
      updateTraceContextFromHeaders(normalizeHeaders(response.headers))
      ?? (response.config as ApiClientConfig).metadata?.traceContext
      ?? null;
    if (traceContext) {
      setActiveTraceContextFromRequest(traceContext);
    }
    return response;
  },
  (error) => {
    const responseHeaders = normalizeHeaders(error?.response?.headers);
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
