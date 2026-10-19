import { useId } from 'react';
import { Field, Input } from '@/components/ui/Fields';
import { CheckIcon } from '@/components/ui/icons';
import { TaskType, type Task } from '@/types/domain';
import { TASK_TYPE_OPTIONS, taskTypeChips } from '@/utils/taskTypes';

export const CUSTOM_TASK_TYPE_MAX = 120;

/**
 * One chip per type a task carries. `OTHER` reads as the text that was typed,
 * not the word "Other". A task with no type says so rather than showing a gap.
 */
export function TaskTypeChips({ task, showEmpty = true }: { task: Pick<Task, 'taskTypes' | 'customTaskType'>; showEmpty?: boolean }) {
  const chips = taskTypeChips(task);
  if (!chips.length) return showEmpty ? <span className="type-chips"><span className="type-chip type-chip--none">No type</span></span> : null;
  return (
    <span className="type-chips">
      {chips.map((label, index) => <span key={`${label}:${index}`} className="type-chip">{label}</span>)}
    </span>
  );
}

/**
 * The kinds of work a task covers: any number of the nine, with a text field
 * that appears only while "Other" is ticked.
 *
 * Toggle pills rather than a `<select multiple>`: what is chosen stays visible,
 * and each choice is one tap. Native checkboxes underneath, so keyboard and
 * screen readers get a plain group of checkboxes.
 */
export function TaskTypePicker({
  value,
  customValue,
  onChange,
  onCustomChange,
  error,
  customError,
  disabled = false,
  hint = 'Optional. Pick everything this task covers.',
}: {
  value: TaskType[];
  customValue: string;
  onChange: (next: TaskType[]) => void;
  onCustomChange: (next: string) => void;
  error?: string;
  customError?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const hasOther = value.includes(TaskType.OTHER);

  const toggle = (type: TaskType) => {
    onChange(value.includes(type) ? value.filter((held) => held !== type) : [...value, type]);
  };

  return (
    <div className="field">
      <fieldset className="type-picker" disabled={disabled} aria-describedby={`${id}-hint`}>
        <legend className="field__label">Type</legend>
        <div className="type-picker__options">
          {TASK_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="type-picker__option" htmlFor={`${id}-${option.value}`}>
              <input id={`${id}-${option.value}`} type="checkbox" checked={value.includes(option.value)} onChange={() => toggle(option.value)} />
              <CheckIcon size={12} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="field__hint" id={`${id}-hint`}>{hint}</p>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
      {hasOther ? (
        <div className="type-picker__custom">
          <Field label="What kind of work is it?" htmlFor={`${id}-custom`} error={customError}>
            <Input
              id={`${id}-custom`}
              placeholder="e.g. Event setup"
              value={customValue}
              maxLength={CUSTOM_TASK_TYPE_MAX}
              disabled={disabled}
              onChange={(event) => onCustomChange(event.target.value)}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
