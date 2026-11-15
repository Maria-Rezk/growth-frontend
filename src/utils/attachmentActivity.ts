import type { Attachment, AttachmentKind } from '@/types/domain';

/*
  The task activity row for an attachment, in words.

  What the API records (attachments.service, task-draft): `metadata` is
  `{ attachmentId, kind, fileId, url }` — the kind, but no file name and no
  label. So the name is read from the task's attachment list, which the task
  page already loads once: no request per row, and nothing guessed.

  - A FILE is named by its original file name, then its label.
  - A LINK or TEXT is named by its label only. The URL is never shown (it may
    be a private address) and neither is a note's text.
  - An attachment since deleted is no longer in the list, so its row falls back
    to the kind alone ("Link added"), or "Attachment added" when even the kind
    is missing — as on rows written before the kind was recorded.
  - A row that carries `originalName` or `label` itself (older rows) uses it.
*/

export type AttachmentActivityAction = 'ATTACHMENT_ADDED' | 'ATTACHMENT_REMOVED';

const KINDS: ReadonlySet<string> = new Set(['FILE', 'LINK', 'TEXT']);

const TITLES: Record<AttachmentActivityAction, Record<AttachmentKind | 'UNKNOWN', string>> = {
  ATTACHMENT_ADDED: { FILE: 'Attachment added', LINK: 'Link added', TEXT: 'Text attachment added', UNKNOWN: 'Attachment added' },
  ATTACHMENT_REMOVED: { FILE: 'Attachment removed', LINK: 'Link removed', TEXT: 'Text attachment removed', UNKNOWN: 'Attachment removed' },
};

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** The name an attachment shows under: a file's original name, else its label. Never a URL or a note's text. */
export function attachmentDisplayName(attachment: Pick<Attachment, 'kind' | 'label' | 'file'>): string | undefined {
  if (attachment.kind === 'FILE') return text(attachment.file?.originalName) ?? text(attachment.label);
  return text(attachment.label);
}

/** The attachment a log row is about, by its id, else (a file) by its file id. */
function findAttachment(meta: Record<string, unknown>, attachments: readonly Attachment[]): Attachment | undefined {
  const id = text(meta.attachmentId);
  const fileId = text(meta.fileId);
  return (id ? attachments.find((item) => item.id === id) : undefined)
    ?? (fileId ? attachments.find((item) => item.kind === 'FILE' && item.file?.id === fileId) : undefined);
}

/** "Attachment added: campaign-brief.pdf", "Link added: Design References", "Text attachment added: Client Feedback". */
export function attachmentActivityTitle(
  action: AttachmentActivityAction,
  metadata: Record<string, unknown> | undefined,
  attachments: readonly Attachment[] = [],
): string {
  const meta = metadata ?? {};
  const match = findAttachment(meta, attachments);
  const recordedKind = text(meta.kind);
  const kind = (match?.kind ?? (recordedKind && KINDS.has(recordedKind) ? recordedKind : 'UNKNOWN')) as AttachmentKind | 'UNKNOWN';
  const name = (match ? attachmentDisplayName(match) : undefined) ?? text(meta.originalName) ?? text(meta.label);
  const title = TITLES[action][kind];
  return name ? `${title}: ${name}` : title;
}
