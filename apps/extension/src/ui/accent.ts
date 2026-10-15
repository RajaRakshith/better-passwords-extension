// Matches the menu and popup highlight to the Mac's accent color.
//
// Browsers don't expose the accent itself (Chromium's `AccentColor` is a fixed blue), but they do
// expose the text selection color (`SelectedItem`), which macOS derives from the accent unless the
// user picked a separate highlight color. Its hue tells which of macOS's accents is in use.

type Rgb = [number, number, number];

/** macOS's accent colors (System Settings → Appearance), as NSColor.controlAccentColor draws them. */
const ACCENTS: { name: string; rgb: Rgb }[] = [
  { name: "blue", rgb: [0, 122, 255] },
  { name: "purple", rgb: [149, 61, 150] },
  { name: "pink", rgb: [247, 79, 158] },
  { name: "red", rgb: [224, 56, 62] },
  { name: "orange", rgb: [247, 130, 27] },
  { name: "yellow", rgb: [255, 199, 0] },
  { name: "green", rgb: [98, 186, 70] },
];
const GRAPHITE: Rgb = [140, 140, 140];

function hueAndSaturation([r, g, b]: Rgb): { hue: number; saturation: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta > 0) {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    if (max === rr) hue = 60 * (((gg - bb) / delta) % 6);
    else if (max === gg) hue = 60 * ((bb - rr) / delta + 2);
    else hue = 60 * ((rr - gg) / delta + 4);
  }
  return { hue: (hue + 360) % 360, saturation };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** The accent whose hue is closest to the selection color's; graphite for a grey selection. */
export function accentForSelection(selection: Rgb): Rgb {
  const { hue, saturation } = hueAndSaturation(selection);
  if (saturation < 0.12) return GRAPHITE;
  let best = ACCENTS[0] as (typeof ACCENTS)[number];
  for (const accent of ACCENTS) {
    if (hueDistance(hueAndSaturation(accent.rgb).hue, hue) < hueDistance(hueAndSaturation(best.rgb).hue, hue)) {
      best = accent;
    }
  }
  return best.rgb;
}

/** Text that stays readable on the accent: dark on yellow, white elsewhere. */
export function textOn([r, g, b]: Rgb): string {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.7 ? "#1d1d1f" : "#ffffff";
}

function parseRgb(color: string): Rgb | undefined {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/** Sets --accent and --accent-text from the Mac's accent, where the browser reveals it. */
export function applySystemAccent(root: HTMLElement = document.documentElement, retry = true): void {
  const probe = document.createElement("span");
  probe.style.color = "SelectedItem";
  if (!probe.style.color || !document.body) return;
  document.body.append(probe);
  const selection = parseRgb(getComputedStyle(probe).color);
  probe.remove();
  if (!selection) {
    // right after the browser starts, system colors can be a frame late
    if (retry) requestAnimationFrame(() => applySystemAccent(root, false));
    return;
  }
  const accent = accentForSelection(selection);
  root.style.setProperty("--accent", `rgb(${accent.join(" ")})`);
  root.style.setProperty("--accent-text", textOn(accent));
}
