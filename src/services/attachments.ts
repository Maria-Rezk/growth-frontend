import { env } from '@/config/env';
import { apiRoutes, type AttachmentParent } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoAttachments, demoDelay, demoFiles, demoUser, makeId } from '@/services/demoStore';
import { filesService } from '@/services/files';
import { ATTACHMENTS_PER_RECORD, AttachmentErrorCode, type Attachment } from '@/types/domain';

export type { AttachmentParent } from '@/config/apiRoutes';

/*
  The documented shape is the contract. The fallbacks cover a backend still
  serving the pre-migration task row ({ id, taskId, fileId, createdAt }) so a
  staggered deploy degrades to "file name unknown" rather than a crash.
*/
type RawAttachment = Partial<Attachment> & {
  id: string;
  fileId?: string;
  taskId?: string;
  file?: Partial<Attachment['file']> & { filename?: string };
};

export function normalizeAttachment(raw: RawAttachment, parent: AttachmentParent): Attachment {
  const fileId = raw.file?.id ?? raw.fileId ?? '';
  return {
    id: raw.id,
    entityType: raw.entityType ?? parent.entityType,
    entityId: raw.entityId ?? raw.taskId ?? parent.entityId ?? '',
    label: raw.label ?? null,
    uploadedById: raw.uploadedById ?? raw.uploadedBy?.id ?? '',
    uploadedBy: raw.uploadedBy ?? null,
    createdAt: raw.createdAt,
    file: {
      id: fileId,
      originalName: raw.file?.originalName ?? raw.file?.filename,
      mimeType: raw.file?.mimeType,
      size: raw.file?.size,
    },
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

  /** Attaching a file already on the record returns the existing row, not a duplicate. */
  async add(companyId: string, parent: AttachmentParent, fileId: string, label?: string): Promise<Attachment> {
    if (env.demoMode) {
      const existing = demoAttachments.find((item) => matchesParent(item, parent) && item.file.id === fileId);
      if (existing) return demoDelay(existing);
      if (demoAttachments.filter((item) => matchesParent(item, parent)).length >= ATTACHMENTS_PER_RECORD) {
        throw Object.assign(new Error(`A record can hold up to ${ATTACHMENTS_PER_RECORD} attachments.`), { statusCode: 422, code: AttachmentErrorCode.ATTACHMENT_LIMIT });
      }
      const file = demoFiles.find((item) => item.id === fileId);
      const attachment: Attachment = {
        id: makeId('attachment'),
        entityType: parent.entityType,
        entityId: parent.entityId ?? 'brand-profile',
        label: label?.trim() || null,
        uploadedById: demoUser.id,
        uploadedBy: { id: demoUser.id, fullName: demoUser.fullName },
        createdAt: new Date().toISOString(),
        file: { id: fileId, originalName: file?.originalName, mimeType: file?.mimeType, size: file?.size },
      };
      demoAttachments.unshift(attachment);
      return demoDelay(attachment);
    }
    const response = await http.post(apiRoutes.attachments.list(companyId, parent), {
      fileId,
      label: label?.trim() || undefined,
    });
    return normalizeAttachment(unwrap<RawAttachment>(response.data), parent);
  },

  async remove(companyId: string, parent: AttachmentParent, attachmentId: string): Promise<void> {
    if (env.demoMode) {
      const index = demoAttachments.findIndex((item) => item.id === attachmentId);
      if (index >= 0) demoAttachments.splice(index, 1);
      return demoDelay(undefined);
    }
    await http.delete(apiRoutes.attachments.detail(companyId, parent, attachmentId));
  },

  async uploadAndAttach(companyId: string, parent: AttachmentParent, file: File, label?: string): Promise<Attachment> {
    const stored = await filesService.upload(companyId, file);
    return attachmentsService.add(companyId, parent, stored.id, label);
  },
};
