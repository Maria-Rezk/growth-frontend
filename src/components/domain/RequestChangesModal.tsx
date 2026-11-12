import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import type { Task } from '@/types/domain';
import { userLabel } from '@/utils/taskReview';

/** One person on a shared step, as the "Send back to" list shows them. */
export interface SendBackPerson {
  userId: string;
  name: string;
  role: string;
}

/**
 * "Send it back" needs a reason — the API refuses an empty note (422
 * REVIEW_NOTE_REQUIRED), and the note is what the assignee sees at the top of
 * the task while they rework it. A modal rather than an inline textarea so
 * the approve button never sits next to a half-written note.
 *
 * On a step with several people (`people`), the approver chooses who goes
 * back; everybody is ticked to start with. The others keep their submission
 * and wait. All ticked sends no `userIds` — the API's "everybody".
 */
export function RequestChangesModal({
  task,
  open,
  loading,
  error,
  onClose,
  onSubmit,
  people,
}: {
  task: Task | null;
  open: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (note: string, userIds?: string[]) => Promise<unknown>;
  /** The people on a shared step. Leave out for a one-person step or a task without steps. */
  people?: SendBackPerson[];
}) {
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const shared = (people?.length ?? 0) > 1;
  const peopleKey = (people ?? []).map((person) => person.userId).join(',');

  // A fresh note per task: the last reason must not leak onto the next one. Everybody ticked to start.
  useEffect(() => {
    if (!open) return;
    setNote('');
    setChosen(peopleKey ? peopleKey.split(',') : []);
  }, [open, task?.id, peopleKey]);

  const nobodyChosen = shared && chosen.length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim() || loading || nobodyChosen) return;
    const everybody = !shared || chosen.length === people?.length;
    await onSubmit(note, everybody ? undefined : chosen);
  };

  const toggle = (userId: string, on: boolean) =>
    setChosen((current) => (on ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)));

  return (
    <Modal
      open={open}
      title="Request changes"
      onClose={loading ? () => undefined : onClose}
      initialFocusRef={noteRef}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" form="request-changes-form" loading={loading} disabled={!note.trim() || nobodyChosen}>
            Send back
          </Button>
        </>
      }
    >
      {task && !shared ? (
        <p className="muted">
          <strong>{task.title}</strong> goes back to {userLabel(task.assignedTo, 'the assignee')} as In progress. They are notified with your note.
        </p>
      ) : null}
      {task && shared ? (
        <p className="muted">
          Choose who reworks <strong>{task.title}</strong>. They are notified with your note; the others keep their submission and wait.
        </p>
      ) : null}
      <form id="request-changes-form" className="form-grid" onSubmit={submit} noValidate>
        {shared ? (
          <fieldset className="checkbox-group">
            <legend className="field__label">Send back to</legend>
            {people?.map((person) => (
              <label key={person.userId} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={chosen.includes(person.userId)}
                  onChange={(event) => toggle(person.userId, event.target.checked)}
                />
                <span>{person.name} <span className="muted">· {person.role}</span></span>
              </label>
            ))}
            {nobodyChosen ? <p className="field__error" role="alert">Choose at least one person.</p> : null}
          </fieldset>
        ) : null}
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
