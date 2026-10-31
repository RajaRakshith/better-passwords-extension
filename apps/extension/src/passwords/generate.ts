import { countPasswords, samplePassword } from "./password-space.ts";
import {
  cryptoRandomIndex,
  DIGIT,
  type FieldRules,
  LOWER,
  PasswordGenerationError,
  type PasswordStyle,
  type RandomIndex,
  UPPER,
} from "./policy.ts";
import { type ParsedRules, parseRules, rulesForStyle } from "./rules.ts";

export {
  cryptoRandomIndex,
  type FieldRules,
  PasswordGenerationError,
  type PasswordStyle,
  type RandomIndex,
} from "./policy.ts";
export { parseRules } from "./rules.ts";

/** Each output has equally many preimages, including the discarded replaced letters. */
export function applePasswordSpace(style: PasswordStyle): bigint {
  const base = BigInt(LOWER.length) ** 16n * BigInt(UPPER.length * DIGIT.length * 18 * 17);
  return style === "strong" ? base : base * BigInt((LOWER + UPPER + DIGIT).length * LOWER.length);
}

function appleCompatible(style: PasswordStyle, rules: ParsedRules): boolean {
  const alphabet = LOWER + UPPER + DIGIT + (style === "strong" ? "-" : "");
  return (
    rules.minLength <= 20 &&
    rules.maxLength >= 20 &&
    [...alphabet].every((c) => rules.allowed.includes(c)) &&
    (rules.maxConsecutive === undefined || rules.maxConsecutive >= (style === "strong" ? 6 : 20)) &&
    rules.required.every(
      (set) =>
        [LOWER, UPPER, DIGIT].some((group) => [...group].every((c) => set.includes(c))) ||
        (style === "strong" && set.includes("-")),
    )
  );
}

function appleShaped(style: PasswordStyle, random: RandomIndex): string {
  const position = (n: number) => {
    const index = random(n);
    if (!Number.isInteger(index) || index < 0 || index >= n) throw new PasswordGenerationError("generation-failed");
    return index;
  };
  const pick = (chars: string) => chars.charAt(position(chars.length));
  const letters = Array.from({ length: 18 }, () => pick(LOWER));
  const capital = position(18);
  let digit = position(17);
  if (digit >= capital) digit++;
  letters[capital] = pick(UPPER);
  letters[digit] = pick(DIGIT);
  if (style === "alphanumeric") return letters.join("") + pick(LOWER + UPPER + DIGIT) + pick(LOWER);
  return [letters.slice(0, 6), letters.slice(6, 12), letters.slice(12)].map((group) => group.join("")).join("-");
}

export function generatePassword(
  style: PasswordStyle,
  fieldRules: FieldRules = {},
  random: RandomIndex = cryptoRandomIndex,
): string {
  const rules = rulesForStyle(style, parseRules(fieldRules));
  if (appleCompatible(style, rules) && applePasswordSpace(style) >= 1n << 71n) return appleShaped(style, random);
  let possible = false;
  const start = Math.max(rules.minLength, Math.min(20, rules.maxLength));
  for (let length = start; length <= rules.maxLength; length++) {
    const count = countPasswords(rules, length);
    possible ||= count > 0n;
    if (count >= 1n << 64n) return samplePassword(rules, length, random);
  }
  throw new PasswordGenerationError(possible ? "weak-rules" : "invalid-rules");
}
