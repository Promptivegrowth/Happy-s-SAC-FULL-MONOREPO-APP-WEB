import * as React from 'react';
import { cn } from './cn';

type Props = {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
};

export function FormRow({ label, required, error, hint, children, className, htmlFor }: Props) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium uppercase tracking-wide text-corp-700">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function FormGrid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-4',
        cols === 1 && 'sm:grid-cols-1',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-white p-6 shadow-soft', className)}>
      <header className="mb-5">
        <h2 className="font-display text-base font-semibold text-corp-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
