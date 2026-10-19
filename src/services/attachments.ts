import { env } from '@/config/env';
import { apiRoutes, type AttachmentParent } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoAttachments, demoDelay, demoFiles, demoUser, makeId } from '@/services/demoStore';
import { filesService } from '@/services/files';
import { ATTACHMENTS_PER_RECORD, AttachmentErrorCode, type Attachment, type AttachmentInput, type PendingLink, type PendingText } from '@/types/domain';

export type { AttachmentParent } from '@/config/apiRoutes';

/** The three lists a create form can send beside the record's own fields. Together: at most 20. */
export interface AttachmentCreateFields {
  attachmentFileIds?: string[];
  attachmentLinks?: PendingLink[];
  attachmentTexts?: PendingText[];
}

/** Only the non-empty lists, so an untouched form sends nothing extra. */
export function attachmentFieldsForWire(fields: AttachmentCreateFields): AttachmentCreateFields {
  return {
    attachmentFileIds: fields.attachmentFileIds?.length ? fields.attachmentFileIds : undefined,
    attachmentLinks: fields.attachmentLinks?.length ? fields.attachmentLinks : undefined,
    attachmentTexts: fields.attachmentTexts?.length ? fields.attachmentTexts : undefined,
  };
}

/*
  The documented shape is the contract. The fallbacks cover a backend still
  serving the pre-migration task row ({ id, taskId, fileId, createdAt }) so a
  staggered deploy degrades to "file name unknown" rather than a crash.
*/
type RawAttachment = Partial<Attachment> & {
  id: string;
  fileId?: string;
  taskId?: string;
  file?: (Partial<NonNullable<Attachment['file']>> & { filename?: string }) | null;
};

export function normalizeAttachment(raw: RawAttachment, parent: AttachmentParent): Attachment {
  const fileId = raw.file?.id ?? raw.fileId ?? '';
  // A response from before links and notes existed has no `kind`: it was a file.
  const kind = raw.kind ?? (raw.url ? 'LINK' : raw.text ? 'TEXT' : 'FILE');
  return {
    id: raw.id,
    kind,
    entityType: raw.entityType ?? parent.entityType,
    entityId: raw.entityId ?? raw.taskId ?? parent.entityId ?? '',
    label: raw.label ?? null,
    url: raw.url ?? null,
    text: raw.text ?? null,
    uploadedById: raw.uploadedById ?? raw.uploadedBy?.id ?? '',
    uploadedBy: raw.uploadedBy ?? null,
    createdAt: raw.createdAt,
    // Null for a link or a note: read `kind` before touching it.
    file: kind === 'FILE' && (raw.file || fileId)
      ? {
          id: fileId,
          originalName: raw.file?.originalName ?? raw.file?.filename,
          mimeType: raw.file?.mimeType,
          size: raw.file?.size,
        }
      : null,
  };
}

function matchesParent(attachment: Attachment, parent: AttachmentParent) {
  if (attachment.entityType !== parent.entityType) return false;
  return parent.entityType === 'BRAND_PROFILE' || attachment.entityId === parent.entityId;
}

export const attachmentsService = {
  async list(companyId: string, parent: AttachmentParent): Promise<Attachment[]> {
    if (env.demoMode) return demoDelay(demoAttachments.filter((item) => matchesParent(item, parent)));
    const response = await http.get(apiRoutes.attachments.list(companyId, parent));
    const raw = unwrap<RawAttachment[]>(response.data);
    return (Array.isArray(raw) ? raw : []).map((item) => normalizeAttachment(item, parent));
  },

  /**
   * Attach a file, a link or a note: exactly one. A bare string is a file id.
   * Attaching a file or link already on the record returns the existing row.
   */
  async add(companyId: string, parent: AttachmentParent, input: string | AttachmentInput, label?: string): Promise<Attachment> {
    const body: AttachmentInput = typeof input === 'string' ? { fileId: input, label } : input;
    const cleanLabel = body.label?.trim() || undefined;
    if (env.demoMode) {
      const siblings = demoAttachments.filter((item) => matchesParent(item, parent));
      const existing = siblings.find((item) =>
        ('fileId' in body && item.file?.id === body.fileId) || ('url' in body && item.url === body.url));
      if (existing) return demoDelay(existing);
      if (siblings.length >= ATTACHMENTS_PER_RECORD) {
        throw Object.assign(new Error(`A record can hold up to ${ATTACHMENTS_PER_RECORD} attachments.`), { statusCode: 422, code: AttachmentErrorCode.ATTACHMENT_LIMIT });
      }
      const file = 'fileId' in body ? demoFiles.find((item) => item.id === body.fileId) : undefined;
      const attachment: Attachment = {
        id: makeId('attachment'),
        kind: 'fileId' in body ? 'FILE' : 'url' in body ? 'LINK' : 'TEXT',
        entityType: parent.entityType,
        entityId: parent.entityId ?? 'brand-profile',
        label: cleanLabel ?? null,
        url: 'url' in body ? body.url : null,
        text: 'text' in body ? body.text : null,
        uploadedById: demoUser.id,
        uploadedBy: { id: demoUser.id, fullName: demoUser.fullName },
        createdAt: new Date().toISOString(),
        file: 'fileId' in body ? { id: body.fileId, originalName: file?.originalName, mimeType: file?.mimeType, size: file?.size } : null,
      };
      demoAttachments.unshift(attachment);
      return demoDelay(attachment);
    }
    const response = await http.post(apiRoutes.attachments.list(companyId, parent), { ...body, label: cleanLabel });
    return normalizeAttachment(unwrap<RawAttachment>(response.data), parent);
  },

  /** Demo-only: what the API does in one transaction with a create. */
  async addAllDemo(companyId: string, parent: AttachmentParent, fields: AttachmentCreateFields): Promise<void> {
    for (const fileId of fields.attachmentFileIds ?? []) await attachmentsService.add(companyId, parent, { fileId });
    for (const link of fields.attachmentLinks ?? []) await attachmentsService.add(companyId, parent, link);
    for (const note of fields.attachmentTexts ?? []) await attachmentsService.add(companyId, parent, note);
  },

  async remove(companyId: string, parent: AttachmentParent, attachmentId: string): Promise<void> {
    if (env.demoMode) {
      const index = demoAttachments.findIndex((item) => item.id === attachmentId);
      if (index >= 0) demoAttachments.splice(index, 1);
      return demoDelay(undefined);
    }
    await http.delete(apiRoutes.attachments.detail(companyId, parent, attachmentId));
  },

  async uploadAndAttach(companyId: string, parent: AttachmentParent, file: File, label?: string, onProgress?: (fraction: number) => void): Promise<Attachment> {
    const stored = await filesService.upload(companyId, file, onProgress);
    return attachmentsService.add(companyId, parent, stored.id, label);
  },
};
