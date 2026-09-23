import clsx from 'clsx';
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const hintId = useId();
  const errorId = useId();

  /*
    The hint and error paragraphs get an id either way (for anything that
    wants to reference them), but a screen reader only treats them as
    *belonging to this field* if the input names them in aria-describedby.
    `error` already has `role="alert"` so it is announced regardless — this
    is what makes the hint (and a quieter path to the error) reachable too.

    Only done when `children` is exactly one element: the common case is a
    single <Input>/<Select>/<Textarea>, which happily forwards an extra prop
    through to the native element. A field with more than one control (a
    colour swatch plus its text input, a custom checklist) can't be described
    by a single id this way, so it's left as the caller wrote it rather than
    guessed at.
  */
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const control =
    describedBy && isValidElement<{ 'aria-describedby'?: string }>(children)
      ? cloneElement(children, {
          'aria-describedby': [children.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
        })
      : children;

  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {control}
      {hint ? <p className="field__hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={clsx('input', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={clsx('input', 'select', className)} {...props}>
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={clsx('input', 'textarea', className)} {...props} />;
  },
);