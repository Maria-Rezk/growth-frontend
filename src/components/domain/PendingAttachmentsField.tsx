import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { CloseIcon } from '@/components/ui/icons';
import { ATTACHMENT_ACCEPT } from '@/components/domain/AttachmentsPanel';
import { errorMessage } from '@/lib/http';
import { filesService } from '@/services/files';
import { ATTACHMENTS_PER_RECORD } from '@/types/domain';
import { formatBytes } from '@/utils/format';

export interface PendingUpload {
  fileId: string;
  name: string;
  size: number;
}

/**
 * Files picked in a create form. The record does not exist yet, so each file
 * is uploaded on selection and its id sent with the create
 * (`attachmentFileIds`) — the API writes the record and its attachments in
 * one transaction. A file dropped from the list is simply not sent; the
 * nightly sweep removes unreferenced uploads.
 */
export function PendingAttachmentsField({
  companyId,
  value,
  onChange,
  onBusyChange,
  disabled = false,
}: {
  companyId: string;
  value: PendingUpload[];
  onChange: (next: PendingUpload[]) => void;
  /** So the form can hold its submit while an upload is in flight. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= ATTACHMENTS_PER_RECORD;

  const onFiles = async (picked: File[]) => {
    if (!picked.length) return;
    setError(null);

    const room = ATTACHMENTS_PER_RECORD - value.length;
    const files = picked.slice(0, room);
    if (picked.length > room) setError(`Only ${ATTACHMENTS_PER_RECORD} attachments per record — ${picked.length - room} not added.`);

    setUploading((count) => count + files.length);
    onBusyChange?.(true);
    const added: PendingUpload[] = [];
    const failures: string[] = [];
    await Promise.all(files.map(async (file) => {
      try {
        const stored = await filesService.upload(companyId, file);
        added.push({ fileId: stored.id, name: file.name, size: file.size });
      } catch (cause) {
        failures.push(errorMessage(cause));
      } finally {
        setUploading((count) => count - 1);
      }
    }));
    onBusyChange?.(false);
    if (added.length) onChange([...value, ...added]);
    if (failures.length) setError(failures.join('\n'));
  };

  return (
    <div className="field">
      <span className="field__label" id="pending-attachments-label">Attachments (optional)</span>
      <div className="stack-list" role="group" aria-labelledby="pending-attachments-label">
        {!full ? (
          <FileDropzone
            multiple
            label="Add files"
            accept={ATTACHMENT_ACCEPT}
            disabled={disabled}
            hint={`Up to ${ATTACHMENTS_PER_RECORD} files, 25 MB each. They attach when you save.`}
            onFiles={(files) => void onFiles(files)}
          />
        ) : null}
        {uploading > 0 ? <p className="muted" aria-live="polite">Uploading {uploading} file{uploading === 1 ? '' : 's'}…</p> : null}
        {error ? <p className="error-box pre-wrap" role="alert">{error}</p> : null}
        {value.length ? (
          <ul className="attachment-list">
            {value.map((item) => (
              <li key={item.fileId} className="attachment-row">
                <div className="attachment-row__main">
                  <span>{item.name}</span>
                  <p className="muted">{formatBytes(item.size)}</p>
                </div>
                <div className="attachment-row__actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${item.name}`}
                    disabled={disabled}
                    onClick={() => onChange(value.filter((other) => other.fileId !== item.fileId))}
                  >
                    <CloseIcon size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
