import { PosTerminal } from './pos-terminal';
import { createClient } from '@happy/db/server';

export const metadata = { title: 'Venta — POS' };
export const dynamic = 'force-dynamic';

export default async function VentaPage() {
  const sb = await createClient();
  const [{ data: variantes }, { data: cajas }] = await Promise.all([
    sb.from('productos_variantes')
      .select('id, sku, codigo_barras, talla, precio_publico, productos(id, nombre, codigo, imagen_principal_url)')
      .eq('activo', true)
      .limit(500),
    sb.from('cajas').select('id, codigo, nombre, almacen_id').eq('activo', true),
  ]);

  return (
    <PosTerminal
      variantes={(variantes ?? []) as unknown as Parameters<typeof PosTerminal>[0]['variantes']}
      cajas={(cajas ?? []) as unknown as Parameters<typeof PosTerminal>[0]['cajas']}
    />
  );
}
