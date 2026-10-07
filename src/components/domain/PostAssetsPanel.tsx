import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ATTACHMENT_ACCEPT } from '@/components/domain/AttachmentsPanel';
import { AttachmentList } from '@/components/domain/AttachmentList';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Fields';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { UploadProgress } from '@/components/ui/UploadProgress';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { fileTooLargeError } from '@/services/files';
import { guessAssetType, postAssetsService } from '@/services/postAssets';
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_RECORD, PostAssetType, type Attachment, type PostAsset } from '@/types/domain';
import { formatBytes, humanize } from '@/utils/format';

const TYPE_HINT: Record<PostAssetType, string> = {
  DESIGN: 'The finished artwork the client will see.',
  REFERENCE: 'Inspiration or source material. Internal.',
  VIDEO: 'A cut of the reel or video.',
  THUMBNAIL: 'Cover image for a video or reel.',
  DOCUMENT: 'Briefs, scripts, anything that is not artwork.',
};

/** The shared list renders attachments; an asset is one with its type folded into the label. */
function asAttachment(asset: PostAsset): Attachment {
  const label = [humanize(asset.assetType), asset.label].filter(Boolean).join(' · ');
  return {
    id: asset.id,
    entityType: 'POST',
    entityId: asset.postId,
    label,
    uploadedById: asset.uploadedById ?? '',
    uploadedBy: asset.uploadedBy,
    createdAt: asset.createdAt,
    file: asset.file,
  };
}

/**
 * The deliverable files on a post — design, video, thumbnail — typed so a
 * reviewer can tell the finished artwork from a reference. Account Manager,
 * Designer and Social Media Manager only; the caller decides whether to mount
 * it, and the API decides who may delete. Plain attachments stay in their own panel, which the client can read.
 */
export function PostAssetsPanel({ companyId, postId }: { companyId: string; postId: string }) {
  const key = queryKeys.postAssets(companyId, postId);
  const list = useAsync(() => postAssetsService.list(companyId, postId), [companyId, postId], { queryKey: key });
  const add = useMutation(postAssetsService.uploadAndAdd, { invalidateKeys: [key] });
  const remove = useMutation(postAssetsService.remove, { invalidateKeys: [key] });

  const [staged, setStaged] = useState<File | null>(null);
  const [assetType, setAssetType] = useState<PostAssetType>(PostAssetType.DESIGN);
  const [label, setLabel] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const rows = useMemo(() => (list.data ?? []).map(asAttachment), [list.data]);
  const full = rows.length >= ATTACHMENTS_PER_RECORD;

  const stage = (file: File) => {
    add.reset();
    setLabel('');
    const tooLarge = fileTooLargeError(file);
    setPickError(tooLarge?.message ?? null);
    setStaged(tooLarge ? null : file);
    if (!tooLarge) setAssetType(guessAssetType(file));
  };

  const cancel = () => {
    add.reset();
    setStaged(null);
    setLabel('');
  };

  const attach = async () => {
    if (!staged) return;
    setProgress(null);
    const result = await add.mutate(companyId, postId, staged, assetType, label, setProgress);
    if (result) {
      cancel();
      toast.success(`Added ${result.file.originalName ?? 'file'} as ${humanize(result.assetType).toLowerCase()}.`);
    }
  };

  const onRemove = async (assetId: string) => {
    setRemovingId(assetId);
    try {
      await remove.mutate(companyId, postId, assetId);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="content-card">
      <CardHeader
        title={rows.length ? `Deliverables (${rows.length})` : 'Deliverables'}
        subtitle="Design, video and reference files for this post, each tagged by type."
      />
      <div className="content-card__body stack-list">
        {full ? (
          <p className="muted">This post holds the maximum of {ATTACHMENTS_PER_RECORD} files. Remove one to add another.</p>
        ) : staged ? (
          <div className="staged-file">
            <div>
              <p className="staged-file__name">{staged.name}</p>
              <p className="muted">{formatBytes(staged.size)}</p>
            </div>
            <Field label="Type" htmlFor="post-asset-type" hint={TYPE_HINT[assetType]}>
              <Select id="post-asset-type" value={assetType} disabled={add.loading} onChange={(event) => setAssetType(event.target.value as PostAssetType)}>
                {Object.values(PostAssetType).map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
              </Select>
            </Field>
            <Field label="Label (optional)" htmlFor="post-asset-label" hint="Shown next to the file name.">
              <Input
                id="post-asset-label"
                placeholder="e.g. Slide 3, final"
                value={label}
                maxLength={120}
                disabled={add.loading}
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void attach(); } }}
              />
            </Field>
            {add.loading ? <UploadProgress name={staged.name} value={progress} /> : null}
            {add.error ? <p className="error-box" role="alert">{add.error}</p> : null}
            <div className="button-row">
              <Button size="sm" onClick={attach} loading={add.loading}>Add deliverable</Button>
              <Button size="sm" variant="ghost" onClick={cancel} disabled={add.loading}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <FileDropzone
              label="Add a deliverable"
              accept={ATTACHMENT_ACCEPT}
              hint={`Up to ${formatBytes(ATTACHMENT_MAX_BYTES)}. You choose the type next.`}
              onFiles={([file]) => stage(file)}
            />
            {pickError ? <p className="error-box" role="alert">{pickError}</p> : null}
          </>
        )}

        <AttachmentList
          companyId={companyId}
          loading={list.loading}
          error={list.error}
          data={list.data ? rows : null}
          onRetry={list.refetch}
          onRemove={(attachment) => onRemove(attachment.id)}
          removing={removingId}
          emptyText="No deliverables yet."
        />
        {remove.error ? <p className="error-box" role="alert">{remove.error}</p> : null}
      </div>
    </Card>
  );
}
