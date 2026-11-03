import { ATTACHMENT_TEXT_MAX, ATTACHMENT_URL_MAX } from '@/types/domain';

/** A full http(s) address, within the API's length limit. Returns the message to show, or null. */
export function linkError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Paste a link.';
  if (trimmed.length > ATTACHMENT_URL_MAX) return `A link can be up to ${ATTACHMENT_URL_MAX} characters.`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'The link must start with http:// or https://.';
  } catch {
    return 'That does not look like a full web address. Start it with https://.';
  }
  return null;
}

/** A note with something in it, within the API's length limit. Returns the message to show, or null. */
export function noteError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Write the note.';
  if (trimmed.length > ATTACHMENT_TEXT_MAX) return `A note can be up to ${ATTACHMENT_TEXT_MAX} characters.`;
  return null;
}
