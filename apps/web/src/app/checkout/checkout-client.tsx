'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  useCart,
  precioEfectivoLinea,
  escalonPorTotalItems,
} from '@/store/cart';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { CreditCard, MessageCircle, Smartphone, Truck, Building2, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { buildPedidoWaMessage, buildWhatsappUrl } from '@happy/lib/whatsapp';
import { formatTallaChip } from '@happy/lib';
import { ENVIO_GRATIS_DESDE, COSTO_ENVIO_DEFECTO, costoEnvio, type DestinoEnvio } from '@/lib/precios';

type Metodo = 'yape' | 'plin' | 'izipay_card' | 'transferencia' | 'whatsapp';

/*
 * Cliente pidió (post-2026-07-08): solo WhatsApp estaba habilitado. Desde el
 * 15/09/2026 se suma la tarjeta por izipay, que se habilita sola cuando el
 * servidor tiene cargadas las credenciales (prop `izipayHabilitado`): así la
 * opción no aparece si todavía no se puede cobrar.
 *
 * Yape, Plin y transferencia decían "Próximamente" desde julio, esperando que
 * izipay los ofreciera. No los ofrece: consultada su API el 20/09/2026, la
 * tienda tiene habilitadas solo tarjetas, y el Yape web de izipay va por otro
 * SDK distinto al que está integrado. Mientras tanto la franja de arriba los
 * anunciaba igual, así que el comprador llegaba hasta el final para encontrarse
 * con que no estaban.
 *
 * Desde el 21/09/2026 sí se pueden elegir, y van por WhatsApp: el comprador
 * paga desde su app y manda la captura. No es un cobro automático, pero es lo
 * que la tienda ya hace todos los días por teléfono — con la diferencia de que
 * ahora el pedido, el monto y el número adonde pagar viajan escritos y no hay
 * que dictarlos.
 */
const metodosDisponibles = (tarjeta: boolean): { id: Metodo; label: string; descripcion: string; icon: React.ReactNode; habilitado: boolean }[] => [
  { id: 'izipay_card',   label: 'Tarjeta',        descripcion: tarjeta ? 'Crédito o débito · pago al instante' : 'Próximamente', icon: <CreditCard className="h-5 w-5 text-emerald-600" />, habilitado: tarjeta },
  { id: 'yape',          label: 'Yape',           descripcion: 'Pagas y envías la captura por WhatsApp', icon: <Smartphone className="h-5 w-5 text-purple-600" />,     habilitado: true },
  { id: 'plin',          label: 'Plin',           descripcion: 'Pagas y envías la captura por WhatsApp', icon: <Smartphone className="h-5 w-5 text-blue-600" />,       habilitado: true },
  { id: 'transferencia', label: 'Transferencia',  descripcion: 'Transfieres y envías la constancia por WhatsApp', icon: <Building2 className="h-5 w-5 text-slate-600" />, habilitado: true },
  { id: 'whatsapp',      label: 'WhatsApp',       descripcion: 'Coordinar el pago con un asesor', icon: <MessageCircle className="h-5 w-5 text-emerald-500" />, habilitado: true },
];

/** Los métodos cuyo pago se coordina por WhatsApp con captura. */
const CON_CAPTURA: Metodo[] = ['yape', 'plin', 'transferencia'];

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

export function CheckoutClient({
  cuentasWeb = [],
  izipayHabilitado = false,
}: {
  cuentasWeb?: CuentaWeb[];
  izipayHabilitado?: boolean;
}) {
  const router = useRouter();
  const METODOS = useMemo(() => metodosDisponibles(izipayHabilitado), [izipayHabilitado]);
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const totalDisfraces = useCart((s) => s.totalItems());
  const escalon = escalonPorTotalItems(totalDisfraces);
  const clear = useCart((s) => s.clear);

  const [tipoDoc, setTipoDoc] = useState<'DNI' | 'RUC'>('DNI');
  const [doc, setDoc] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [ubigeo, setUbigeo] = useState('');
  const [entrega, setEntrega] = useState<'DELIVERY' | 'RECOJO_TIENDA'>('DELIVERY');
  const [destino, setDestino] = useState<DestinoEnvio | null>(null);
  const [metodo, setMetodo] = useState<Metodo>(izipayHabilitado ? 'izipay_card' : 'whatsapp');
  const [necesitaFactura, setNecesitaFactura] = useState(false);
  const [enviando, setEnviando] = useState(false);


  /*
   * El envío sale de la MISMA función que usa el servidor para cobrar.
   *
   * Acá estaba escrita la regla de nuevo, a mano, y eso es exactamente lo que
   * el archivo de precios pide no hacer: dos copias que se separan y el
   * comprador ve un precio mientras se le cobra otro.
   *
   * `null` significa "todavía no se sabe" —falta el destino, o va a provincia y
   * lo cotiza la agencia—, y no se suma al total. Antes daba S/ 15 desde el
   * primer segundo, con la dirección todavía vacía.
   */
  /*
   * Adónde paga, según lo que haya elegido.
   *
   * Sale de las cuentas cargadas en el ERP y no de un número escrito acá: si
   * mañana cambian el Yape o suman otro banco, se toca en Cuentas Bancarias y
   * la web y el mensaje acompañan solos. Yape y Plin usan las cuentas que
   * tienen teléfono; la transferencia, las que tienen número de cuenta.
   */
  const destinoDePago = useMemo(() => {
    if (!CON_CAPTURA.includes(metodo)) return [];
    const esBilletera = metodo === 'yape' || metodo === 'plin';
    return cuentasWeb
      .filter((c) => (esBilletera ? c.numero_telefono : c.numero_cuenta))
      .map((c) => {
        const titular = c.titular ? ` (${c.titular})` : '';
        if (esBilletera) return `${metodo === 'yape' ? 'Yape' : 'Plin'} al *${c.numero_telefono}*${titular}`;
        const cci = c.numero_cci ? ` · CCI ${c.numero_cci}` : '';
        return `${c.banco ?? c.nombre_corto}: *${c.numero_cuenta}*${titular}${cci}`;
      });
  }, [metodo, cuentasWeb]);

  const envio = useMemo(
    () => costoEnvio(entrega, total, destino),
    [entrega, total, destino],
  );
  const totalFinal = total + (envio ?? 0);
  const faltaDestino = entrega === 'DELIVERY' && destino === null;

  const [buscandoDoc, setBuscandoDoc] = useState(false);
  // Trackea el último valor que ESCRIBIÓ el autolookup. Regla anti datos
  // cruzados (fix 2026-07-12): si el usuario corrige el DNI de la persona A
  // a la B, el nombre de A (autocompletado) debe reemplazarse por el de B;
  // pero si el usuario editó el nombre a mano, NUNCA se pisa.
  const autoFillRef = useRef<{ nombre: string; direccion: string }>({ nombre: '', direccion: '' });
  async function consultarDoc(silent = false) {
    if (!doc) return silent ? undefined : toast.error('Ingresa el número de documento');
    const digitosSolo = doc.replace(/\D/g, '');
    if (tipoDoc === 'DNI' && digitosSolo.length !== 8) {
      return silent ? undefined : toast.error('El DNI debe tener 8 dígitos');
    }
    if (tipoDoc === 'RUC' && digitosSolo.length !== 11) {
      return silent ? undefined : toast.error('El RUC debe tener 11 dígitos');
    }
    const tipo = tipoDoc.toLowerCase();
    setBuscandoDoc(true);
    try {
      const res = await fetch(`/api/sunat/${tipo}/${digitosSolo}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? 'No se pudo consultar');
      }
      const nombreNuevo = data.nombreCompleto ?? data.razonSocial ?? '';
      if (nombreNuevo) {
        setNombre((prev) => {
          const esEdicionManual = prev.trim() !== '' && prev.trim() !== autoFillRef.current.nombre;
          // El autolookup (silent) nunca pisa una edición manual; el botón
          // "Consultar" (no silent) siempre reemplaza — el usuario lo pidió.
          if (esEdicionManual && silent) return prev;
          autoFillRef.current.nombre = nombreNuevo;
          return nombreNuevo;
        });
      }
      if (data.direccion) {
        setDireccion((prev) => {
          const esEdicionManual = prev.trim() !== '' && prev.trim() !== autoFillRef.current.direccion;
          if (esEdicionManual && silent) return prev;
          autoFillRef.current.direccion = data.direccion;
          return data.direccion;
        });
      }
      if (!silent) toast.success('Datos cargados');
    } catch (e) {
      const msg = (e as Error).message;
      if (!silent) toast.error(msg.includes('no encontrado') ? 'No se encontró el documento' : msg);
    } finally {
      setBuscandoDoc(false);
    }
  }

  // Autolookup RENIEC/SUNAT al terminar de tipear (2026-07-10). Debounce 500ms.
  // Corre siempre que el largo del doc matchee — la protección contra pisar
  // el nombre manual vive DENTRO de consultarDoc (autoFillRef). El botón
  // "Consultar" queda como fallback manual (fuerza reemplazo).
  useEffect(() => {
    const n = doc.replace(/\D/g, '');
    const largoOk = (tipoDoc === 'DNI' && n.length === 8) || (tipoDoc === 'RUC' && n.length === 11);
    if (!largoOk) return;
    const t = setTimeout(() => { void consultarDoc(true); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, tipoDoc]);

  async function enviarPedido() {
    if (items.length === 0) return toast.error('Carrito vacío');
    if (!nombre || !telefono) return toast.error('Completa nombre y teléfono');
    if (entrega === 'DELIVERY' && !direccion) return toast.error('Ingresa la dirección de envío');
    if (faltaDestino) return toast.error('Elegí si el envío va a Lima Metropolitana o a provincia');

    if (metodo === 'whatsapp' || CON_CAPTURA.includes(metodo)) {
      const msg = buildPedidoWaMessage({
        cliente: { nombre, documento: `${tipoDoc} ${doc}`, telefono },
        direccion,
        ubigeo,
        items: items.map((i) => ({
          sku: i.sku, nombre: i.nombre, talla: i.talla,
          // Precio efectivo aplicando escalón mayor/fábrica según total.
          cantidad: i.cantidad, precioUnit: precioEfectivoLinea(i, escalon),
        })),
        envio: envio ?? 0,
        canal: 'WEB',
        pago: CON_CAPTURA.includes(metodo)
          ? { metodo: metodo as 'yape' | 'plin' | 'transferencia', destino: destinoDePago }
          : undefined,
      });
      window.open(buildWhatsappUrl(msg), '_blank');
      toast.info(
        CON_CAPTURA.includes(metodo)
          ? 'Abriendo WhatsApp con tu pedido y los datos para pagar'
          : 'Abriendo WhatsApp con tu pedido...',
      );
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cliente: { tipoDoc, doc, nombre, email, telefono },
          entrega: { metodo: entrega, direccion, referencia, ubigeo, destino },
          metodoPago: metodo,
          necesitaFactura,
          // El precio que se mostró en pantalla. El servidor NO cobra esto:
          // lo recalcula con los precios de la base y solo avisa si cambió.
          items: items.map((i) => ({ ...i, precio: precioEfectivoLinea(i, escalon) })),
          envio: envio ?? 0,
          total: totalFinal,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Sin stock, o los precios cambiaron: mensajes multilínea explicativos.
        if (res.status === 409 && json.mensaje) {
          toast.error(json.mensaje, { duration: 10000 });
          return;
        }
        throw new Error(json.error ?? 'Error');
      }

      // Con tarjeta el pedido queda esperando el pago y se va a la pantalla de
      // cobro. El carrito NO se vacía todavía: se vacía cuando el pago se
      // confirma, así un cobro que no sale no le borra lo que había elegido.
      if (metodo === 'izipay_card') {
        // Carga completa, no navegación de Next: el formulario de izipay se
        // inicializa una sola vez por carga de página, y si el comprador ya
        // pasó antes por una pantalla de pago la librería sigue en memoria y
        // no vuelve a dibujarse.
        window.location.assign(`/pedido/${json.id}/pagar`);
        return;
      }

      clear();
      toast.success(`Pedido ${json.numero} creado. Te contactaremos para coordinar el pago.`);
      router.push(`/pedido/${json.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (items.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        Tu carrito está vacío. <Link href="/productos" className="text-happy-600">Ver catálogo →</Link>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {/* DATOS */}
        <Card className="p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">1. Datos del cliente</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Tipo</Label>
              <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as 'DNI' | 'RUC')} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label>
                Número {tipoDoc}
                {buscandoDoc && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-normal text-happy-600">
                    <Loader2 className="h-3 w-3 animate-spin" /> Consultando…
                  </span>
                )}
              </Label>
              <div className="mt-1 flex gap-2">
                <Input
                  value={doc}
                  onChange={(e) => setDoc(e.target.value.replace(/\D/g, ''))}
                  maxLength={tipoDoc === 'DNI' ? 8 : 11}
                  inputMode="numeric"
                  placeholder={tipoDoc === 'DNI' ? '8 dígitos' : '11 dígitos'}
                />
                <Button type="button" variant="outline" onClick={() => consultarDoc(false)} disabled={buscandoDoc}>
                  {buscandoDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar'}
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Se completa automático al terminar de tipear el número.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{tipoDoc === 'RUC' ? 'Razón social' : 'Nombre completo'}</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div>
              <Label>Correo</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Celular</Label>
              <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={9} required placeholder="9XXXXXXXX" />
            </div>
            <label className="mt-7 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={necesitaFactura} onChange={(e) => setNecesitaFactura(e.target.checked)} />
              Necesito factura (RUC obligatorio)
            </label>
          </div>
        </Card>

        {/* ENTREGA */}
        <Card className="p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">2. Entrega</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <button onClick={() => setEntrega('DELIVERY')} className={`flex items-start gap-3 rounded-lg border p-4 text-left ${entrega === 'DELIVERY' ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}>
              <Truck className="mt-0.5 h-5 w-5 shrink-0 text-happy-600" />
              <div>
                <p className="text-sm font-medium">Envío a domicilio</p>
                {total >= ENVIO_GRATIS_DESDE ? (
                  <p className="text-xs text-emerald-700">
                    🎁 GRATIS a Lima Metropolitana (tu compra pasa los S/ {ENVIO_GRATIS_DESDE})
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Compras mayores a <strong>S/ {ENVIO_GRATIS_DESDE}</strong> envío GRATIS a Lima Metropolitana.
                    Menores, el cliente paga el envío directo al motorizado.
                  </p>
                )}
              </div>
            </button>
            <button onClick={() => setEntrega('RECOJO_TIENDA')} className={`flex items-start gap-3 rounded-lg border p-4 text-left ${entrega === 'RECOJO_TIENDA' ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}>
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-happy-600" />
              <div>
                <p className="text-sm font-medium">Recojo en tienda · Tda. Huallaga</p>
                <p className="text-xs text-slate-500">
                  Jr. Huallaga 726 int. 150, Cercado de Lima
                </p>
              </div>
            </button>
          </div>

          {entrega === 'DELIVERY' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {/*
                * Primero a dónde va, porque de eso depende el envío.
                *
                * Hasta que no se elija, el resumen no pone ningún monto: antes
                * cobraba S/ 15 apenas entrabas, sin saber si el pedido iba a
                * San Miguel o a Iquitos.
                */}
              <div className="sm:col-span-2">
                <Label>¿A dónde enviamos?</Label>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setDestino('LIMA_METRO')}
                    className={`rounded-lg border p-3 text-left text-sm ${destino === 'LIMA_METRO' ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}
                  >
                    <span className="font-medium">Lima Metropolitana</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {total >= ENVIO_GRATIS_DESDE
                        ? 'Envío GRATIS: tu compra pasa el mínimo'
                        : `Envío S/ ${COSTO_ENVIO_DEFECTO.toFixed(2)} · gratis desde S/ ${ENVIO_GRATIS_DESDE}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestino('PROVINCIA')}
                    className={`rounded-lg border p-3 text-left text-sm ${destino === 'PROVINCIA' ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}
                  >
                    <span className="font-medium">Provincia</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Va por agencia y el flete se paga allá: acá no se te cobra envío.
                    </span>
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Dirección</Label>
                <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <Label>Referencia (opcional)</Label>
                <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Ubigeo (Departamento / Provincia / Distrito)</Label>
                <Input value={ubigeo} onChange={(e) => setUbigeo(e.target.value)} placeholder="Ej. Lima / Lima / Miraflores" />
                <p className="mt-1 text-xs text-slate-500">Próximamente: selector con autocompletar (API /api/ubigeo)</p>
              </div>
            </div>
          )}
        </Card>

        {/* PAGO */}
        <Card className="p-6">
          <h2 className="mb-1 font-display text-lg font-semibold">3. Método de pago</h2>
          <p className="mb-4 text-xs text-slate-500">
            {izipayHabilitado
              ? 'Con tarjeta el pago es al instante. Con Yape, Plin o transferencia pagas desde tu app y nos envías la captura por WhatsApp para confirmarlo.'
              : 'Pagas con Yape, Plin o transferencia desde tu app y nos envías la captura por WhatsApp para confirmarlo.'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {METODOS.map((m) => {
              const activo = metodo === m.id;
              const bloqueado = !m.habilitado;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (bloqueado) {
                      toast.info(`${m.label} estará disponible próximamente. Por ahora coordina por WhatsApp.`);
                      return;
                    }
                    setMetodo(m.id);
                  }}
                  aria-disabled={bloqueado}
                  className={`relative flex items-start gap-3 rounded-lg border p-4 text-left transition ${
                    activo
                      ? 'border-happy-500 bg-happy-50'
                      : bloqueado
                        ? 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 opacity-60'
                        : 'hover:border-slate-400'
                  }`}
                >
                  {m.icon}
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className={`text-xs ${bloqueado ? 'text-slate-400' : 'text-slate-500'}`}>{m.descripcion}</p>
                  </div>
                  {bloqueado && (
                    <Lock className="absolute right-2 top-2 h-3.5 w-3.5 text-slate-400" aria-label="No habilitado aún" />
                  )}
                </button>
              );
            })}
          </div>
          {metodo === 'whatsapp' && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <p className="font-semibold">Chat directo con un asesor</p>
              <p className="mt-1">
                Al finalizar la compra abriremos WhatsApp con un asesor real. Te enviaremos el resumen del pedido pre-cargado
                y coordinaremos el método de pago que prefieras (Yape / Plin / tarjeta / transferencia / efectivo contra entrega).
              </p>
            </div>
          )}

          {/*
            * El número adonde pagar, antes de salir de la página.
            *
            * También viaja dentro del mensaje de WhatsApp, pero conviene verlo
            * acá: hay quien paga primero desde el banco y recién después manda
            * la captura, y si el dato solo estuviera del otro lado tendría que
            * ir y volver para copiarlo.
            */}
          {CON_CAPTURA.includes(metodo) && (
            <div className="mt-3 rounded-md border border-happy-200 bg-happy-50/70 p-3 text-xs text-slate-700">
              <p className="font-semibold text-corp-900">
                Cómo sigue: pagas {metodo === 'transferencia' ? 'la transferencia' : `por ${metodo === 'yape' ? 'Yape' : 'Plin'}`} y nos mandas la captura
              </p>
              {destinoDePago.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {destinoDePago.map((d) => (
                    <li key={d} className="font-medium text-corp-900">
                      {d.replace(/\*/g, '')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">Te pasamos los datos para pagar apenas abramos el chat.</p>
              )}
              <p className="mt-2">
                Al terminar abrimos WhatsApp con tu pedido y el monto ya escritos. Nos envías la captura por ahí,
                la verificamos y te confirmamos el pedido.
              </p>
            </div>
          )}

          {/* Cuentas de pago web (mig 62, tabla cuentas_bancarias con
              visible_web=true). Cliente pidió mostrar Yape/Plin al 915109463
              para que el comprador tenga el número antes de contactar. */}
          {cuentasWeb.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Medios de pago disponibles
              </p>
              <ul className="space-y-2 text-sm">
                {cuentasWeb.map((c) => (
                  <li key={c.id} className="flex flex-col gap-0.5 rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-purple-600" />
                      <span className="font-semibold text-corp-900">{c.nombre_corto}</span>
                      {c.titular && (
                        <span className="text-[11px] text-slate-500">· {c.titular}</span>
                      )}
                    </div>
                    {c.numero_telefono && (
                      <div className="ml-6 font-mono text-sm text-emerald-700">
                        📱 {c.numero_telefono}
                      </div>
                    )}
                    {c.numero_cuenta && (
                      <div className="ml-6 font-mono text-[12px] text-slate-700">
                        Cuenta: {c.numero_cuenta}
                      </div>
                    )}
                    {c.numero_cci && (
                      <div className="ml-6 font-mono text-[11px] text-slate-500">
                        CCI: {c.numero_cci}
                      </div>
                    )}
                    {c.notas && (
                      <p className="ml-6 text-[11px] text-slate-500">{c.notas}</p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">
                Al finalizar por WhatsApp confirmaremos el método elegido y coordinaremos entrega.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* RESUMEN */}
      <Card className="h-fit p-5">
        <h3 className="mb-1 font-display text-lg font-semibold">Resumen</h3>
        <p className="mb-3 text-xs text-slate-600">
          Total de disfraces: <strong className="text-corp-900">{totalDisfraces}</strong>
          {escalon === 'MAYORISTA' && (
            <Badge className="ml-2 bg-emerald-500 text-[9px]">Precio mayorista</Badge>
          )}
          {escalon === 'FABRICA' && (
            <Badge className="ml-2 bg-blue-600 text-[9px] hover:bg-blue-600">Precio de fábrica</Badge>
          )}
        </p>
        <div className="space-y-2 text-sm">
          {items.map((i) => {
            const precioUnit = precioEfectivoLinea(i, escalon);
            return (
              <div key={i.varianteId} className="flex justify-between">
                <span className="text-slate-600">{i.cantidad}× {i.nombre} <Badge variant="outline" className="ml-1 text-[9px]">{formatTallaChip(i.talla)}</Badge></span>
                <span>S/ {(precioUnit * i.cantidad).toFixed(2)}</span>
              </div>
            );
          })}
          <hr className="my-2" />
          <div className="flex justify-between"><span>Subtotal</span><span>S/ {total.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4">
            <span>Envío</span>
            {envio === null ? (
              <span className="text-right text-xs text-slate-500">
                {entrega === 'DELIVERY' && destino === 'PROVINCIA'
                  ? 'Se cotiza por agencia'
                  : 'Se calcula al indicar el destino'}
              </span>
            ) : (
              <span>{envio === 0 ? 'GRATIS' : `S/ ${envio.toFixed(2)}`}</span>
            )}
          </div>
          <hr className="my-2" />
          <div className="flex justify-between text-base">
            <span className="font-semibold">Total</span>
            <span className="font-display text-xl font-semibold text-happy-600">S/ {totalFinal.toFixed(2)}</span>
          </div>
        </div>
        {/*
          * Mientras falte el destino el botón no se aprieta, y se dice por qué.
          *
          * Un botón apagado sin explicación manda a la gente a buscar el error
          * en cualquier otro lado; con el renglón de abajo sabe exactamente qué
          * le falta.
          */}
        <Button onClick={enviarPedido} variant="premium" size="lg" className="mt-5 w-full" disabled={enviando || faltaDestino}>
          {enviando ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>
          ) : metodo === 'whatsapp' ? (
            <><MessageCircle className="h-4 w-4" /> Abrir chat con asesor por WhatsApp</>
          ) : CON_CAPTURA.includes(metodo) ? (
            // Dice el monto: es lo que la persona va a tener que pagar en su
            // app, y verlo en el botón evita volver a mirar el resumen.
            <><MessageCircle className="h-4 w-4" /> Pagar S/ {totalFinal.toFixed(2)} por WhatsApp</>
          ) : metodo === 'izipay_card' ? (
            <><Lock className="h-4 w-4" /> Pagar S/ {totalFinal.toFixed(2)} con tarjeta</>
          ) : (
            'Finalizar compra'
          )}
        </Button>
        {faltaDestino && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Elegí arriba si el envío va a Lima Metropolitana o a provincia para ver el total.
          </p>
        )}
        <p className="mt-3 text-center text-[10px] text-slate-400">
          Tus datos están protegidos. <a href="/politica-de-privacidad" className="underline">Política de privacidad</a>
        </p>
      </Card>

    </div>
  );
}
