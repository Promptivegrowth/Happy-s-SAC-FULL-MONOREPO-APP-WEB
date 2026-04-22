'use client';

import { useMemo, useState } from 'react';
import { useCart } from '@/store/cart';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { CreditCard, MessageCircle, Smartphone, Truck, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { buildPedidoWaMessage, buildWhatsappUrl } from '@happy/lib/whatsapp';

type Metodo = 'yape' | 'plin' | 'culqi_card' | 'transferencia' | 'whatsapp';

const METODOS: { id: Metodo; label: string; descripcion: string; icon: React.ReactNode }[] = [
  { id: 'yape',          label: 'Yape',           descripcion: 'Sube captura para verificar', icon: <Smartphone className="h-5 w-5 text-purple-600" /> },
  { id: 'plin',          label: 'Plin',           descripcion: 'Sube captura para verificar', icon: <Smartphone className="h-5 w-5 text-blue-600" /> },
  { id: 'culqi_card',    label: 'Tarjeta',        descripcion: 'Visa / MasterCard / Amex',     icon: <CreditCard className="h-5 w-5 text-emerald-600" /> },
  { id: 'transferencia', label: 'Transferencia',  descripcion: 'BCP / BBVA / Interbank',       icon: <Building2 className="h-5 w-5 text-slate-600" /> },
  { id: 'whatsapp',      label: 'WhatsApp',       descripcion: 'Coordinar pago con asesor',    icon: <MessageCircle className="h-5 w-5 text-emerald-500" /> },
];

export function CheckoutClient() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
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
  const [metodo, setMetodo] = useState<Metodo>('yape');
  const [necesitaFactura, setNecesitaFactura] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const envio = useMemo(() => entrega === 'RECOJO_TIENDA' ? 0 : (total >= 199 ? 0 : 15), [entrega, total]);
  const totalFinal = total + envio;

  async function consultarDoc() {
    if (!doc) return;
    const tipo = tipoDoc.toLowerCase();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_ERP_URL ?? ''}/api/sunat/${tipo}/${doc}`);
      if (!res.ok) throw new Error('No se pudo consultar');
      const data = await res.json();
      setNombre(data.nombreCompleto ?? data.razonSocial ?? '');
      if (data.direccion) setDireccion(data.direccion);
      toast.success('Datos cargados');
    } catch {
      toast.error('No se encontró el documento');
    }
  }

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
          cantidad: i.cantidad, precioUnit: i.precio,
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
          items,
          envio,
          total: totalFinal,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error');
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
        Tu carrito está vacío. <a href="/productos" className="text-happy-600">Ver catálogo →</a>
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
              <Label>Número {tipoDoc}</Label>
              <div className="mt-1 flex gap-2">
                <Input value={doc} onChange={(e) => setDoc(e.target.value)} maxLength={tipoDoc === 'DNI' ? 8 : 11} />
                <Button type="button" variant="outline" onClick={consultarDoc}>Consultar</Button>
              </div>
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
            <button onClick={() => setEntrega('DELIVERY')} className={`flex items-center gap-3 rounded-lg border p-4 text-left ${entrega === 'DELIVERY' ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}>
              <Truck className="h-5 w-5 text-happy-600" />
              <div>
                <p className="text-sm font-medium">Envío a domicilio</p>
                <p className="text-xs text-slate-500">{total >= 199 ? '🎁 GRATIS por compra mayor a S/ 199' : 'S/ 15 Lima Metropolitana'}</p>
              </div>
            </button>
            <button onClick={() => setEntrega('RECOJO_TIENDA')} className={`flex items-center gap-3 rounded-lg border p-4 text-left ${entrega === 'RECOJO_TIENDA' ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}>
              <Building2 className="h-5 w-5 text-happy-600" />
              <div>
                <p className="text-sm font-medium">Recojo en tienda</p>
                <p className="text-xs text-slate-500">Huallaga · La Quinta</p>
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
          <h2 className="mb-4 font-display text-lg font-semibold">3. Método de pago</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {METODOS.map((m) => (
              <button key={m.id} onClick={() => setMetodo(m.id)} className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${metodo === m.id ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}>
                {m.icon}
                <div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-slate-500">{m.descripcion}</p>
                </div>
              </button>
            ))}
          </div>
          {metodo === 'whatsapp' && (
            <p className="mt-3 rounded-md bg-emerald-50 p-3 text-xs text-emerald-700">
              Te enviaremos al WhatsApp +51 916 856 842 con todos los detalles del pedido pre-cargados. Coordinaremos el pago contigo.
            </p>
          )}
        </Card>
      </div>

      {/* RESUMEN */}
      <Card className="h-fit p-5">
        <h3 className="mb-4 font-display text-lg font-semibold">Resumen</h3>
        <div className="space-y-2 text-sm">
          {items.map((i) => (
            <div key={i.varianteId} className="flex justify-between">
              <span className="text-slate-600">{i.cantidad}× {i.nombre} <Badge variant="outline" className="ml-1 text-[9px]">{i.talla.replace('T','')}</Badge></span>
              <span>S/ {(i.precio * i.cantidad).toFixed(2)}</span>
            </div>
          ))}
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
          {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando...</> : metodo === 'whatsapp' ? 'Enviar pedido por WhatsApp' : 'Finalizar compra'}
        </Button>
        <p className="mt-3 text-center text-[10px] text-slate-400">
          Tus datos están protegidos. <a href="/politica-de-privacidad" className="underline">Política de privacidad</a>
        </p>
      </Card>
    </div>
  );
}
