import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoFiles, makeId } from '@/services/demoStore';
import { ATTACHMENT_MAX_BYTES, AttachmentErrorCode, type ApiErrorShape, type StoredFile } from '@/types/domain';
import { formatBytes } from '@/utils/format';

export type FileDisposition = 'inline' | 'attachment';

/** Same answer the API would give (422 FILE_TOO_LARGE), without spending the upload to hear it. */
export function fileTooLargeError(file: File): (Error & ApiErrorShape) | null {
  if (file.size <= ATTACHMENT_MAX_BYTES) return null;
  return Object.assign(
    new Error(`${file.name} is ${formatBytes(file.size)}. Files can be up to ${formatBytes(ATTACHMENT_MAX_BYTES)}.`),
    { statusCode: 422, code: AttachmentErrorCode.FILE_TOO_LARGE },
  );
}

export const filesService = {
  async upload(companyId: string, file: File): Promise<StoredFile> {
    const tooLarge = fileTooLargeError(file);
    if (tooLarge) throw tooLarge;

    if (env.demoMode) {
      const stored: StoredFile = {
        id: makeId('file'),
        companyId,
        originalName: file.name,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
      demoFiles.unshift(stored);
      return demoDelay(stored);
    }
    const formData = new FormData();
    formData.append('file', file);
    const response = await http.post(apiRoutes.files.upload(companyId), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap<StoredFile>(response.data);
  },
  async get(companyId: string, fileId: string): Promise<StoredFile> {
    if (env.demoMode) {
      const file = demoFiles.find((item) => item.companyId === companyId && item.id === fileId);
      if (!file) throw new Error('File not found.');
      return demoDelay(file);
    }
    const response = await http.get(apiRoutes.files.detail(companyId, fileId));
    return unwrap<StoredFile>(response.data);
  },
  /**
   * A signed URL, valid 15 minutes. `inline` makes images and PDFs open in the
   * tab; omitted, the browser downloads.
   */
  async downloadUrl(companyId: string, fileId: string, disposition?: FileDisposition): Promise<string> {
    if (env.demoMode) return demoDelay('#');
    const response = await http.get(apiRoutes.files.downloadUrl(companyId, fileId), {
      params: disposition === 'inline' ? { disposition } : undefined,
    });
    const data = unwrap<{ url: string } | string>(response.data);
    return typeof data === 'string' ? data : data.url;
  },
};
