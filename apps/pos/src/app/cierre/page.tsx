import { redirect } from 'next/navigation';

/**
 * /cierre ya no tiene UI propia — el cierre vive como modal in-place en el
 * terminal de venta. Mantenemos la ruta como redirect para preservar bookmarks.
 */
export const dynamic = 'force-dynamic';

export default function CierrePage(): never {
  redirect('/venta');
}
