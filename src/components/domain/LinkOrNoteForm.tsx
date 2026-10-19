import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Fields';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PlusIcon } from '@/components/ui/icons';
import { ATTACHMENT_LABEL_MAX, ATTACHMENT_TEXT_MAX, ATTACHMENT_URL_MAX, type AttachmentInput } from '@/types/domain';

type Mode = 'link' | 'text';

/** A full http(s) address, within the API's length limit. Returns the message to show, or null. */
export function linkError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Paste a link.';
  if (trimmed.length > ATTACHMENT_URL_MAX) return `A link can be up to ${ATTACHMENT_URL_MAX} characters.`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'The link must start with http:// or https://.';
  } catch {
    return 'That does not look like a full web address. Start it with https://.';
  }
  return null;
}

export function noteError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Write the note.';
  if (trimmed.length > ATTACHMENT_TEXT_MAX) return `A note can be up to ${ATTACHMENT_TEXT_MAX} characters.`;
  return null;
}

/**
 * The field beside the upload button: paste a link (a Drive folder, a
 * reference post) or write a note (a brief from WhatsApp). Both live in the
 * same list as files.
 *
 * Validation mirrors the API's limits so the common mistakes are caught before
 * a round trip; the API stays the authority and its message is shown by the
 * caller through `error`.
 */
export function LinkOrNoteForm({
  onAdd,
  busy = false,
  disabled = false,
  error,
  labelExample = 'Brief',
}: {
  /** Resolve `true` once added so the form clears; `false` keeps what was typed. */
  onAdd: (input: Extract<AttachmentInput, { url: string } | { text: string }>) => boolean | Promise<boolean>;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  labelExample?: string;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('link');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = async (event?: { preventDefault: () => void }) => {
    // Enter in a field must not submit the create form this sits inside.
    event?.preventDefault();
    const message = mode === 'link' ? linkError(value) : noteError(value);
    setInvalid(message);
    if (message) return;
    const cleanLabel = label.trim() || undefined;
    const added = await onAdd(mode === 'link' ? { url: value.trim(), label: cleanLabel } : { text: value.trim(), label: cleanLabel });
    if (added) {
      setValue('');
      setLabel('');
    }
  };

  // Not a nested <form>: this sits inside create forms, where that is invalid HTML.
  return (
    <div className="link-note" role="group" aria-label="Add a link or a note">
      <SegmentedControl<Mode>
        label="Attachment type"
        value={mode}
        onChange={(next) => { setMode(next); setValue(''); setInvalid(null); }}
        options={[{ label: 'Link', value: 'link' }, { label: 'Note', value: 'text' }]}
      />
      <Field
        label={mode === 'link' ? 'Link' : 'Note'}
        htmlFor={`${id}-value`}
        error={invalid ?? undefined}
        hint={mode === 'link' ? 'A Drive folder, a reference post, a shared doc.' : 'Paste a brief or message. Plain text.'}
      >
        {mode === 'link' ? (
          <Input
            id={`${id}-value`}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={value}
            maxLength={ATTACHMENT_URL_MAX}
            disabled={disabled || busy}
            onChange={(event) => { setValue(event.target.value); if (invalid) setInvalid(null); }}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(event); }}
          />
        ) : (
          <Textarea
            id={`${id}-value`}
            rows={3}
            placeholder="e.g. Client wants the logo bigger"
            value={value}
            maxLength={ATTACHMENT_TEXT_MAX}
            disabled={disabled || busy}
            onChange={(event) => { setValue(event.target.value); if (invalid) setInvalid(null); }}
          />
        )}
      </Field>
      <Field label="Label (optional)" htmlFor={`${id}-label`}>
        <Input
          id={`${id}-label`}
          placeholder={`e.g. ${labelExample}`}
          value={label}
          maxLength={ATTACHMENT_LABEL_MAX}
          disabled={disabled || busy}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void submit(event); }}
        />
      </Field>
      {mode === 'text' ? <p className="muted">{value.length} / {ATTACHMENT_TEXT_MAX}</p> : null}
      {error ? <p className="error-box" role="alert">{error}</p> : null}
      <div className="button-row">
        <Button type="button" size="sm" variant="secondary" onClick={() => void submit()} loading={busy} disabled={disabled || !value.trim()}>
          <PlusIcon size={14} /> {mode === 'link' ? 'Add link' : 'Add note'}
        </Button>
      </div>
    </div>
  );
}
