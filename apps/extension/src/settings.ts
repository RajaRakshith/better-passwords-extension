import { DEFAULT_SETTINGS, type Settings } from "./messages.ts";

const TIMEOUTS = new Set([0, 5, 15, 30, 60]);
function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function valid(key: string, value: unknown): boolean {
  return (
    Object.hasOwn(DEFAULT_SETTINGS, key) &&
    (key === "idleTimeoutMinutes" ? typeof value === "number" && TIMEOUTS.has(value) : typeof value === "boolean")
  );
}

export function normalizeSettings(raw: unknown): Settings {
  const result = { ...DEFAULT_SETTINGS };
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (valid(key, value)) Object.assign(result, { [key]: value });
    }
  }
  return result;
}

export function validateSettingsChanges(raw: unknown): Partial<Settings> {
  if (!isRecord(raw)) throw new Error("Invalid settings.");
  for (const [key, value] of Object.entries(raw)) {
    if (!valid(key, value)) throw new Error("Invalid settings value.");
  }
  return { ...raw };
}
