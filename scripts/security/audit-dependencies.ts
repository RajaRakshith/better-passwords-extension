import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import JSON5 from "json5";

export interface AdvisoryMatch {
  name: string;
  versions: string[];
  id: number;
  severity: string;
  vulnerableRange: string;
  url: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function lockedNpmVersions(lockText: string): Record<string, string[]> {
  const lock: unknown = JSON5.parse(lockText);
  if (!record(lock) || !record(lock.packages)) throw new Error("Invalid Bun lockfile packages");
  const packages: Record<string, Set<string>> = {};
  for (const entry of Object.values(lock.packages)) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") throw new Error("Invalid lockfile package entry");
    const match = /^(@?[^@]+)@(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(entry[0]);
    if (!match?.[1] || !match[2]) continue;
    packages[match[1]] ??= new Set();
    packages[match[1]].add(match[2]);
  }
  return Object.fromEntries(
    Object.entries(packages)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, versions]) => [name, [...versions].sort()]),
  );
}

export async function auditDependencies(
  packages: Record<string, string[]>,
  fetchImpl: typeof fetch = fetch,
): Promise<AdvisoryMatch[]> {
  const response = await fetchImpl("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(packages),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Advisory service failed: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!record(body)) throw new Error("Invalid advisory response");
  const matches: AdvisoryMatch[] = [];
  const seen = new Set<string>();
  for (const [name, advisories] of Object.entries(body)) {
    if (!packages[name] || !Array.isArray(advisories)) throw new Error("Unexpected advisory package");
    for (const item of advisories) {
      if (
        !record(item) ||
        typeof item.id !== "number" ||
        typeof item.severity !== "string" ||
        typeof item.vulnerable_versions !== "string" ||
        typeof item.url !== "string"
      ) {
        throw new Error("Invalid advisory record");
      }
      const key = `${name}:${item.id}:${item.vulnerable_versions}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        name,
        versions: packages[name],
        id: item.id,
        severity: item.severity,
        vulnerableRange: item.vulnerable_versions,
        url: item.url,
      });
    }
  }
  return matches;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const packages = lockedNpmVersions(await readFile("bun.lock", "utf8"));
    const matches = await auditDependencies(packages);
    console.log(
      JSON.stringify({ checkedAt: new Date().toISOString(), packages: Object.keys(packages).length, matches }, null, 2),
    );
    if (process.argv.includes("--check") && matches.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Dependency scan failed");
    process.exitCode = 2;
  }
}
