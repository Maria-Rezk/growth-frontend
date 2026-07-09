import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoFiles, makeId } from '@/services/demoStore';
import type { StoredFile } from '@/types/domain';

export const filesService = {
  async upload(companyId: string, file: File): Promise<StoredFile> {
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
  async downloadUrl(companyId: string, fileId: string): Promise<string> {
    if (env.demoMode) return demoDelay('#');
    const response = await http.get(apiRoutes.files.downloadUrl(companyId, fileId));
    const data = unwrap<{ url: string } | string>(response.data);
    return typeof data === 'string' ? data : data.url;
  },
};
