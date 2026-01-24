import { getToken } from "@/features/auth/storage";
import { apiClient } from "@/shared/api/client";

type ClientLogLevel = "debug" | "info" | "warn" | "error";

type ClientLogEvent = {
  level: ClientLogLevel;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
  url?: string;
  user_agent?: string;
  session_id?: string;
  trace_id?: string;
  span_id?: string;
  timestamp?: string;
  route?: string;
  source?: string;
};

type LoggerConfig = {
  minLevel: ClientLogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  remoteEndpoint: string;
  batchSize: number;
  flushIntervalMs: number;
  sampleRate: number;
};

const defaultConfig: LoggerConfig = {
  minLevel: import.meta.env.DEV ? "debug" : "info",
  enableConsole: import.meta.env.DEV,
  enableRemote: true,
  remoteEndpoint: "/api/telemetry/client",
  batchSize: 50,
  flushIntervalMs: 5000,
  sampleRate: 0.2,
};

const levelOrder: Record<ClientLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

class ClientLogger {
  private config: LoggerConfig;
  private buffer: ClientLogEvent[] = [];
  private flushTimer: number | null = null;
  private sessionId: string;
  private initialized = false;
  private remoteUrl: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.sessionId = this.generateId();
    this.remoteUrl = this.resolveRemoteUrl(this.config.remoteEndpoint);
  }

  init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (this.config.enableRemote) {
      this.startFlushTimer();
      window.addEventListener("pagehide", () => {
        void this.flush(true);
      });
    }

    window.addEventListener("error", (event) => {
      const error = event.error instanceof Error ? event.error : undefined;
      this.error("Uncaught error", {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }, error);
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const error = reason instanceof Error ? reason : undefined;
      this.error("Unhandled promise rejection", {
        reason: this.safeStringify(reason),
      }, error);
    });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    const stack = error?.stack;
    this.log("error", message, context, stack);
  }

  private log(
    level: ClientLogLevel,
    message: string,
    context?: Record<string, unknown>,
    stack?: string,
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const event: ClientLogEvent = {
      level,
      message,
      context,
      stack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      route: window.location.pathname,
      user_agent: navigator.userAgent,
      session_id: this.sessionId,
      source: "frontend",
    };

    if (this.config.enableConsole) {
      this.logToConsole(level, message, context, stack);
    }

    if (!this.config.enableRemote) {
      return;
    }

    this.buffer.push(event);
    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  private async flush(useBeacon = false): Promise<void> {
    if (!this.buffer.length) {
      return;
    }

    const batch = this.buffer.splice(0, this.config.batchSize);
    const payload = JSON.stringify({ events: batch });

    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(this.remoteUrl, blob);
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      await fetch(this.remoteUrl, {
        method: "POST",
        headers,
        body: payload,
        keepalive: true,
      });
    } catch {
      // Drop errors to avoid feedback loops.
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = window.setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
  }

  private shouldLog(level: ClientLogLevel): boolean {
    if (levelOrder[level] < levelOrder[this.config.minLevel]) {
      return false;
    }
    if (level === "error" || level === "warn") {
      return true;
    }
    return Math.random() <= this.config.sampleRate;
  }

  private logToConsole(
    level: ClientLogLevel,
    message: string,
    context?: Record<string, unknown>,
    stack?: string,
  ): void {
    const payload = context ? { ...context, stack } : { stack };
    switch (level) {
      case "debug":
        console.debug(message, payload);
        break;
      case "info":
        console.info(message, payload);
        break;
      case "warn":
        console.warn(message, payload);
        break;
      case "error":
        console.error(message, payload);
        break;
      default:
        console.log(message, payload);
    }
  }

  private generateId(): string {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private resolveRemoteUrl(endpoint: string): string {
    const base = apiClient.defaults.baseURL ?? window.location.origin;
    try {
      return new URL(endpoint, base).toString();
    } catch {
      return endpoint;
    }
  }

  private safeStringify(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

export const clientLogger = new ClientLogger();
