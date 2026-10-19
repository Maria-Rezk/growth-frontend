import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, buttonClass } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/State';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ArrowUpRightIcon, CloseIcon } from '@/components/ui/icons';
import { filesService } from '@/services/files';
import { errorMessage } from '@/lib/http';
import type { Attachment } from '@/types/domain';
import { formatBytes, formatDateTime } from '@/utils/format';

/**
 * What is attached to a record: files, links and notes, in one list. Read
 * `kind` first: `file` is null for a link or a note.
 *
 * Files live behind a signed URL minted per request, asked for with
 * `disposition=inline` so images and PDFs open in the tab instead of
 * downloading. The tab is opened *before* the request — a `window.open` after
 * an await is what popup blockers exist to stop — and pointed at the URL once
 * it arrives.
 */
export function AttachmentList({
  companyId,
  loading,
  error,
  data,
  onRetry,
  onRemove,
  canRemove,
  removing,
  emptyText = 'No attachments.',
}: {
  companyId: string;
  loading: boolean;
  error: string | null;
  data: Attachment[] | null;
  onRetry: () => void;
  /** Absent means the list is read-only. */
  onRemove?: (attachment: Attachment) => void | Promise<void>;
  /** Per-row gate for the remove button. Defaults to every row when `onRemove` is set. */
  canRemove?: (attachment: Attachment) => boolean;
  removing?: string | null;
  emptyText?: string;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const confirm = useConfirm();

  const open = async (attachment: Attachment) => {
    if (!attachment.file) return;
    const fileId = attachment.file.id;
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
      const url = await filesService.downloadUrl(companyId, fileId, 'inline');
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
        const kind = attachment.kind ?? 'FILE';
        const name = attachmentName(attachment);
        const meta = [
          kind === 'LINK' ? hostOf(attachment.url) : kind === 'TEXT' ? 'Note' : formatBytes(attachment.file?.size),
          attachment.uploadedBy?.fullName ? `by ${attachment.uploadedBy.fullName}` : '',
          attachment.createdAt ? formatDateTime(attachment.createdAt) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const removable = Boolean(onRemove) && (canRemove ? canRemove(attachment) : true);
        const href = kind === 'LINK' ? safeHref(attachment.url) : null;
        return (
          <li key={attachment.id} className={`attachment-row attachment-row--${kind.toLowerCase()}`}>
            <div className="attachment-row__main">
              {kind === 'LINK' ? (
                href ? (
                  <a className="attachment-row__name" href={href} target="_blank" rel="noopener noreferrer" title={attachment.url ?? undefined}>{name}</a>
                ) : (
                  <span className="attachment-row__name" title="This link is not a web address, so it is not clickable.">{name}</span>
                )
              ) : kind === 'TEXT' ? (
                <>
                  {attachment.label ? <strong className="attachment-row__title">{attachment.label}</strong> : null}
                  <NoteBody text={attachment.text ?? ''} />
                </>
              ) : (
                <button
                  type="button"
                  className="attachment-row__name"
                  onClick={() => open(attachment)}
                  disabled={opening === attachment.id}
                  title="Open in a new tab"
                >
                  {name}
                </button>
              )}
              {kind === 'FILE' && attachment.label ? <p className="muted">{attachment.label}</p> : null}
              {meta ? <p className="muted">{meta}</p> : null}
            </div>
            <div className="attachment-row__actions">
              {kind === 'FILE' ? (
                <Button size="sm" variant="secondary" onClick={() => open(attachment)} loading={opening === attachment.id} aria-label={`Open ${name}`}>
                  <ArrowUpRightIcon size={14} /> Open
                </Button>
              ) : null}
              {kind === 'LINK' && href ? (
                <a className={buttonClass({ variant: 'secondary', size: 'sm' })} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} in a new tab`}>
                  <ArrowUpRightIcon size={14} /> Open
                </a>
              ) : null}
              {removable && onRemove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${name}`}
                  loading={removing === attachment.id}
                  disabled={removing !== null && removing !== undefined}
                  onClick={async () => {
                    const ok = await confirm({
                      title: kind === 'FILE' ? 'Remove attachment' : kind === 'LINK' ? 'Remove link' : 'Remove note',
                      message: kind === 'FILE'
                        ? <>Remove <strong>{name}</strong> from this record? The file is kept while anything else still uses it.</>
                        : <>Remove <strong>{name}</strong> from this record?</>,
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

const NOTE_PREVIEW = 240;

/** A note, shown whole when short and folded behind "Show more" when long. */
function NoteBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > NOTE_PREVIEW;
  return (
    <>
      <p className="attachment-row__note pre-wrap">{long && !expanded ? `${text.slice(0, NOTE_PREVIEW).trimEnd()}…` : text}</p>
      {long ? (
        <button type="button" className="attachment-row__more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </>
  );
}

/** The label when there is one, else what the thing is: the file name, the link, the start of the note. */
function attachmentName(attachment: Attachment): string {
  switch (attachment.kind ?? 'FILE') {
    case 'LINK':
      return attachment.label || attachment.url || 'Link';
    case 'TEXT':
      return attachment.label || `${(attachment.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Note'}`;
    default:
      return attachment.file?.originalName ?? 'Untitled file';
  }
}

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Only http(s) is ever made clickable, whatever the server sent. */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
