import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { usePageTitle } from '@/hooks/usePageTitle';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card', className)} {...props} />;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="card__header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

/**
 * `back` is the way out of a detail page, always in the same place: a small
 * link above the title. Detail pages used to put it in the action slot as a
 * button with varying wording ("Back to posts", "All plans"), which on a
 * phone dropped below the subtitle.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: { to: string; label: string };
}) {
  usePageTitle(title);
  return (
    <div className="page-header">
      <div>
        {back ? (
          <Link to={back.to} className="page-header__back">
            <ArrowLeftIcon size={14} />
            {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </div>
  );
}
