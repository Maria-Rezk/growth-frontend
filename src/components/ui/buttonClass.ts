import clsx from 'clsx';

/** `danger-quiet`: a destructive action that must not compete with the primary one beside it. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet';
export type ButtonSize = 'sm' | 'md';

export interface ButtonStyleProps {
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
