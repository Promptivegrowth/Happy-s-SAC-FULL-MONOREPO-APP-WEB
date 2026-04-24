'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Loader2 } from 'lucide-react';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

export function FilterChip({
  href,
  active,
  variant = 'default',
  inactiveVariant = 'outline',
  className,
  children,
}: {
  href: string;
  active: boolean;
  variant?: Variant;
  inactiveVariant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go() {
    start(() => router.push(href, { scroll: false }));
  }

  return (
    <button type="button" onClick={go} className="inline-block cursor-pointer">
      <Badge
        variant={active ? variant : inactiveVariant}
        className={`gap-1 transition ${pending ? 'opacity-50' : ''} ${className ?? ''}`}
      >
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
        {children}
      </Badge>
    </button>
  );
}
