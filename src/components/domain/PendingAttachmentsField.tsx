import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { CloseIcon } from '@/components/ui/icons';
import { UploadProgress } from '@/components/ui/UploadProgress';
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
  // Files in flight, keyed by position:name:size, with how far each has got (0–1).
  const [inFlight, setInFlight] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= ATTACHMENTS_PER_RECORD;

  const onFiles = async (picked: File[]) => {
    if (!picked.length) return;
    setError(null);

    const room = ATTACHMENTS_PER_RECORD - value.length;
    const files = picked.slice(0, room);
    if (picked.length > room) setError(`Only ${ATTACHMENTS_PER_RECORD} attachments per record — ${picked.length - room} not added.`);

    const keyOf = (file: File, index: number) => `${index}:${file.name}:${file.size}`;
    setInFlight((current) => ({ ...current, ...Object.fromEntries(files.map((file, index) => [keyOf(file, index), 0])) }));
    onBusyChange?.(true);
    const added: PendingUpload[] = [];
    const failures: string[] = [];
    await Promise.all(files.map(async (file, index) => {
      const key = keyOf(file, index);
      try {
        const stored = await filesService.upload(companyId, file, (fraction) => setInFlight((current) => (key in current ? { ...current, [key]: fraction } : current)));
        added.push({ fileId: stored.id, name: file.name, size: file.size });
      } catch (cause) {
        failures.push(errorMessage(cause));
      } finally {
        setInFlight((current) => {
          const { [key]: _done, ...rest } = current;
          return rest;
        });
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
        {Object.entries(inFlight).map(([key, fraction]) => (
          <UploadProgress key={key} name={key.split(':').slice(1, -1).join(':')} value={fraction > 0 ? fraction : null} />
        ))}
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
