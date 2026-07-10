import { CheckoutClient } from './checkout-client';
import { createClient } from '@happy/db/server';

export const metadata = { title: 'Checkout' };
export const dynamic = 'force-dynamic';

type CuentaWeb = {
  id: string;
  nombre_corto: string;
  banco: string | null;
  titular: string | null;
  numero_cuenta: string | null;
  numero_cci: string | null;
  numero_telefono: string | null;
  notas: string | null;
};

export default async function CheckoutPage() {
  const sb = await createClient();
  // Cuentas marcadas visible_web=true (mig 62). Por defecto la única visible
  // en web es YAPE/PLIN al 915109463. RLS 'cuentas_bancarias_web_publico'
  // permite lectura anónima con visible_web + activo = true.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data } = await sbAny
    .from('cuentas_bancarias')
    .select('id, nombre_corto, banco, titular, numero_cuenta, numero_cci, numero_telefono, notas')
    .eq('activo', true)
    .eq('visible_web', true)
    .order('orden');
  const cuentasWeb = (data ?? []) as CuentaWeb[];

  return (
    <div className="container px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-semibold">Finaliza tu compra</h1>
      <CheckoutClient cuentasWeb={cuentasWeb} />
    </div>
  );
}
