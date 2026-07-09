import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { ApiErrorShape } from '@/types/domain';

export function applyServerFieldErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown) {
  const fieldErrors = (error as ApiErrorShape | undefined)?.fieldErrors;
  if (!fieldErrors) return;
  Object.entries(fieldErrors).forEach(([field, message]) => {
    form.setError(field as Path<T>, { type: 'server', message });
  });
}
