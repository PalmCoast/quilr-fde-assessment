import { ERROR_CODES, errorEnvelope, httpStatusFor, type ErrorEnvelope } from "./errors.js";
import { estimateTokens, TokenLimiter } from "./limiter.js";
import type { ChatRequest, ChatSuccess, Upstream, UpstreamResult } from "./upstream.js";

export const DEFAULT_UPSTREAM_TIMEOUT_MS = 3_000;

export type RouterSuccess = {
  status: 200;
  body: ChatSuccess & { usage: { estimated_tokens: number; remaining: number } };
};

export type RouterFailure = {
  status: number;
  body: ErrorEnvelope;
};

export class ModelRouter {
  readonly timeoutMs: number;
  readonly limiter: TokenLimiter;
  readonly primary: Upstream;
  readonly secondary: Upstream;

  constructor(options: {
    limiter: TokenLimiter;
    primary: Upstream;
    secondary: Upstream;
    timeoutMs?: number;
  }) {
    this.limiter = options.limiter;
    this.primary = options.primary;
    this.secondary = options.secondary;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  }

  async complete(tenantId: string, request: ChatRequest): Promise<RouterSuccess | RouterFailure> {
    const tokens = estimateTokens(request);
    const reservation = this.limiter.reserve(tenantId, tokens);
    if (!reservation.allowed) {
      return {
        status: httpStatusFor(ERROR_CODES.RATE_LIMITED),
        body: errorEnvelope(ERROR_CODES.RATE_LIMITED),
      };
    }

    const primary = await this.#call(this.primary, request);
    if (primary.ok) {
      return this.#success(primary.body, tokens, reservation.remaining);
    }

    if (primary.reason === "rate_limited" || primary.reason === "timeout") {
      const secondary = await this.#call(this.secondary, request);
      if (secondary.ok) {
        return this.#success(secondary.body, tokens, reservation.remaining);
      }
    }

    return {
      status: httpStatusFor(ERROR_CODES.UPSTREAM_UNAVAILABLE),
      body: errorEnvelope(ERROR_CODES.UPSTREAM_UNAVAILABLE),
    };
  }

  async #call(upstream: Upstream, request: ChatRequest): Promise<UpstreamResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await upstream.complete(request, controller.signal);
    } catch (error) {
      const aborted =
        controller.signal.aborted ||
        (error instanceof Error && (error.name === "AbortError" || error.message === "aborted"));
      return { ok: false, status: aborted ? 504 : 500, reason: aborted ? "timeout" : "error" };
    } finally {
      clearTimeout(timer);
    }
  }

  #success(body: ChatSuccess, tokens: number, remaining: number): RouterSuccess {
    return {
      status: 200,
      body: {
        ...body,
        usage: { estimated_tokens: tokens, remaining },
      },
    };
  }
}
