/*
  Brand colours are typed as hex in a text field and picked with the native
  colour input, which only accepts "#rrggbb" and silently shows black for
  anything else: "#abc", "C9144B", or a value half-typed. One normal form,
  "#rrggbb" in lower case, is what the picker takes, what the picker gives
  back, and what is saved; the API has always received a "#"-prefixed hex
  string, and the demo data already uses this form (N-14).
*/

const HEX_INPUT = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True for 3 or 6 hex digits, with or without a leading "#", in either case. Surrounding spaces are ignored. */
export function isHexColour(value: string | null | undefined): boolean {
  return HEX_INPUT.test((value ?? '').trim());
}

/** "#abc" -> "#aabbcc", "C9144B" -> "#c9144b"; null when the value is not a hex colour. */
export function normalizeHex(value: string | null | undefined): string | null {
  const match = HEX_INPUT.exec((value ?? '').trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`;
}
