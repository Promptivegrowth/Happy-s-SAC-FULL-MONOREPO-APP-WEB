'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@happy/ui/button';
import { Loader2 } from 'lucide-react';

export function SubmitButton({ children = 'Guardar', ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? 'Guardando…' : children}
    </Button>
  );
}
