import { describe, expect, it } from "vitest";
import { credentialSitesMatch } from "../src/credential-site.ts";

describe("credentialSitesMatch", () => {
  it.each([undefined, ["bank.test"], ["https://bank.test/login"], ["BANK.TEST"]])(
    "accepts compatible metadata %j",
    (sites) => {
      expect(credentialSitesMatch("bank.test", sites)).toBe(true);
    },
  );
  it.each([[], ["other.test"], ["bank.test.attacker.test"], [4], ["https://["], "bank.test", ["bank.test", 4]])(
    "rejects conflicting or malformed metadata %j",
    (sites) => {
      expect(credentialSitesMatch("bank.test", sites)).toBe(false);
    },
  );
});
