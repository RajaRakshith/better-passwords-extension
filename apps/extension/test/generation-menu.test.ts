import { describe, expect, it } from "vitest";
import { passwordSuggestions } from "../src/passwords/suggestions.ts";
import { generationRows } from "../src/ui/generation-rows.ts";

describe("generation menu", () => {
  it("shows readable errors without a Strong Password button for weak rules", () => {
    const view = document.createElement("div");
    view.append(
      ...generationRows(
        passwordSuggestions({ passwordRules: "allowed: [a]; maxlength: 1" }),
        () => {},
        () => true,
      ),
    );
    expect(view.querySelector("button")).toBeNull();
    expect(view.textContent).toContain("restrictions prevent a strong password");
  });
  it("selects only a successful style and keeps manual input untouched", () => {
    const input = document.createElement("input");
    input.value = "my-manual-entry";
    const view = document.createElement("div");
    view.append(input);
    const choices: string[] = [];
    view.append(
      ...generationRows(
        { strong: "test-secret", errors: { alphanumeric: "Symbols are required." } },
        (style) => choices.push(style),
        () => true,
      ),
    );
    (view.querySelector("button") as HTMLButtonElement).click();
    expect(choices).toEqual(["strong"]);
    expect(view.textContent).toContain("Symbols are required.");
    expect(view.textContent).not.toContain("test-secret");
    expect(input.value).toBe("my-manual-entry");
  });
  it("preserves the deliberate-click guard on successful suggestions", () => {
    const choices: string[] = [];
    const rows = generationRows(
      { strong: "test-secret" },
      (style) => choices.push(style),
      () => false,
    );
    (rows[0] as HTMLButtonElement).click();
    expect(choices).toEqual([]);
  });
});
