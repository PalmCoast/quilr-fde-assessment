export const REDACTION = "[REDACTED]";

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/** 13–19 digits with optional spaces or dashes, later confirmed with Luhn. */
export const CARD_CANDIDATE_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

export const EMAIL_PREFIX_RE = /^[A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]*(?:\.[A-Za-z]*)?)?$/;
export const SSN_PREFIX_RE = /^\d{1,3}$|^\d{3}-$|^\d{3}-\d{1,2}$|^\d{3}-\d{2}-$|^\d{3}-\d{2}-\d{1,3}$/;
export const CARD_PREFIX_RE = /^(?:\d[ -]?){1,18}$/;

export function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const char = digits[i];
    if (char === undefined) continue;
    let n = Number(char);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
