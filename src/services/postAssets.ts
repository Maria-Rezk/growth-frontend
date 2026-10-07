import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap, unwrapList } from '@/lib/http';
import { demoDelay, demoFiles, demoUser, makeId } from '@/services/demoStore';
import { filesService } from '@/services/files';
import { ATTACHMENTS_PER_RECORD, AttachmentErrorCode, PostAssetType, type PostAsset } from '@/types/domain';

type RawAsset = Partial<PostAsset> & {
  id: string;
  fileId?: string;
  type?: PostAssetType;
  file?: Partial<PostAsset['file']> & { filename?: string };
};

/** Tolerates `type` for `assetType` and a bare `fileId`: the row shape is not spelled out in the reference. */
export function normalizeAsset(raw: RawAsset, postId: string): PostAsset {
  return {
    id: raw.id,
    postId: raw.postId ?? postId,
    assetType: raw.assetType ?? raw.type ?? PostAssetType.DESIGN,
    label: raw.label ?? null,
    uploadedById: raw.uploadedById ?? raw.uploadedBy?.id,
    uploadedBy: raw.uploadedBy ?? null,
    createdAt: raw.createdAt,
    file: {
      id: raw.file?.id ?? raw.fileId ?? '',
      originalName: raw.file?.originalName ?? raw.file?.filename,
      mimeType: raw.file?.mimeType,
      size: raw.file?.size,
    },
  };
}

const demoAssets: PostAsset[] = [];

export const postAssetsService = {
  async list(companyId: string, postId: string): Promise<PostAsset[]> {
    if (env.demoMode) return demoDelay(demoAssets.filter((asset) => asset.postId === postId));
    const response = await http.get(apiRoutes.posts.assets(companyId, postId));
    return unwrapList<RawAsset>(response.data).map((asset) => normalizeAsset(asset, postId));
  },

  async add(companyId: string, postId: string, fileId: string, assetType: PostAssetType, label?: string): Promise<PostAsset> {
    if (env.demoMode) {
      if (demoAssets.filter((asset) => asset.postId === postId).length >= ATTACHMENTS_PER_RECORD) {
        throw Object.assign(new Error(`A record can hold up to ${ATTACHMENTS_PER_RECORD} attachments.`), { statusCode: 422, code: AttachmentErrorCode.ATTACHMENT_LIMIT });
      }
      const file = demoFiles.find((item) => item.id === fileId);
      const asset: PostAsset = {
        id: makeId('asset'),
        postId,
        assetType,
        label: label?.trim() || null,
        uploadedById: demoUser.id,
        uploadedBy: { id: demoUser.id, fullName: demoUser.fullName },
        createdAt: new Date().toISOString(),
        file: { id: fileId, originalName: file?.originalName, mimeType: file?.mimeType, size: file?.size },
      };
      demoAssets.unshift(asset);
      return demoDelay(asset);
    }
    const response = await http.post(apiRoutes.posts.assets(companyId, postId), {
      fileId,
      assetType,
      label: label?.trim() || undefined,
    });
    return normalizeAsset(unwrap<RawAsset>(response.data), postId);
  },

  async uploadAndAdd(companyId: string, postId: string, file: File, assetType: PostAssetType, label?: string, onProgress?: (fraction: number) => void): Promise<PostAsset> {
    const stored = await filesService.upload(companyId, file, onProgress);
    return postAssetsService.add(companyId, postId, stored.id, assetType, label);
  },

  async remove(companyId: string, postId: string, assetId: string): Promise<void> {
    if (env.demoMode) {
      const index = demoAssets.findIndex((asset) => asset.id === assetId);
      if (index >= 0) demoAssets.splice(index, 1);
      return demoDelay(undefined);
    }
    await http.delete(apiRoutes.posts.asset(companyId, postId, assetId));
  },
};

/** Best guess at a type from the file, so the common case is one fewer click. */
export function guessAssetType(file: Pick<File, 'type' | 'name'>): PostAssetType {
  if (file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name)) return PostAssetType.VIDEO;
  if (file.type.startsWith('image/')) return PostAssetType.DESIGN;
  return PostAssetType.DOCUMENT;
}
