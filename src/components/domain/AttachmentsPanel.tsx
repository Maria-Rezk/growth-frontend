import { useState } from 'react';
import toast from 'react-hot-toast';
import { AttachmentList } from '@/components/domain/AttachmentList';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Fields';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { attachmentsService, type AttachmentParent } from '@/services/attachments';
import { fileTooLargeError } from '@/services/files';
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_RECORD, isPlatformAdmin } from '@/types/domain';
import { formatBytes } from '@/utils/format';
import { canAddAttachment, canRemoveAttachment, getActiveRoles } from '@/utils/permissions';

/** What the upload picker accepts — the API refuses anything else at upload. */
export const ATTACHMENT_ACCEPT = [
  'image/*',
  '.pdf',
  '.doc,.docx,.xls,.xlsx,.ppt,.pptx',
  '.csv,.txt',
  '.mp4,.mov',
  '.zip',
].join(',');

const LABEL_EXAMPLES: Record<AttachmentParent['entityType'], string> = {
  TASK: 'Final export',
  POST: 'Carousel slide 3',
  LEAD: 'Signed proposal',
  CAMPAIGN: 'Media plan',
  BRAND_PROFILE: 'Logo pack',
};

/** Who may add and remove on this parent, from the signed-in person's roles on the client. */
export function useAttachmentAccess(companyId: string, entityType: AttachmentParent['entityType']) {
  const { user } = useAuth();
  const { memberships } = useCompany();
  const roles = getActiveRoles(memberships, companyId);
  const isAdmin = isPlatformAdmin(user?.platformRole);
  return {
    canAdd: canAddAttachment(roles, entityType, isAdmin),
    canRemove: (uploadedById: string) => canRemoveAttachment(roles, uploadedById, user?.id ?? null, isAdmin),
  };
}

/**
 * Attachments on one record: list, upload with an optional label, remove.
 * The same component for tasks, posts, campaigns, leads and the brand profile.
 */
export function AttachmentsPanel({
  companyId,
  parent,
  title = 'Attachments',
  subtitle,
  onChanged,
}: {
  companyId: string;
  parent: AttachmentParent;
  title?: string;
  subtitle?: string;
  /** Fired after an add or remove — e.g. to refresh a task's activity log. */
  onChanged?: () => void;
}) {
  const key = queryKeys.attachments(companyId, parent.entityType, parent.entityId);
  const access = useAttachmentAccess(companyId, parent.entityType);
  const list = useAsync(() => attachmentsService.list(companyId, parent), [companyId, parent.entityType, parent.entityId], { queryKey: key });
  const add = useMutation(attachmentsService.uploadAndAttach, { invalidateKeys: [key] });
  const remove = useMutation(attachmentsService.remove, { invalidateKeys: [key] });
  const [staged, setStaged] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const count = list.data?.length ?? 0;
  const full = count >= ATTACHMENTS_PER_RECORD;

  const [pickError, setPickError] = useState<string | null>(null);

  const stage = (file: File) => {
    add.reset();
    setLabel('');
    const tooLarge = fileTooLargeError(file);
    setPickError(tooLarge?.message ?? null);
    setStaged(tooLarge ? null : file);
  };

  const cancelStaged = () => {
    add.reset();
    setStaged(null);
    setLabel('');
  };

  const attach = async () => {
    if (!staged) return;
    const result = await add.mutate(companyId, parent, staged, label);
    if (result) {
      setStaged(null);
      setLabel('');
      toast.success(`Attached ${result.file.originalName ?? 'file'}.`);
      onChanged?.();
    }
  };

  const onRemove = async (attachmentId: string) => {
    setRemovingId(attachmentId);
    try {
      const done = await remove.mutate(companyId, parent, attachmentId);
      if (done !== null) onChanged?.();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="content-card">
      <CardHeader
        title={count ? `${title} (${count})` : title}
        subtitle={subtitle}
      />
      <div className="content-card__body stack-list">
        {access.canAdd ? (
          full ? (
            <p className="muted">This record holds the maximum of {ATTACHMENTS_PER_RECORD} attachments. Remove one to add another.</p>
          ) : staged ? (
            <div className="staged-file">
              <div>
                <p className="staged-file__name">{staged.name}</p>
                <p className="muted">{formatBytes(staged.size)}</p>
              </div>
              <Field label="Label (optional)" htmlFor={`attachment-label-${parent.entityType}`} hint="Shown next to the file name.">
                <Input
                  id={`attachment-label-${parent.entityType}`}
                  placeholder={`e.g. ${LABEL_EXAMPLES[parent.entityType]}`}
                  value={label}
                  maxLength={120}
                  disabled={add.loading}
                  autoFocus
                  onChange={(event) => setLabel(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void attach(); } }}
                />
              </Field>
              {add.error ? <p className="error-box" role="alert">{add.error}</p> : null}
              <div className="button-row">
                <Button size="sm" onClick={attach} loading={add.loading}>Attach</Button>
                <Button size="sm" variant="ghost" onClick={cancelStaged} disabled={add.loading}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <FileDropzone
                label="Add a file"
                accept={ATTACHMENT_ACCEPT}
                hint={`Up to ${formatBytes(ATTACHMENT_MAX_BYTES)}. Images, PDF, Office, CSV or text, MP4/MOV, ZIP.`}
                onFiles={([file]) => stage(file)}
              />
              {pickError ? <p className="error-box" role="alert">{pickError}</p> : null}
            </>
          )
        ) : null}

        <AttachmentList
          companyId={companyId}
          loading={list.loading}
          error={list.error}
          data={list.data}
          onRetry={list.refetch}
          onRemove={(attachment) => onRemove(attachment.id)}
          canRemove={(attachment) => access.canRemove(attachment.uploadedById)}
          removing={removingId}
        />
        {remove.error ? <p className="error-box" role="alert">{remove.error}</p> : null}
      </div>
    </Card>
  );
}
