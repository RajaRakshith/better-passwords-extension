import {
  CLASSES,
  DIGIT,
  type FieldRules,
  LOWER,
  MAX_LENGTH,
  PasswordGenerationError,
  type PasswordStyle,
  UPPER,
  unique,
} from "./policy.ts";

export interface ParsedRules {
  minLength: number;
  maxLength: number;
  required: string[];
  allowed: string;
  maxConsecutive?: number;
}

/** Separators inside bracket classes are literal characters, not clause boundaries. */
function splitOutside(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let bracket = false;
  for (let i = 0; i < input.length; i++) {
    if (!bracket && input[i] === "[") bracket = true;
    else if (bracket && input[i] === "]") {
      if (input[i + 1] === "]") i++;
      bracket = false;
    } else if (!bracket && input[i] === delimiter) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  if (bracket) throw new PasswordGenerationError("invalid-rules");
  parts.push(input.slice(start));
  return parts;
}

function characterSet(value: string): string {
  const values = splitOutside(value, ",");
  if (values.length > 128) throw new PasswordGenerationError("unsupported-rules");
  let chars = "";
  for (const raw of values) {
    const token = raw.trim();
    if (token.startsWith("[") && token.endsWith("]")) {
      const literal = token.slice(1, -1);
      if (
        !literal ||
        /[^\x20-\x7e]/.test(literal) ||
        literal.slice(1).includes("-") ||
        literal.slice(0, -1).includes("]")
      ) {
        throw new PasswordGenerationError("invalid-rules");
      }
      chars += literal;
    } else {
      const key = token.toLowerCase();
      const named = Object.hasOwn(CLASSES, key) ? CLASSES[key] : undefined;
      if (!named) throw new PasswordGenerationError(token ? "unsupported-rules" : "invalid-rules");
      chars += named;
    }
  }
  return unique(chars);
}

function integer(value: unknown, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new PasswordGenerationError("invalid-rules");
  return value;
}

/** Strict supported subset of Apple's grammar; restrictions never silently disappear. */
export function parseRules(input: FieldRules): ParsedRules {
  const rules: ParsedRules = { minLength: 0, maxLength: MAX_LENGTH, required: [], allowed: "" };
  if (input.minLength !== undefined) rules.minLength = integer(input.minLength, 0);
  if (input.maxLength !== undefined) rules.maxLength = Math.min(MAX_LENGTH, integer(input.maxLength, 1));
  if (input.passwordRules !== undefined && typeof input.passwordRules !== "string")
    throw new PasswordGenerationError("invalid-rules");
  const text = input.passwordRules ?? "";
  if (text.length > 4096) throw new PasswordGenerationError("unsupported-rules");
  const clauses = splitOutside(text, ";").filter((part) => part.trim() !== "");
  if (clauses.length > 128) throw new PasswordGenerationError("unsupported-rules");
  for (const clause of clauses) {
    const colon = clause.indexOf(":");
    if (colon < 0) throw new PasswordGenerationError("unsupported-rules");
    const name = clause.slice(0, colon).trim().toLowerCase();
    const value = clause.slice(colon + 1).trim();
    if (name === "allowed" || name === "required") {
      const chars = characterSet(value);
      rules.allowed = unique(rules.allowed + chars);
      if (name === "required" && !rules.required.includes(chars)) rules.required.push(chars);
    } else if (["minlength", "maxlength", "max-consecutive"].includes(name)) {
      if (!/^\d+$/.test(value)) throw new PasswordGenerationError("invalid-rules");
      const n = integer(Number(value), name === "minlength" ? 0 : 1);
      if (name === "minlength") rules.minLength = Math.max(rules.minLength, n);
      else if (name === "maxlength") rules.maxLength = Math.min(rules.maxLength, n);
      else rules.maxConsecutive = Math.min(rules.maxConsecutive ?? MAX_LENGTH, n);
    } else throw new PasswordGenerationError("unsupported-rules");
  }
  if (rules.minLength > MAX_LENGTH || rules.required.length > 8) throw new PasswordGenerationError("unsupported-rules");
  if (rules.minLength > rules.maxLength) throw new PasswordGenerationError("invalid-rules");
  return rules;
}

export function rulesForStyle(style: PasswordStyle, raw: ParsedRules): ParsedRules {
  const defaults = LOWER + UPPER + DIGIT + (style === "strong" ? "-" : "");
  const allowed = unique(
    [...(raw.allowed || defaults)].filter((c) => style === "strong" || /[a-z0-9]/i.test(c)).join(""),
  );
  const required = (raw.allowed ? raw.required : [LOWER, UPPER, DIGIT]).map((set) =>
    [...set].filter((c) => allowed.includes(c)).join(""),
  );
  if (!allowed || required.some((set) => !set)) throw new PasswordGenerationError("invalid-rules");
  return { ...raw, allowed, required };
}
