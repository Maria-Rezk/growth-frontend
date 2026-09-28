import { useId, useRef, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { PlusIcon } from '@/components/ui/icons';

/**
 * Pick or drop files. A real button (keyboard, focus ring, screen readers)
 * over a hidden native input, so the browser's grey "Choose File" widget never
 * shows in the themed UI.
 */
export function FileDropzone({
  onFiles,
  multiple = false,
  accept,
  disabled = false,
  label,
  hint,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  /** Button text, e.g. "Add a file". */
  label: string;
  /** One line under it: limits, accepted types. */
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length && !disabled) onFiles(multiple ? files : files.slice(0, 1));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files);
  };

  return (
    <div
      className={clsx('dropzone', dragging && 'dropzone--active', disabled && 'dropzone--disabled')}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
      >
        <PlusIcon size={14} /> {label}
      </button>
      <span className="dropzone__or" aria-hidden="true">or drop {multiple ? 'files' : 'a file'} here</span>
      {hint ? <p id={hintId} className="dropzone__hint">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={(event) => { take(event.target.files); event.target.value = ''; }}
      />
    </div>
  );
}
