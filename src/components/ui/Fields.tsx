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

/*
  Required and optional fields, one convention everywhere:

  - An optional field says so in its label: "Phone (optional)".
  - A required field has no visual marker, but tells assistive technology
    with aria-required. (Not the native `required`: forms validate with
    their own schema and messages, under noValidate.)
  - A form whose fields are all required shows no markers at all.

  Which fields are which comes from each form's own validation schema; this
  changes how that is shown, never what is required.
*/

/** The "(optional)" suffix for a label or a group's legend. */
export function OptionalMark() {
  return <span className="field__optional"> (optional)</span>;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional = false,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  /** Shown as "(optional)" after the label. */
  optional?: boolean;
  /** Not shown; exposed as aria-required on the control. */
  required?: boolean;
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
    (describedBy || required) && isValidElement<{ 'aria-describedby'?: string; 'aria-required'?: boolean }>(children)
      ? cloneElement(children, {
          'aria-describedby': [children.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
          ...(required ? { 'aria-required': true } : {}),
        })
      : children;

  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {optional ? <OptionalMark /> : null}
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
/**
 * "Show password" for one or more password fields: a labelled checkbox that
 * switches them between hidden and plain text. A checkbox rather than an
 * eye icon so it has a visible label, a real checked state for assistive
 * technology, and Space to toggle; it does not move focus out of the form,
 * and Enter in a password field still submits. `controls` names the fields
 * it reveals (aria-controls).
 */
export function ShowPasswordToggle({
  checked,
  onChange,
  controls,
  label = 'Show password',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  controls: string;
  label?: string;
}) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-controls={controls} />
      <span>{label}</span>
    </label>
  );
}
