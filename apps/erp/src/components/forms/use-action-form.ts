'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { toast } from 'sonner';
import type { ActionResult } from '@/server/actions/_helpers';

type ServerAction = (prev: unknown, fd: FormData) => Promise<ActionResult>;

export function useActionForm(action: ServerAction, successMsg = 'Guardado') {
  const [state, formAction] = useFormState<ActionResult, FormData>(
    async (prev, fd) => action(prev, fd),
    { ok: false, error: '' } as ActionResult,
  );

  useEffect(() => {
    if (state.ok && state.message !== '__shown__') {
      toast.success(successMsg);
    } else if (!state.ok && state.error) {
      toast.error(state.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { state, formAction };
}
