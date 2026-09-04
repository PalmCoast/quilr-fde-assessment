import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LIMIT_PER_MINUTE, estimateTokens, TokenLimiter } from "../src/limiter.js";

const limiters: TokenLimiter[] = [];

afterEach(() => {
  for (const limiter of limiters) {
    limiter.close();
  }
  limiters.length = 0;
});

function limiter(options?: ConstructorParameters<typeof TokenLimiter>[0]): TokenLimiter {
  const instance = new TokenLimiter(options);
  limiters.push(instance);
  return instance;
}

describe("task4 token limiter", () => {
  it("defaults to 50,000 tokens per tenant per minute", () => {
    expect(DEFAULT_LIMIT_PER_MINUTE).toBe(50_000);
    expect(limiter().limitPerMinute).toBe(50_000);
  });

  it("allows a request under the budget", () => {
    const result = limiter({ limitPerMinute: 100 }).reserve("tenant-demo", 40);
    expect(result).toMatchObject({ allowed: true, used: 40, remaining: 60 });
  });

  it("rejects a request that would exceed 50,000 tokens in the current minute", () => {
    const box = limiter();
    expect(box.reserve("tenant-a", 50_000).allowed).toBe(true);
    expect(box.reserve("tenant-a", 1).allowed).toBe(false);
  });

  it("isolates budgets per tenant", () => {
    const box = limiter({ limitPerMinute: 50 });
    expect(box.reserve("alpha", 50).allowed).toBe(true);
    expect(box.reserve("beta", 50).allowed).toBe(true);
    expect(box.reserve("alpha", 1).allowed).toBe(false);
  });

  it("resets usage in the next minute window", () => {
    const box = limiter({ limitPerMinute: 10 });
    const now = 1_700_000_000_000;
    expect(box.reserve("t", 10, now).allowed).toBe(true);
    expect(box.reserve("t", 1, now).allowed).toBe(false);
    expect(box.reserve("t", 10, now + 60_000).allowed).toBe(true);
  });

  it("persists usage in SQLite", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quilr-task4-"));
    const dbPath = path.join(dir, "usage.db");
    const first = limiter({ dbPath, limitPerMinute: 20 });
    expect(first.reserve("tenant-demo", 15).allowed).toBe(true);
    first.close();
    const second = limiter({ dbPath, limitPerMinute: 20 });
    expect(second.peek("tenant-demo").used).toBe(15);
    expect(second.reserve("tenant-demo", 6).allowed).toBe(false);
  });

  it("estimates tokens from an explicit tokens field for tests", () => {
    expect(estimateTokens({ tokens: 250 })).toBe(250);
    expect(estimateTokens({ prompt: "abcd", max_tokens: 2 })).toBe(3);
  });
});
