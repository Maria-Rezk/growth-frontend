import { describe, expect, it } from 'vitest';
import type { Attachment } from '@/types/domain';
import { attachmentActivityTitle, attachmentDisplayName } from './attachmentActivity';

const base = { entityType: 'TASK', entityId: 't1', uploadedById: 'u1', url: null, text: null, label: null, file: null } as const;

const file: Attachment = { ...base, id: 'a-file', kind: 'FILE', file: { id: 'f-1', originalName: 'campaign-brief.pdf' } };
const link: Attachment = { ...base, id: 'a-link', kind: 'LINK', url: 'https://drive.example.com/private/abc?token=secret', label: 'Design References' };
const note: Attachment = { ...base, id: 'a-text', kind: 'TEXT', text: 'Private client feedback text', label: 'Client Feedback' };
const bareLink: Attachment = { ...base, id: 'a-bare', kind: 'LINK', url: 'https://example.com/x' };
const list = [file, link, note, bareLink];

/** The metadata the API writes on ATTACHMENT_ADDED / ATTACHMENT_REMOVED. */
const meta = (attachment: Attachment) => ({ attachmentId: attachment.id, kind: attachment.kind, fileId: attachment.file?.id ?? null, url: attachment.url });

describe('attachmentActivityTitle', () => {
  it('1. a file is named by its original file name', () => {
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', meta(file), list)).toBe('Attachment added: campaign-brief.pdf');
  });

  it('2. a link is named by its label, never its URL', () => {
    const title = attachmentActivityTitle('ATTACHMENT_ADDED', meta(link), list);
    expect(title).toBe('Link added: Design References');
    expect(title).not.toContain('http');
  });

  it('3. a text attachment is named by its label, never its contents', () => {
    const title = attachmentActivityTitle('ATTACHMENT_ADDED', meta(note), list);
    expect(title).toBe('Text attachment added: Client Feedback');
    expect(title).not.toContain('Private client feedback');
  });

  it('4. a link without a label says what it was, without the URL', () => {
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', meta(bareLink), list)).toBe('Link added');
  });

  it('5. a deleted attachment (no longer listed) falls back to its recorded kind', () => {
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', { attachmentId: 'gone', kind: 'FILE', fileId: 'f-gone', url: null }, list)).toBe('Attachment added');
    expect(attachmentActivityTitle('ATTACHMENT_REMOVED', { attachmentId: 'gone', kind: 'LINK', url: 'https://x.test' }, list)).toBe('Link removed');
    expect(attachmentActivityTitle('ATTACHMENT_REMOVED', { attachmentId: 'gone', kind: 'TEXT' }, list)).toBe('Text attachment removed');
  });

  it('6. a historical row without metadata reads "Attachment added"', () => {
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', undefined, list)).toBe('Attachment added');
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', {}, [])).toBe('Attachment added');
  });

  it('uses a name the row carries itself (older rows), and finds a file by its file id', () => {
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', { originalName: 'old-brief.docx' }, [])).toBe('Attachment added: old-brief.docx');
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', { fileId: 'f-1' }, list)).toBe('Attachment added: campaign-brief.pdf');
  });

  it('ignores an unknown recorded kind', () => {
    expect(attachmentActivityTitle('ATTACHMENT_ADDED', { attachmentId: 'gone', kind: 'VIDEO' }, list)).toBe('Attachment added');
  });
});

describe('attachmentDisplayName', () => {
  it('prefers a file’s original name over its label', () => {
    expect(attachmentDisplayName({ kind: 'FILE', label: 'Wireframe', file: { id: 'f', originalName: 'wire.pdf' } })).toBe('wire.pdf');
    expect(attachmentDisplayName({ kind: 'FILE', label: 'Wireframe', file: { id: 'f' } })).toBe('Wireframe');
  });
});
