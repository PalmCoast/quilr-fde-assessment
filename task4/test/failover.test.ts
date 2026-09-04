import { describe, expect, it } from "vitest";
import { assertNoStackLeak, ERROR_CODES } from "../src/errors.js";
import { TokenLimiter } from "../src/limiter.js";
import { DEFAULT_UPSTREAM_TIMEOUT_MS, ModelRouter } from "../src/router.js";
import { createMockUpstream } from "../src/upstream.js";

function router(options: {
  primary: "ok" | "429" | "timeout" | "error";
  secondary?: "ok" | "429" | "timeout" | "error";
  timeoutMs?: number;
  limitPerMinute?: number;
}): ModelRouter {
  return new ModelRouter({
    limiter: new TokenLimiter({ limitPerMinute: options.limitPerMinute ?? 50_000 }),
    primary: createMockUpstream({ name: "primary", behavior: options.primary }),
    secondary: createMockUpstream({ name: "secondary", behavior: options.secondary ?? "ok" }),
    timeoutMs: options.timeoutMs,
  });
}

describe("task4 model failover", () => {
  it("uses the primary when it succeeds", async () => {
    const result = await router({ primary: "ok" }).complete("tenant-demo", { prompt: "hello", tokens: 8 });
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected success");
    expect(result.body.upstream).toBe("primary");
  });

  it("fails over to secondary when primary returns 429", async () => {
    const result = await router({ primary: "429" }).complete("tenant-demo", { prompt: "hello", tokens: 8 });
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected success");
    expect(result.body.upstream).toBe("secondary");
  });

  it("fails over to secondary when primary exceeds the 3s timeout", async () => {
    expect(DEFAULT_UPSTREAM_TIMEOUT_MS).toBe(3_000);
    const result = await router({ primary: "timeout", timeoutMs: 40 }).complete("tenant-demo", {
      prompt: "hello",
      tokens: 8,
    });
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("expected success");
    expect(result.body.upstream).toBe("secondary");
  });

  it("returns the fixed envelope when both upstreams fail", async () => {
    const result = await router({ primary: "429", secondary: "error" }).complete("tenant-demo", {
      prompt: "hello",
      tokens: 8,
    });
    expect(result.status).toBe(502);
    expect(result.body).toEqual({
      error: {
        code: ERROR_CODES.UPSTREAM_UNAVAILABLE,
        message: "No healthy model upstream is available.",
        retryable: true,
      },
    });
    assertNoStackLeak(result.body);
  });

  it("returns the fixed rate-limit envelope with no stack traces", async () => {
    const box = router({ primary: "ok", limitPerMinute: 5 });
    await box.complete("tenant-demo", { tokens: 5, prompt: "a" });
    const result = await box.complete("tenant-demo", { tokens: 1, prompt: "b" });
    expect(result.status).toBe(429);
    expect(result.body).toEqual({
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: "Tenant token budget exceeded for the current minute.",
        retryable: true,
      },
    });
    assertNoStackLeak(result.body);
    expect(JSON.stringify(result.body)).not.toMatch(/at ModelRouter|node:internal|Error:/);
  });

  it("does not fail over on a primary application error", async () => {
    const result = await router({ primary: "error", secondary: "ok" }).complete("tenant-demo", {
      prompt: "hello",
      tokens: 8,
    });
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ error: { code: ERROR_CODES.UPSTREAM_UNAVAILABLE } });
  });
});
