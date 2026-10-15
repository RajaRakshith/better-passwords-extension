// The 6-digit pairing code, shown as two groups of three ("916 344"), like the code macOS displays.

/** The digits typed so far (at most six), and how to show them. */
export function formatCode(raw: string): { digits: string; display: string } {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return { digits, display: digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits };
}

/** Formats the field as the user types, and calls `onComplete` with the six digits. */
export function bindCodeInput(input: HTMLInputElement, onComplete: (code: string) => void): void {
  input.maxLength = 7;
  input.placeholder = "000 000";
  input.addEventListener("input", () => {
    const { digits, display } = formatCode(input.value);
    input.value = display;
    if (digits.length === 6) onComplete(digits);
  });
}
