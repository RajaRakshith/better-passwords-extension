import { describe, expect, it } from "vitest";
import { auditDependencies, lockedNpmVersions } from "./audit-dependencies.ts";

describe("lockedNpmVersions", () => {
  it("retains every exact npm version and excludes workspace references", () => {
    expect(
      lockedNpmVersions(`{
      // a lockfile comment
      packages: {
        undici: ["undici@7.30.0", "", {}],
        "parent/undici": ["undici@6.29.0", "", {}],
        "other/undici": ["undici@6.29.0", "", {}],
        app: ["app@workspace:packages/app"],
        "@scope/pkg": ["@scope/pkg@1.2.3", "", {}],
      },
    }`),
    ).toEqual({ "@scope/pkg": ["1.2.3"], undici: ["6.29.0", "7.30.0"] });
  });

  it.each(["{", "{}", '{"packages":[]}', '{"packages":{"x":[]}}'])("refuses an invalid lockfile: %s", (input) => {
    expect(() => lockedNpmVersions(input)).toThrow();
  });
});

describe("auditDependencies", () => {
  it("returns advisory evidence for the exact submitted versions", async () => {
    const fakeFetch = (async (_url: unknown, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ undici: ["7.30.0"] });
      return Response.json({
        undici: [
          { id: 123, severity: "high", vulnerable_versions: "<7.30.1", url: "https://github.com/advisories/test" },
        ],
      });
    }) as typeof fetch;
    expect(await auditDependencies({ undici: ["7.30.0"] }, fakeFetch)).toEqual([
      {
        name: "undici",
        versions: ["7.30.0"],
        id: 123,
        severity: "high",
        vulnerableRange: "<7.30.1",
        url: "https://github.com/advisories/test",
      },
    ]);
  });

  it("reports a successful empty scan", async () => {
    expect(await auditDependencies({}, (async () => Response.json({})) as typeof fetch)).toEqual([]);
  });

  it.each([new Response("", { status: 503 }), Response.json([]), Response.json({ x: [{}] }), new Response("bad json")])(
    "never mistakes a failed or malformed scan for no vulnerabilities",
    async (response) => {
      await expect(auditDependencies({ x: ["1.0.0"] }, (async () => response) as typeof fetch)).rejects.toThrow();
    },
  );
});
