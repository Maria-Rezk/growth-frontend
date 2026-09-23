import clsx from 'clsx';
import { Link, type LinkProps } from 'react-router-dom';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Single source of truth for button class composition. Shared by <Button>
 * and <ButtonLink> so a native button and a router link stay visually identical.
 */
export function buttonClass({ variant = 'primary', size = 'md' }: ButtonStyleProps = {}, className?: string) {
  return clsx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  loading?: boolean;
}

// forwardRef so a dialog can hand initial focus to its confirm button.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  // Defaults to "button", not the native element's own default of "submit".
  // Every button that *should* submit a form already says `type="submit"`
  // explicitly throughout this codebase — the native default only ever
  // matters for the button that forgot to say what it is, and inside a
  // <form> that forgetting means "Cancel" or "Remove" silently submits.
  { className, variant, size, loading, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="spinner spinner--small" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps, ButtonStyleProps {}

/**
 * Renders a router <Link> that looks like a button.
 *
 * Use this instead of <Link><Button /></Link> — nesting a <button> inside an
 * <a> is invalid HTML, breaks keyboard semantics and produces a double focus
 * stop for screen reader users.
 */
export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
