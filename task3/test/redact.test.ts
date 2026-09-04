import { describe, expect, it } from "vitest";
import {
  ambiguousTailLength,
  redactComplete,
  redactStream,
  splitSafePrefix,
  StreamingPiiRedactor,
} from "../src/redact.js";

async function collect(chunks: string[]): Promise<string> {
  const parts: string[] = [];
  for await (const part of redactStream(chunks)) {
    parts.push(part);
  }
  return parts.join("");
}

describe("task3 complete-text redaction", () => {
  it("redacts an email", () => {
    expect(redactComplete("Contact jane.doe@acme.com please")).toBe("Contact [REDACTED] please");
  });

  it("redacts a US SSN", () => {
    expect(redactComplete("SSN 123-45-6789 on file")).toBe("SSN [REDACTED] on file");
  });

  it("redacts a Luhn-valid credit card and leaves a random number alone", () => {
    expect(redactComplete("card 4111111111111111 charged")).toBe("card [REDACTED] charged");
    expect(redactComplete("order 4111111111111112 stays")).toBe("order 4111111111111112 stays");
  });

  it("redacts a spaced card and an Amex number", () => {
    expect(redactComplete("pay 4111 1111 1111 1111 now")).toBe("pay [REDACTED] now");
    expect(redactComplete("amex 378282246310005")).toBe("amex [REDACTED]");
  });
});

describe("task3 streaming across chunk boundaries", () => {
  it("redacts an email split after the @", async () => {
    expect(await collect(["please email jane.doe@", "acme.com today"])).toBe(
      "please email [REDACTED] today",
    );
  });

  it("redacts an email split inside the local part", async () => {
    expect(await collect(["write alice", ".j@harbor.org for help"])).toBe("write [REDACTED] for help");
  });

  it("redacts an SSN split across three chunks", async () => {
    expect(await collect(["id 123-", "45-", "6789 done"])).toBe("id [REDACTED] done");
  });

  it("redacts a card split across chunks", async () => {
    expect(await collect(["cc 4111-1111-", "1111-1111 thanks"])).toBe("cc [REDACTED] thanks");
  });

  it("redacts a spaced card when sliced into short chunks", async () => {
    const text =
      "Please email jane.doe@acme.com. SSN 123-45-6789. Card 4111 1111 1111 1111. Then continue.";
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 11) {
      chunks.push(text.slice(i, i + 11));
    }
    expect(await collect(chunks)).toBe(
      "Please email [REDACTED]. SSN [REDACTED]. Card [REDACTED]. Then continue.",
    );
  });

  it("redacts mixed PII in one stream", async () => {
    const text = await collect([
      "User jane@",
      "corp.com ssn 123-45-",
      "6789 card 4111111111111111 end",
    ]);
    expect(text).toBe("User [REDACTED] ssn [REDACTED] card [REDACTED] end");
  });
});

describe("task3 low-TTFT hold policy", () => {
  it("flushes a safe prefix immediately when the tail is a complete sentence", () => {
    const { safe, held } = splitSafePrefix("The weather is fine. ");
    expect(safe).toBe("The weather is fine. ");
    expect(held).toBe("");
    expect(ambiguousTailLength("The weather is fine. ")).toBe(0);
  });

  it("holds only the ambiguous last token, not the whole buffer", () => {
    const redactor = new StreamingPiiRedactor();
    const flushed = redactor.push("Thanks for calling. Reach us at support");
    expect(flushed).toBe("Thanks for calling. Reach us at ");
    expect(redactor.held).toBe("support");
  });

  it("holds a partial card suffix and nothing before it", () => {
    const { safe, held } = splitSafePrefix("Invoice total charged to 4111");
    expect(safe).toBe("Invoice total charged to ");
    expect(held).toBe("4111");
  });

  it("does not emit a partial email before the domain arrives", () => {
    const redactor = new StreamingPiiRedactor();
    expect(redactor.push("mail ")).toBe("mail ");
    expect(redactor.push("ada@")).toBe("");
    expect(redactor.held).toBe("ada@");
    expect(redactor.push("quilr.ai ")).toBe("[REDACTED] ");
    expect(redactor.held).toBe("");
  });
});
