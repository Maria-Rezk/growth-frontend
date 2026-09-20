import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import type { Task } from '@/types/domain';
import { userLabel } from '@/utils/taskReview';

/**
 * "Send it back" needs a reason — the API refuses an empty note (422
 * REVIEW_NOTE_REQUIRED), and the note is what the assignee sees at the top of
 * the task while they rework it. A modal rather than an inline textarea so
 * the approve button never sits next to a half-written note.
 */
export function RequestChangesModal({
  task,
  open,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  task: Task | null;
  open: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // A fresh note per task: the last reason must not leak onto the next one.
  useEffect(() => {
    if (open) setNote('');
  }, [open, task?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim() || loading) return;
    await onSubmit(note);
  };

  return (
    <Modal
      open={open}
      title="Request changes"
      onClose={loading ? () => undefined : onClose}
      initialFocusRef={noteRef}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" form="request-changes-form" loading={loading} disabled={!note.trim()}>
            Send back
          </Button>
        </>
      }
    >
      {task ? (
        <p className="muted">
          <strong>{task.title}</strong> goes back to {userLabel(task.assignedTo, 'the assignee')} as In progress. They are notified with your note.
        </p>
      ) : null}
      <form id="request-changes-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="What needs changing" htmlFor="request-changes-note" error={error ?? undefined} hint="Required. Be specific — this is the whole brief for the rework.">
          <Textarea
            ref={noteRef}
            id="request-changes-note"
            rows={4}
            value={note}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Tighten the headline and swap the second slide"
            aria-invalid={error ? true : undefined}
          />
        </Field>
      </form>
    </Modal>
  );
}
