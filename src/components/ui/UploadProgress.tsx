/**
 * Progress for a file on its way to storage.
 *
 * A native <progress> so assistive tech reads "name, 42 percent" without any
 * ARIA of our own. `value` is 0–1; `null` while the first bytes have not left
 * yet, which renders the indeterminate state rather than a misleading 0%.
 */
export function UploadProgress({ name, value }: { name: string; value: number | null }) {
  const percent = value === null ? null : Math.min(100, Math.round(value * 100));
  return (
    <div className="upload-progress" aria-live="polite">
      <div className="upload-progress__label">
        <span className="upload-progress__name">{name}</span>
        <span className="muted">{percent === null ? 'Starting…' : percent >= 100 ? 'Finishing…' : `${percent}%`}</span>
      </div>
      <progress className="upload-progress__bar" max={100} value={percent ?? undefined} aria-label={`Uploading ${name}`} />
    </div>
  );
}
