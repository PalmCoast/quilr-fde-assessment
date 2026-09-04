export type ChatRequest = {
  model?: string;
  messages?: unknown;
  prompt?: string;
  max_tokens?: number;
  tokens?: number;
};

export type ChatSuccess = {
  id: string;
  object: "chat.completion";
  model: string;
  upstream: "primary" | "secondary";
  choices: Array<{ index: number; message: { role: "assistant"; content: string } }>;
};

export type UpstreamResult =
  | { ok: true; status: number; body: ChatSuccess }
  | { ok: false; status: number; reason: "rate_limited" | "timeout" | "error" };

export type Upstream = {
  name: "primary" | "secondary";
  complete(request: ChatRequest, signal: AbortSignal): Promise<UpstreamResult>;
};

export type MockUpstreamOptions = {
  name: "primary" | "secondary";
  behavior?: "ok" | "429" | "timeout" | "error";
  delayMs?: number;
  model?: string;
};

export function createMockUpstream(options: MockUpstreamOptions): Upstream {
  const behavior = options.behavior ?? "ok";
  const delayMs = options.delayMs ?? 0;
  const model = options.model ?? (options.name === "primary" ? "quilr-primary-mock" : "quilr-secondary-mock");

  return {
    name: options.name,
    async complete(request: ChatRequest, signal: AbortSignal): Promise<UpstreamResult> {
      if (delayMs > 0) {
        await sleep(delayMs, signal);
      }
      if (signal.aborted) {
        return { ok: false, status: 504, reason: "timeout" };
      }
      if (behavior === "429") {
        return { ok: false, status: 429, reason: "rate_limited" };
      }
      if (behavior === "timeout") {
        await sleep(60_000, signal);
        return { ok: false, status: 504, reason: "timeout" };
      }
      if (behavior === "error") {
        return { ok: false, status: 500, reason: "error" };
      }
      const prompt =
        typeof request.prompt === "string"
          ? request.prompt
          : JSON.stringify(request.messages ?? "hello");
      return {
        ok: true,
        status: 200,
        body: {
          id: `${options.name}_mock`,
          object: "chat.completion",
          model,
          upstream: options.name,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: `mock[${options.name}]: ${prompt.slice(0, 80)}` },
            },
          ],
        },
      };
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
