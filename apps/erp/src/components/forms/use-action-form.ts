'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ActionResult } from '@/server/actions/_helpers';

type ServerAction = (prev: unknown, fd: FormData) => Promise<ActionResult>;

/**
 * Wrapper estándar para formularios que llaman a server actions.
 *
 * - Muestra toast.success(successMsg) cuando la action retorna ok=true.
 * - Muestra toast.error(state.error) cuando ok=false.
 * - Si se pasa `redirectTo`, navega ahí client-side TRAS mostrar el toast
 *   (evita el patrón de redirect() server-side que interrumpe la actualización
 *   del state del useFormState y rompe el toast).
 *
 * Patrón recomendado: en el server action SOLO hacer bumpPaths(...) y dejar
 * que el cliente navegue con redirectTo.
 */
export function useActionForm(
  action: ServerAction,
  successMsg = 'Guardado',
  options?: {
    /** URL fija o función que recibe el state final y devuelve la URL (para ids dinámicos). */
    redirectTo?: string | ((state: ActionResult) => string | undefined);
  },
) {
  const router = useRouter();
  const navegado = useRef(false);
  const [state, formAction] = useFormState<ActionResult, FormData>(
    async (prev, fd) => action(prev, fd),
    { ok: false, error: '' } as ActionResult,
  );

  useEffect(() => {
    if (state.ok && state.message !== '__shown__') {
      toast.success(successMsg);
      if (options?.redirectTo && !navegado.current) {
        const url = typeof options.redirectTo === 'function'
          ? options.redirectTo(state)
          : options.redirectTo;
        if (url) {
          navegado.current = true;
          router.push(url);
        }
      }
    } else if (!state.ok && state.error) {
      toast.error(state.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { state, formAction };
}
