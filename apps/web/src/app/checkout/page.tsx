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

  /*
   * La tarjeta se ofrece solo si el servidor puede cobrarla.
   *
   * Se mira acá, en el servidor, porque las credenciales de izipay no se
   * exponen al navegador. Si faltara alguna, mostrar el botón llevaría al
   * comprador hasta el formulario para que recién ahí falle: mejor que la
   * opción ni aparezca.
   */
  const izipayHabilitado = Boolean(
    process.env.IZIPAY_USUARIO &&
      process.env.IZIPAY_PASSWORD &&
      process.env.IZIPAY_HMAC_KEY &&
      process.env.IZIPAY_PUBLIC_KEY,
  );

  return (
    <div className="container px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-semibold">Finaliza tu compra</h1>
      <CheckoutClient cuentasWeb={cuentasWeb} izipayHabilitado={izipayHabilitado} />
    </div>
  );
}
