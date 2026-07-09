export function Spinner({ center = false }: { center?: boolean }) {
  return <span className={center ? 'state' : ''} role="status" aria-label="Loading"><span className="spinner" aria-hidden="true" /></span>;
}
