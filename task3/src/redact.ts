import {
  CARD_CANDIDATE_RE,
  CARD_PREFIX_RE,
  digitsOnly,
  EMAIL_PREFIX_RE,
  EMAIL_RE,
  luhnValid,
  REDACTION,
  SSN_PREFIX_RE,
  SSN_RE,
} from "./patterns.js";

export { REDACTION };

export function redactComplete(text: string): string {
  let next = text.replace(EMAIL_RE, REDACTION).replace(SSN_RE, REDACTION);
  next = next.replace(CARD_CANDIDATE_RE, (candidate) => {
    const digits = digitsOnly(candidate);
    return luhnValid(digits) ? REDACTION : candidate;
  });
  return next;
}

function lastToken(text: string): { prefix: string; token: string } {
  const match = /^(.*?)(\S+)$/s.exec(text);
  if (!match) {
    return { prefix: text, token: "" };
  }
  return { prefix: match[1] ?? "", token: match[2] ?? "" };
}

function trailingDigitRunLength(buffer: string): number {
  const match = /(?:\d[\d -]*)$/.exec(buffer);
  if (!match?.[0]) {
    return 0;
  }
  const run = match[0];
  const digits = digitsOnly(run);
  // Hold while more digits could still arrive (cards are 13–19).
  if (digits.length >= 1 && digits.length < 19) {
    return run.length;
  }
  return 0;
}

/**
 * Longest suffix that could still become an email, SSN, or card once more
 * bytes arrive. Everything before that suffix is safe to flush.
 */
export function ambiguousTailLength(buffer: string): number {
  if (!buffer) {
    return 0;
  }

  // Spaced cards are several tokens ("4111 1111 11"). Hold the whole run
  // before falling back to a single email-shaped word.
  const digitHold = trailingDigitRunLength(buffer);
  if (digitHold > 0) {
    return digitHold;
  }

  const { token } = lastToken(buffer);
  if (token && (EMAIL_PREFIX_RE.test(token) || SSN_PREFIX_RE.test(token) || CARD_PREFIX_RE.test(token))) {
    return token.length;
  }

  return 0;
}

export type StreamFlush = {
  safe: string;
  held: string;
};

export function splitSafePrefix(buffer: string): StreamFlush {
  const hold = ambiguousTailLength(buffer);
  const safeRaw = hold > 0 ? buffer.slice(0, -hold) : buffer;
  const held = hold > 0 ? buffer.slice(-hold) : "";
  return {
    safe: redactComplete(safeRaw),
    held,
  };
}

export class StreamingPiiRedactor {
  #buffer = "";

  push(chunk: string): string {
    this.#buffer += chunk;
    const { safe, held } = splitSafePrefix(this.#buffer);
    this.#buffer = held;
    return safe;
  }

  end(): string {
    const leftover = redactComplete(this.#buffer);
    this.#buffer = "";
    return leftover;
  }

  get held(): string {
    return this.#buffer;
  }
}

export async function* redactStream(
  chunks: AsyncIterable<string> | Iterable<string>,
): AsyncGenerator<string, void, undefined> {
  const redactor = new StreamingPiiRedactor();
  for await (const chunk of chunks) {
    const safe = redactor.push(chunk);
    if (safe) {
      yield safe;
    }
  }
  const tail = redactor.end();
  if (tail) {
    yield tail;
  }
}
