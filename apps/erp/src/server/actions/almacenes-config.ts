'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';
import { requireRol } from '@/server/session';

const schema = z.object({
  id: z.string().uuid(),
  stock_minimo_default: z.coerce.number().int().min(0).max(10000),
});

/**
 * Actualiza el umbral de stock mínimo por almacén (mig 53). Este umbral se
 * usa en /inventario para colorear "stock bajo" y en /inventario/alertas
 * para generar la lista de alertas por almacén. 0 = no alerta.
 * Solo gerente.
 */
export async function actualizarUmbralAlmacen(input: z.input<typeof schema>) {
  await requireRol('gerente');
  const data = schema.parse(input);
  const sb = await createClient();
  const { error } = await (sb as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from('almacenes')
    .update({ stock_minimo_default: data.stock_minimo_default })
    .eq('id', data.id);
  if (error) throw new Error(error.message);
  revalidatePath('/configuracion/almacenes');
  revalidatePath('/inventario');
  revalidatePath('/inventario/alertas');
}
