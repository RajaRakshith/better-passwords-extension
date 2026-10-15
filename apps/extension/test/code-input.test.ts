import { describe, expect, it } from "vitest";
import { bindCodeInput, formatCode } from "../src/ui/code-input.ts";

describe("formatCode", () => {
  it.each([
    ["", "", ""],
    ["91", "91", "91"],
    ["916", "916", "916"],
    ["9163", "9163", "916 3"],
    ["916344", "916344", "916 344"],
    ["916 344", "916344", "916 344"],
    ["916 344", "916344", "916 344"],
    ["9a1-6344999", "916344", "916 344"],
  ])("%j → %j shown as %j", (raw, digits, display) => {
    expect(formatCode(raw)).toEqual({ digits, display });
  });
});

describe("bindCodeInput", () => {
  it("formats as the user types and reports the six digits", () => {
    const input = document.createElement("input");
    const codes: string[] = [];
    bindCodeInput(input, (code) => codes.push(code));
    input.value = "9163";
    input.dispatchEvent(new Event("input"));
    expect(input.value).toBe("916 3");
    input.value = "916 344";
    input.dispatchEvent(new Event("input"));
    expect(codes).toEqual(["916344"]);
  });
});
