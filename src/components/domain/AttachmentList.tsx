import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/State';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ArrowUpRightIcon, CloseIcon } from '@/components/ui/icons';
import { filesService } from '@/services/files';
import { errorMessage } from '@/lib/http';
import type { StoredFile } from '@/types/domain';
import { formatBytes, formatDateTime } from '@/utils/format';

interface AttachmentLike {
  id: string;
  fileId: string;
  file?: StoredFile;
  createdAt?: string;
}

/**
 * Files attached to a task or a post, each one openable.
 *
 * Files live behind a signed download URL that is minted per request, so
 * "Open" asks for one and then follows it. The tab is opened *before* the
 * request — a `window.open` after an await is what popup blockers exist to
 * stop — and pointed at the URL once it arrives.
 */
export function AttachmentList({
  companyId,
  loading,
  error,
  data,
  onRetry,
  onRemove,
  removing,
  emptyText = 'No attachments.',
}: {
  companyId: string;
  loading: boolean;
  error: string | null;
  data: AttachmentLike[] | null;
  onRetry: () => void;
  /** Absent means the list is read-only. */
  onRemove?: (attachment: AttachmentLike) => void | Promise<void>;
  removing?: string | null;
  emptyText?: string;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const confirm = useConfirm();

  const open = async (attachment: AttachmentLike) => {
    setOpening(attachment.id);
    /*
      Open the tab synchronously, inside the click, so popup blockers allow
      it — then point it at the URL once it arrives. Not with the `noopener`
      feature string: Chrome returns null for that, which is how this used
      to fall through to the same tab. Severing `opener` by hand gives the
      same protection and keeps the handle.
    */
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await filesService.downloadUrl(companyId, attachment.fileId);
      if (tab && !tab.closed) tab.location.href = url;
      else window.open(url, '_blank');
    } catch (cause) {
      tab?.close();
      toast.error(errorMessage(cause));
    } finally {
      setOpening(null);
    }
  };

  if (loading) return <p className="muted">Loading attachments…</p>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data?.length) return <p className="muted">{emptyText}</p>;

  return (
    <ul className="attachment-list">
      {data.map((attachment) => {
        const name = attachment.file?.originalName ?? attachment.file?.filename ?? attachment.fileId;
        const meta = [formatBytes(attachment.file?.size), attachment.file?.mimeType, attachment.createdAt ? formatDateTime(attachment.createdAt) : '']
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={attachment.id} className="attachment-row">
            <div className="attachment-row__main">
              <button
                type="button"
                className="attachment-row__name"
                onClick={() => open(attachment)}
                disabled={opening === attachment.id}
                title="Open in a new tab"
              >
                {name}
              </button>
              {meta ? <p className="muted">{meta}</p> : null}
            </div>
            <div className="attachment-row__actions">
              <Button size="sm" variant="secondary" onClick={() => open(attachment)} loading={opening === attachment.id} aria-label={`Open ${name}`}>
                <ArrowUpRightIcon size={14} /> Open
              </Button>
              {onRemove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${name}`}
                  loading={removing === attachment.id}
                  disabled={removing !== null && removing !== undefined}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Remove attachment',
                      message: <>Remove <strong>{name}</strong>? The file stays in storage; only its link to this task is removed.</>,
                      confirmLabel: 'Remove',
                      tone: 'danger',
                    });
                    if (ok) void onRemove(attachment);
                  }}
                >
                  <CloseIcon size={14} />
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
