import { describe, expect, it } from "vitest";
import { accentForSelection, textOn } from "../src/ui/accent.ts";

describe("accentForSelection", () => {
  it.each([
    ["blue (the default highlight)", [179, 215, 255], [0, 122, 255]],
    ["pink (seen on a Mac set to pink)", [253, 203, 226], [247, 79, 158]],
    ["orange", [255, 213, 172], [247, 130, 27]],
    ["green", [196, 233, 181], [98, 186, 70]],
    ["dark-mode pink", [128, 64, 95], [247, 79, 158]],
  ])("maps a %s selection to its accent", (_, selection, accent) => {
    expect(accentForSelection(selection as [number, number, number])).toEqual(accent);
  });

  it("treats a grey selection as graphite", () => {
    expect(accentForSelection([216, 216, 220])).toEqual([140, 140, 140]);
  });
});

describe("textOn", () => {
  it("uses dark text on yellow and white elsewhere", () => {
    expect(textOn([255, 199, 0])).toBe("#1d1d1f");
    expect(textOn([0, 122, 255])).toBe("#ffffff");
    expect(textOn([247, 79, 158])).toBe("#ffffff");
  });
});
