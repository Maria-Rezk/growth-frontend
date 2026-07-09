import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export function FilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('filter-card filter-card--spread', className)} {...props} />;
}
