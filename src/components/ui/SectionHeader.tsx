import type { ReactNode } from 'react';

/**
 * Heading for a section inside a page (below the PageHeader level).
 *
 * `eyebrow` is intentionally understated — a small uppercase category label,
 * not a decorative accent. Prefer omitting it unless the section genuinely
 * needs a category above the title.
 */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="button-row">{action}</div> : null}
    </div>
  );
}
