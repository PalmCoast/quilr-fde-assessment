export const ERROR_CODES = {
  RATE_LIMITED: "RATE_LIMITED",
  UNAUTHORIZED: "UNAUTHORIZED",
  BAD_REQUEST: "BAD_REQUEST",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
  };
};

const MESSAGES: Record<ErrorCode, string> = {
  RATE_LIMITED: "Tenant token budget exceeded for the current minute.",
  UNAUTHORIZED: "A tenant Bearer token is required.",
  BAD_REQUEST: "The request body is invalid.",
  UPSTREAM_UNAVAILABLE: "No healthy model upstream is available.",
};

export function errorEnvelope(code: ErrorCode, overrideMessage?: string): ErrorEnvelope {
  return {
    error: {
      code,
      message: overrideMessage ?? MESSAGES[code],
      retryable: code === "RATE_LIMITED" || code === "UPSTREAM_UNAVAILABLE",
    },
  };
}

export function httpStatusFor(code: ErrorCode): number {
  switch (code) {
    case "RATE_LIMITED":
      return 429;
    case "UNAUTHORIZED":
      return 401;
    case "BAD_REQUEST":
      return 400;
    case "UPSTREAM_UNAVAILABLE":
      return 502;
    default:
      return 500;
  }
}

export function assertNoStackLeak(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (text.includes("    at ") || text.includes("Error:") || text.includes("stack")) {
    throw new Error("Error envelope leaked an internal stack or error object");
  }
}
