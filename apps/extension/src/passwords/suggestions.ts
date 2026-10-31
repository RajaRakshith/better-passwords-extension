import type { GeneratedPasswords } from "../messages.ts";
import { type FieldRules, generatePassword, PasswordGenerationError } from "./generate.ts";

export function passwordSuggestions(rules: FieldRules): GeneratedPasswords {
  const result: GeneratedPasswords = {};
  for (const style of ["strong", "alphanumeric"] as const) {
    try {
      result[style] = generatePassword(style, rules);
    } catch (error) {
      if (!(error instanceof PasswordGenerationError)) throw error;
      result.errors ??= {};
      result.errors[style] = error.message;
    }
  }
  return result;
}

export function passwordForStyle(passwords: GeneratedPasswords, style: unknown): string {
  if (style !== "strong" && style !== "alphanumeric") throw new Error("That password option isn't available.");
  const password = passwords[style];
  if (typeof password !== "string" || !password) throw new Error("That password option isn't available.");
  return password;
}
