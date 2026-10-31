import { cryptoRandomIndex, MAX_LENGTH, PasswordGenerationError, type RandomIndex, unique } from "./policy.ts";
import type { ParsedRules } from "./rules.ts";

/** Uniform rank in [0, limit), with bounded rejection rather than modulo reduction. */
export function sampleBelow(limit: bigint, random: RandomIndex = cryptoRandomIndex): bigint {
  if (limit < 1n) throw new PasswordGenerationError("invalid-rules");
  if (limit === 1n) return 0n;
  const bits = (limit - 1n).toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const firstMask = (1 << (((bits - 1) % 8) + 1)) - 1;
  for (let attempt = 0; attempt < 128; attempt++) {
    let rank = 0n;
    for (let i = 0; i < bytes; i++) {
      let byte = random(256);
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new PasswordGenerationError("generation-failed");
      if (i === 0) byte &= firstMask;
      rank = (rank << 8n) | BigInt(byte);
    }
    if (rank < limit) return rank;
  }
  throw new PasswordGenerationError("generation-failed");
}

function passwordSpace(rules: ParsedRules, length: number) {
  if (
    !Number.isInteger(length) ||
    length < 0 ||
    length > MAX_LENGTH ||
    rules.required.length > 8 ||
    !rules.allowed ||
    /[^\x20-\x7e]/.test(rules.allowed) ||
    rules.allowed.length > 95
  )
    throw new PasswordGenerationError("unsupported-rules");
  const chars = [...unique(rules.allowed)];
  const masks = chars.map((c) =>
    rules.required.reduce((mask, set, i) => (set.includes(c) ? mask | (1 << i) : mask), 0),
  );
  const full = (1 << rules.required.length) - 1;
  const consecutive = rules.maxConsecutive ?? length;
  const trackRun = consecutive < length;
  const memo = new Map<string, bigint>();
  let states = 0;
  let transitions = 0;
  function count(left: number, mask: number, last: number, run: number): bigint {
    if (left === 0) return mask === full ? 1n : 0n;
    const key = `${left}:${mask}:${last}:${run}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (++states > 50_000) throw new PasswordGenerationError("unsupported-rules");
    let total = 0n;
    for (let i = 0; i < chars.length; i++) {
      if (++transitions > 2_000_000) throw new PasswordGenerationError("unsupported-rules");
      const nextRun = trackRun ? (i === last ? run + 1 : 1) : 0;
      if (trackRun && nextRun > consecutive) continue;
      total += count(left - 1, mask | (masks[i] ?? 0), trackRun ? i : -1, nextRun);
    }
    memo.set(key, total);
    return total;
  }
  const size = length < rules.minLength || length > rules.maxLength ? 0n : count(length, 0, -1, 0);
  function unrank(rank: bigint): string {
    let result = "";
    let mask = 0;
    let last = -1;
    let run = 0;
    for (let left = length; left > 0; left--) {
      let chosen = false;
      for (let i = 0; i < chars.length; i++) {
        const nextRun = trackRun ? (i === last ? run + 1 : 1) : 0;
        if (trackRun && nextRun > consecutive) continue;
        const nextMask = mask | (masks[i] ?? 0);
        const ways = count(left - 1, nextMask, trackRun ? i : -1, nextRun);
        if (rank < ways) {
          result += chars[i];
          mask = nextMask;
          last = trackRun ? i : -1;
          run = nextRun;
          chosen = true;
          break;
        }
        rank -= ways;
      }
      if (!chosen) throw new PasswordGenerationError("generation-failed");
    }
    return result;
  }
  return { size, unrank };
}
export function countPasswords(rules: ParsedRules, length: number): bigint {
  return passwordSpace(rules, length).size;
}
export function samplePassword(rules: ParsedRules, length: number, random: RandomIndex = cryptoRandomIndex): string {
  const space = passwordSpace(rules, length);
  return space.unrank(sampleBelow(space.size, random));
}
