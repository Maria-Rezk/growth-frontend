import type { AttachmentCreateFields } from '@/services/attachments';
import type { PendingLink, PendingText } from '@/types/domain';

export interface PendingUpload {
  fileId: string;
  name: string;
  size: number;
}

/** Everything staged in a create form: files already uploaded, plus links and notes. */
export interface PendingAttachments {
  files: PendingUpload[];
  links: PendingLink[];
  texts: PendingText[];
}

export const NO_PENDING_ATTACHMENTS: PendingAttachments = { files: [], links: [], texts: [] };

/** What the create call takes. Files, links and notes share one limit of 20. */
export function pendingPayload(pending: PendingAttachments): AttachmentCreateFields {
  return {
    attachmentFileIds: pending.files.map((file) => file.fileId),
    attachmentLinks: pending.links,
    attachmentTexts: pending.texts,
  };
}

export function pendingCount(pending: PendingAttachments): number {
  return pending.files.length + pending.links.length + pending.texts.length;
}
