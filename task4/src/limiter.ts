import { DatabaseSync } from "node:sqlite";

export const DEFAULT_LIMIT_PER_MINUTE = 50_000;

export type ReserveResult =
  | { allowed: true; remaining: number; used: number; windowStart: number }
  | { allowed: false; remaining: 0; used: number; windowStart: number };

export class TokenLimiter {
  readonly limitPerMinute: number;
  readonly #db: DatabaseSync;
  #closed = false;

  constructor(options?: { dbPath?: string; limitPerMinute?: number }) {
    this.limitPerMinute = options?.limitPerMinute ?? DEFAULT_LIMIT_PER_MINUTE;
    this.#db = new DatabaseSync(options?.dbPath ?? ":memory:");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        tenant_id TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        tokens INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, window_start)
      );
    `);
  }

  windowStart(now = Date.now()): number {
    return Math.floor(now / 60_000) * 60_000;
  }

  peek(tenantId: string, now = Date.now()): { used: number; remaining: number; windowStart: number } {
    const windowStart = this.windowStart(now);
    const row = this.#db
      .prepare("SELECT tokens FROM token_usage WHERE tenant_id = ? AND window_start = ?")
      .get(tenantId, windowStart) as { tokens: number } | undefined;
    const used = row?.tokens ?? 0;
    return {
      used,
      remaining: Math.max(0, this.limitPerMinute - used),
      windowStart,
    };
  }

  reserve(tenantId: string, tokens: number, now = Date.now()): ReserveResult {
    if (!Number.isFinite(tokens) || tokens <= 0) {
      tokens = 1;
    }
    const windowStart = this.windowStart(now);
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#db
        .prepare("SELECT tokens FROM token_usage WHERE tenant_id = ? AND window_start = ?")
        .get(tenantId, windowStart) as { tokens: number } | undefined;
      const used = row?.tokens ?? 0;
      if (used + tokens > this.limitPerMinute) {
        this.#db.exec("ROLLBACK");
        return { allowed: false, remaining: 0, used, windowStart };
      }
      this.#db
        .prepare(
          `INSERT INTO token_usage (tenant_id, window_start, tokens)
           VALUES (?, ?, ?)
           ON CONFLICT(tenant_id, window_start) DO UPDATE SET tokens = tokens + excluded.tokens`,
        )
        .run(tenantId, windowStart, tokens);
      this.#db.exec("COMMIT");
      const next = used + tokens;
      return {
        allowed: true,
        remaining: this.limitPerMinute - next,
        used: next,
        windowStart,
      };
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#db.close();
  }
}

export function estimateTokens(body: {
  tokens?: unknown;
  max_tokens?: unknown;
  messages?: unknown;
  prompt?: unknown;
}): number {
  if (typeof body.tokens === "number" && Number.isFinite(body.tokens)) {
    return Math.max(1, Math.ceil(body.tokens));
  }
  const maxTokens = typeof body.max_tokens === "number" ? Math.max(0, body.max_tokens) : 0;
  const text =
    typeof body.prompt === "string"
      ? body.prompt
      : JSON.stringify(body.messages ?? "");
  return Math.max(1, Math.ceil(text.length / 4) + maxTokens);
}
