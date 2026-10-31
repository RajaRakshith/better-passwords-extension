export type PasswordStyle = "strong" | "alphanumeric";
export interface FieldRules {
  minLength?: number;
  maxLength?: number;
  passwordRules?: string;
}
export type RandomIndex = (n: number) => number;
export const LOWER = "abcdefghijkmnpqrstuvwxyz";
export const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const DIGIT = "23456789";
export const MAX_LENGTH = 64;
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
export const CLASSES: Record<string, string> = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digit: "0123456789",
  special: [...PRINTABLE].filter((c) => !/[a-z0-9]/i.test(c)).join(""),
  "ascii-printable": PRINTABLE,
};
export type GenerationErrorCode = "weak-rules" | "invalid-rules" | "unsupported-rules" | "generation-failed";
const MESSAGES: Record<GenerationErrorCode, string> = {
  "weak-rules": "This site's restrictions prevent a strong password suggestion.",
  "invalid-rules": "This site's password requirements conflict or are invalid.",
  "unsupported-rules": "This site's password requirements aren't supported.",
  "generation-failed": "Couldn't generate a password. Try again.",
};
export class PasswordGenerationError extends Error {
  constructor(readonly code: GenerationErrorCode) {
    super(MESSAGES[code]);
    this.name = "PasswordGenerationError";
  }
}
export const unique = (chars: string): string => [...new Set(chars)].join("");
export const cryptoRandomIndex: RandomIndex = (n) => {
  if (!Number.isSafeInteger(n) || n < 1 || n > 2 ** 32) throw new PasswordGenerationError("generation-failed");
  const limit = Math.floor(2 ** 32 / n) * n;
  const buffer = new Uint32Array(1);
  for (let attempt = 0; attempt < 128; attempt++) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % n;
  }
  throw new PasswordGenerationError("generation-failed");
};
