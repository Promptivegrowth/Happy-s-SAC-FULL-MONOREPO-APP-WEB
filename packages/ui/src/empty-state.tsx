import * as React from 'react';
import { cn } from './cn';

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed bg-white px-8 py-16 text-center', className)}>
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-happy-50 text-happy-600">{icon}</div>}
      <h3 className="font-display text-base font-semibold text-corp-900">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
