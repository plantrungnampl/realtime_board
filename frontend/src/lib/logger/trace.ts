type TraceContextSource = "client" | "server";

export type TraceContext = {
  traceId: string;
  spanId?: string;
  traceparent?: string;
  requestId?: string;
  source: TraceContextSource;
  updatedAt: number;
};

const TRACEPARENT_VERSION = "00";
const TRACEPARENT_FLAGS = "01";
const TRACEPARENT_REGEX = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i;
const ZERO_TRACE_ID = "00000000000000000000000000000000";
const ZERO_SPAN_ID = "0000000000000000";

let activeTraceContext: TraceContext | null = null;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const generateBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

const generateTraceId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    const id = crypto.randomUUID().replace(/-/g, "");
    if (id.length === 32 && id !== ZERO_TRACE_ID) {
      return id;
    }
  }
  let traceId = toHex(generateBytes(16));
  if (traceId === ZERO_TRACE_ID) {
    traceId = toHex(generateBytes(16));
  }
  return traceId;
};

const generateSpanId = (): string => {
  let spanId = toHex(generateBytes(8));
  if (spanId === ZERO_SPAN_ID) {
    spanId = toHex(generateBytes(8));
  }
  return spanId;
};

const buildTraceparent = (traceId: string, spanId: string): string =>
  `${TRACEPARENT_VERSION}-${traceId}-${spanId}-${TRACEPARENT_FLAGS}`;

const parseTraceparent = (value: string): { traceId: string; spanId: string } | null => {
  const match = value.trim().match(TRACEPARENT_REGEX);
  if (!match) {
    return null;
  }
  const traceId = match[1].toLowerCase();
  const spanId = match[2].toLowerCase();
  if (traceId === ZERO_TRACE_ID || spanId === ZERO_SPAN_ID) {
    return null;
  }
  return { traceId, spanId };
};

const getHeaderValue = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null => {
  const direct = headers[name];
  if (typeof direct === "string") {
    return direct;
  }
  if (Array.isArray(direct) && direct.length > 0) {
    return direct[0];
  }
  const lower = headers[name.toLowerCase()];
  if (typeof lower === "string") {
    return lower;
  }
  if (Array.isArray(lower) && lower.length > 0) {
    return lower[0];
  }
  return null;
};

export const getActiveTraceContext = (): TraceContext | null => activeTraceContext;

const setActiveTraceContext = (context: TraceContext | null): void => {
  activeTraceContext = context;
};

export const buildTraceHeaders = (): {
  headers: Record<string, string>;
  traceContext: TraceContext;
} => {
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const traceparent = buildTraceparent(traceId, spanId);
  const traceContext: TraceContext = {
    traceId,
    spanId,
    traceparent,
    source: "client",
    updatedAt: Date.now(),
  };
  return {
    headers: {
      "x-trace-id": traceId,
      traceparent,
    },
    traceContext,
  };
};

export const updateTraceContextFromHeaders = (
  headers: Record<string, string | string[] | undefined>,
): TraceContext | null => {
  const traceparent = getHeaderValue(headers, "traceparent");
  const parsed = traceparent ? parseTraceparent(traceparent) : null;
  const traceIdHeader = getHeaderValue(headers, "x-trace-id");
  const requestIdHeader = getHeaderValue(headers, "x-request-id");

  if (!parsed && !traceIdHeader) {
    return null;
  }

  const traceId = traceIdHeader ?? parsed?.traceId;
  if (!traceId) {
    return null;
  }

  const spanId = parsed?.spanId;
  const context: TraceContext = {
    traceId,
    spanId,
    traceparent: parsed ? traceparent ?? undefined : undefined,
    requestId: requestIdHeader ?? undefined,
    source: parsed ? "server" : "client",
    updatedAt: Date.now(),
  };

  setActiveTraceContext(context);
  return context;
};

export const setActiveTraceContextFromRequest = (context: TraceContext): void => {
  setActiveTraceContext(context);
};
