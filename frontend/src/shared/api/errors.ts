import axios from "axios";

type ApiErrorPayload = {
  message?: unknown;
  error?: {
    message?: unknown;
    code?: unknown;
  };
};

const CODE_PATTERN = /^[A-Z0-9_]+$/;

function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { message, error } = payload as ApiErrorPayload;
  if (typeof error?.message === "string" && error.message.trim()) {
    return sanitizeMessage(error.message);
  }
  if (typeof message === "string" && message.trim()) {
    return sanitizeMessage(message);
  }
  return null;
}

function sanitizeMessage(message: string): string | null {
  if (CODE_PATTERN.test(message.trim())) {
    return null;
  }
  return message;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = extractMessage(error.response?.data);
    if (message) {
      return message;
    }
    if (
      typeof error.message === "string" &&
      error.message.trim() &&
      !error.message.startsWith("Request failed with status code")
    ) {
      return error.message;
    }
    return fallback;
  }

  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
    const sanitized = sanitizeMessage(error.message);
    return sanitized ?? fallback;
  }

  return fallback;
}
