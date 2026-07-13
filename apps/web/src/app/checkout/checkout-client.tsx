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

type Metodo = 'yape' | 'plin' | 'culqi_card' | 'transferencia' | 'whatsapp';

// Cliente pidió (post-2026-07-08): solo WhatsApp está habilitado hoy.
// Los otros medios (Yape, Plin, Tarjeta, Transferencia) se mostrarán como
// "Próximamente" hasta que se active Culqi para tarjeta y se habilite el
// flujo de sube-captura para Yape/Plin/Transferencia (pendiente de decisión
// operativa). WhatsApp queda como método principal — dispara chat directo
// con asesor con el pedido pre-cargado.
const METODOS: { id: Metodo; label: string; descripcion: string; icon: React.ReactNode; habilitado: boolean }[] = [
  { id: 'whatsapp',      label: 'WhatsApp',       descripcion: 'Coordinar pago con asesor',    icon: <MessageCircle className="h-5 w-5 text-emerald-500" />, habilitado: true },
  { id: 'yape',          label: 'Yape',           descripcion: 'Próximamente',                 icon: <Smartphone className="h-5 w-5 text-purple-600" />,     habilitado: false },
  { id: 'plin',          label: 'Plin',           descripcion: 'Próximamente',                 icon: <Smartphone className="h-5 w-5 text-blue-600" />,       habilitado: false },
  { id: 'culqi_card',    label: 'Tarjeta',        descripcion: 'Próximamente',                 icon: <CreditCard className="h-5 w-5 text-emerald-600" />,    habilitado: false },
  { id: 'transferencia', label: 'Transferencia',  descripcion: 'Próximamente',                 icon: <Building2 className="h-5 w-5 text-slate-600" />,       habilitado: false },
];

// Envío GRATIS a partir de S/ 249 (cliente reportó post-2026-07-08).
// Antes era S/ 199 — se subió el umbral.
const ENVIO_GRATIS_DESDE = 249;
const COSTO_ENVIO_DEFECTO = 15;

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

export function CheckoutClient({ cuentasWeb = [] }: { cuentasWeb?: CuentaWeb[] }) {
  const router = useRouter();
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
  const [metodo, setMetodo] = useState<Metodo>('whatsapp');
  const [necesitaFactura, setNecesitaFactura] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const envio = useMemo(
    () => entrega === 'RECOJO_TIENDA' ? 0 : (total >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO_DEFECTO),
    [entrega, total],
  );
  const totalFinal = total + envio;

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

    if (metodo === 'whatsapp') {
      const msg = buildPedidoWaMessage({
        cliente: { nombre, documento: `${tipoDoc} ${doc}`, telefono },
        direccion,
        ubigeo,
        items: items.map((i) => ({
          sku: i.sku, nombre: i.nombre, talla: i.talla,
          // Precio efectivo aplicando escalón mayor/fábrica según total.
          cantidad: i.cantidad, precioUnit: precioEfectivoLinea(i, escalon),
        })),
        envio,
        canal: 'WEB',
      });
      window.open(buildWhatsappUrl(msg), '_blank');
      toast.info('Abriendo WhatsApp con tu pedido...');
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cliente: { tipoDoc, doc, nombre, email, telefono },
          entrega: { metodo: entrega, direccion, referencia, ubigeo },
          metodoPago: metodo,
          necesitaFactura,
          // Pasar el precio efectivo aplicado (con escalón mayor/fábrica).
          items: items.map((i) => ({ ...i, precio: precioEfectivoLinea(i, escalon) })),
          envio,
          total: totalFinal,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Caso especial: stock insuficiente (mensaje multilínea más explicativo)
        if (res.status === 409 && json.mensaje) {
          toast.error(json.mensaje, { duration: 10000 });
          return;
        }
        throw new Error(json.error ?? 'Error');
      }
      clear();
      toast.success(`Pedido ${json.numero} creado. Te contactaremos para coordinar el pago.`);
      router.push(`/cuenta/pedidos/${json.id}`);
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
            Hoy solo aceptamos coordinación por WhatsApp. Yape, Plin, tarjeta y transferencia
            estarán disponibles próximamente.
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
                <span className="text-slate-600">{i.cantidad}× {i.nombre} <Badge variant="outline" className="ml-1 text-[9px]">{i.talla.replace('T', '')}</Badge></span>
                <span>S/ {(precioUnit * i.cantidad).toFixed(2)}</span>
              </div>
            );
          })}
          <hr className="my-2" />
          <div className="flex justify-between"><span>Subtotal</span><span>S/ {total.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Envío</span><span>{envio === 0 ? 'GRATIS' : `S/ ${envio.toFixed(2)}`}</span></div>
          <hr className="my-2" />
          <div className="flex justify-between text-base">
            <span className="font-semibold">Total</span>
            <span className="font-display text-xl font-semibold text-happy-600">S/ {totalFinal.toFixed(2)}</span>
          </div>
        </div>
        <Button onClick={enviarPedido} variant="premium" size="lg" className="mt-5 w-full" disabled={enviando}>
          {enviando ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</>
          ) : metodo === 'whatsapp' ? (
            <><MessageCircle className="h-4 w-4" /> Abrir chat con asesor por WhatsApp</>
          ) : (
            'Finalizar compra'
          )}
        </Button>
        <p className="mt-3 text-center text-[10px] text-slate-400">
          Tus datos están protegidos. <a href="/politica-de-privacidad" className="underline">Política de privacidad</a>
        </p>
      </Card>
    </div>
  );
}
