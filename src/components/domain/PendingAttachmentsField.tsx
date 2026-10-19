import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { CloseIcon } from '@/components/ui/icons';
import { UploadProgress } from '@/components/ui/UploadProgress';
import { ATTACHMENT_ACCEPT } from '@/components/domain/AttachmentsPanel';
import { LinkOrNoteForm } from '@/components/domain/LinkOrNoteForm';
import { errorMessage } from '@/lib/http';
import { filesService } from '@/services/files';
import { ATTACHMENTS_PER_RECORD, type PendingLink, type PendingText } from '@/types/domain';
import { formatBytes } from '@/utils/format';
import type { AttachmentCreateFields } from '@/services/attachments';

export interface PendingUpload {
  fileId: string;
  name: string;
  size: number;
}

/** Everything staged in a create form: files already uploaded, plus links and notes. */
export interface PendingAttachments {
  files: PendingUpload[];
  links: PendingLink[];
  texts: PendingText[];
}

export const NO_PENDING_ATTACHMENTS: PendingAttachments = { files: [], links: [], texts: [] };

/** What the create call takes. Files, links and notes share one limit of 20. */
export function pendingPayload(pending: PendingAttachments): AttachmentCreateFields {
  return {
    attachmentFileIds: pending.files.map((file) => file.fileId),
    attachmentLinks: pending.links,
    attachmentTexts: pending.texts,
  };
}

export function pendingCount(pending: PendingAttachments): number {
  return pending.files.length + pending.links.length + pending.texts.length;
}

/**
 * Files, links and notes picked in a create form. The record does not exist
 * yet, so each file is uploaded on selection and its id sent with the create
 * (`attachmentFileIds`); links and notes are only held here and sent as
 * `attachmentLinks` / `attachmentTexts`. The API writes the record and all of
 * them in one transaction. A file dropped from the list is simply not sent;
 * the nightly sweep removes unreferenced uploads.
 */
export function PendingAttachmentsField({
  companyId,
  value,
  onChange,
  onBusyChange,
  disabled = false,
}: {
  companyId: string;
  value: PendingAttachments;
  onChange: (next: PendingAttachments) => void;
  /** So the form can hold its submit while an upload is in flight. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  // Files in flight, keyed by position:name:size, with how far each has got (0–1).
  const [inFlight, setInFlight] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const used = pendingCount(value);
  const full = used >= ATTACHMENTS_PER_RECORD;

  const onFiles = async (picked: File[]) => {
    if (!picked.length) return;
    setError(null);

    const room = ATTACHMENTS_PER_RECORD - used;
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
    if (added.length) onChange({ ...value, files: [...value.files, ...added] });
    if (failures.length) setError(failures.join('\n'));
  };

  const remove = (patch: Partial<PendingAttachments>) => onChange({ ...value, ...patch });

  // One row shape for all three kinds, so the staged list reads like the saved one.
  const rows: Array<{ key: string; name: string; meta: string; onRemove: () => void }> = [
    ...value.files.map((item) => ({
      key: `file:${item.fileId}`,
      name: item.name,
      meta: formatBytes(item.size),
      onRemove: () => remove({ files: value.files.filter((other) => other.fileId !== item.fileId) }),
    })),
    ...value.links.map((item, index) => ({
      key: `link:${index}:${item.url}`,
      name: item.label || item.url,
      meta: item.label ? `Link · ${item.url}` : 'Link',
      onRemove: () => remove({ links: value.links.filter((_, at) => at !== index) }),
    })),
    ...value.texts.map((item, index) => ({
      key: `text:${index}`,
      name: item.label || truncate(item.text),
      meta: item.label ? `Note · ${truncate(item.text)}` : 'Note',
      onRemove: () => remove({ texts: value.texts.filter((_, at) => at !== index) }),
    })),
  ];

  return (
    <div className="field">
      <span className="field__label" id="pending-attachments-label">Attachments (optional)</span>
      <div className="stack-list" role="group" aria-labelledby="pending-attachments-label">
        {!full ? (
          <>
            <FileDropzone
              multiple
              label="Add files"
              accept={ATTACHMENT_ACCEPT}
              disabled={disabled}
              hint={`Up to ${ATTACHMENTS_PER_RECORD} files, links and notes together; 25 MB per file. They attach when you save.`}
              onFiles={(files) => void onFiles(files)}
            />
            <LinkOrNoteForm
              disabled={disabled}
              onAdd={(input) => {
                if ('url' in input) {
                  if (value.links.some((link) => link.url === input.url)) return true; // the same link twice is one link
                  onChange({ ...value, links: [...value.links, input] });
                } else {
                  onChange({ ...value, texts: [...value.texts, input] });
                }
                return true;
              }}
            />
          </>
        ) : (
          <p className="muted">The maximum of {ATTACHMENTS_PER_RECORD} attachments. Remove one to add another.</p>
        )}
        {Object.entries(inFlight).map(([key, fraction]) => (
          <UploadProgress key={key} name={key.split(':').slice(1, -1).join(':')} value={fraction > 0 ? fraction : null} />
        ))}
        {error ? <p className="error-box pre-wrap" role="alert">{error}</p> : null}
        {rows.length ? (
          <ul className="attachment-list">
            {rows.map((row) => (
              <li key={row.key} className="attachment-row">
                <div className="attachment-row__main">
                  <span>{row.name}</span>
                  <p className="muted">{row.meta}</p>
                </div>
                <div className="attachment-row__actions">
                  <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${row.name}`} disabled={disabled} onClick={row.onRemove}>
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

function truncate(value: string, max = 60): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
