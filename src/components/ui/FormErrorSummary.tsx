import type { FieldErrors, FieldValues } from 'react-hook-form';

export function FormErrorSummary<T extends FieldValues>({ errors }: { errors: FieldErrors<T> }) {
  const messages = Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => typeof message === 'string');

  if (!messages.length) return null;

  return (
    <div className="error-box" role="alert" aria-live="polite">
      <strong>Please fix the highlighted fields.</strong>
      <ul className="error-list">
        {messages.map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  );
}
