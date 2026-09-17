/**
 * Estado de un pedido web.
 *
 * Es adonde llega el comprador después de pagar con tarjeta y también adonde
 * lo devuelve izipay si el banco lo mandó a verificar con 3-D Secure. Muestra
 * el estado REAL del pedido leído de la base: no se le dice "pagado" porque
 * venga de la pantalla de pago, sino porque el pago quedó registrado.
 *
 * El enlace lleva el id interno (un UUID) y no el número WEB-000123, que es
 * correlativo y cualquiera podría ir probando para mirar pedidos ajenos.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@happy/db/service';
import { formatTallaChip } from '@happy/lib';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { CheckCircle2, Clock, XCircle, MessageCircle, CreditCard } from 'lucide-react';
import { obtenerContenidoWeb } from '@/lib/contenido-web';
import { enlaceWhatsApp, telefonoLegible } from '@happy/lib/web/contenido';

export const metadata = { title: 'Tu pedido' };
export const dynamic = 'force-dynamic';

type Linea = {
  cantidad: number;
  precio_unitario: number | string;
  productos_variantes: {
    sku: string | null;
    talla: string | null;
    productos: { nombre: string | null } | null;
  } | null;
};

type Pedido = {
  id: string;
  numero: string;
  estado: string;
  fecha: string;
  sub_total: number | string;
  costo_envio: number | string;
  total: number | string;
  metodo_entrega: string;
  direccion_entrega: string | null;
  contacto_nombre: string | null;
  metodo_pago_seleccionado: string | null;
  pedidos_web_lineas: Linea[];
};

/** Cómo se le cuenta cada estado a quien compró. */
const CARTEL: Record<string, { titulo: string; detalle: string; tono: 'ok' | 'espera' | 'mal' }> = {
  PENDIENTE_PAGO: {
    titulo: 'Pendiente de pago',
    detalle:
      'Todavía no registramos el pago de este pedido. Si acabas de pagar, espera unos segundos y ' +
      'recarga esta página: la confirmación del banco puede demorar un momento.',
    tono: 'espera',
  },
  PAGO_VERIFICADO: {
    titulo: '¡Pago confirmado!',
    detalle: 'Recibimos tu pago. Estamos preparando tu pedido y te avisamos apenas esté listo.',
    tono: 'ok',
  },
  EN_PREPARACION: {
    titulo: 'En preparación',
    detalle: 'Ya estamos armando tu pedido.',
    tono: 'ok',
  },
  LISTO_RECOJO: {
    titulo: 'Listo para recojo',
    detalle: 'Puedes pasar a recogerlo por Jr. Huallaga 726 int. 150, Cercado de Lima.',
    tono: 'ok',
  },
  EN_DELIVERY: {
    titulo: 'En camino',
    detalle: 'Tu pedido salió a reparto.',
    tono: 'ok',
  },
  ENTREGADO: {
    titulo: 'Entregado',
    detalle: '¡Gracias por tu compra!',
    tono: 'ok',
  },
  CANCELADO: {
    titulo: 'Pedido cancelado',
    detalle: 'Este pedido fue cancelado. Si crees que es un error, escríbenos por WhatsApp.',
    tono: 'mal',
  },
  WHATSAPP_DERIVADO: {
    titulo: 'Coordinando por WhatsApp',
    detalle: 'Un asesor está coordinando contigo el pago y la entrega.',
    tono: 'espera',
  },
};

const ESTILO = {
  ok: { borde: 'border-emerald-200 bg-emerald-50', texto: 'text-emerald-900', Icono: CheckCircle2 },
  espera: { borde: 'border-amber-200 bg-amber-50', texto: 'text-amber-900', Icono: Clock },
  mal: { borde: 'border-red-200 bg-red-50', texto: 'text-red-900', Icono: XCircle },
};

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { contacto } = await obtenerContenidoWeb();
  const { id } = await params;
  // Un id que no es UUID no puede existir: se corta antes de ir a la base.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sb = createServiceClient();
  const { data } = await sb
    .from('pedidos_web')
    .select(
      'id, numero, estado, fecha, sub_total, costo_envio, total, metodo_entrega, ' +
        'direccion_entrega, contacto_nombre, metodo_pago_seleccionado, ' +
        'pedidos_web_lineas(cantidad, precio_unitario, ' +
        'productos_variantes(sku, talla, productos(nombre)))',
    )
    .eq('id', id)
    .maybeSingle();

  const pedido = data as unknown as Pedido | null;
  if (!pedido) notFound();

  const cartel = CARTEL[pedido.estado] ?? {
    titulo: 'Pedido registrado',
    detalle: 'Te contactaremos para coordinar los siguientes pasos.',
    tono: 'espera' as const,
  };
  const { borde, texto, Icono } = ESTILO[cartel.tono];

  const waUrl = `${enlaceWhatsApp(contacto.whatsapp)}?text=${encodeURIComponent(
    `Hola, consulto por mi pedido ${pedido.numero}`,
  )}`;

  return (
    <div className="container max-w-2xl px-4 py-10">
      <p className="text-xs uppercase tracking-wider text-slate-500">Pedido</p>
      <h1 className="font-display text-3xl font-semibold">{pedido.numero}</h1>

      <div className={`mt-5 flex gap-3 rounded-lg border p-4 ${borde} ${texto}`}>
        <Icono className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">{cartel.titulo}</p>
          <p className="mt-1 text-sm">{cartel.detalle}</p>
        </div>
      </div>

      <Card className="mt-5 p-5">
        <h2 className="mb-3 font-display text-lg font-semibold">Detalle</h2>
        <div className="space-y-2 text-sm">
          {(pedido.pedidos_web_lineas ?? []).map((l, i) => {
            const v = l.productos_variantes;
            return (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-slate-600">
                  {l.cantidad}× {v?.productos?.nombre ?? v?.sku ?? 'Producto'}
                  {v?.talla && (
                    <Badge variant="outline" className="ml-1 text-[9px]">
                      {formatTallaChip(v.talla)}
                    </Badge>
                  )}
                </span>
                <span className="whitespace-nowrap">
                  S/ {(Number(l.precio_unitario) * l.cantidad).toFixed(2)}
                </span>
              </div>
            );
          })}
          <hr className="my-2" />
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>S/ {Number(pedido.sub_total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Envío</span>
            <span>
              {Number(pedido.costo_envio) === 0 ? 'GRATIS' : `S/ ${Number(pedido.costo_envio).toFixed(2)}`}
            </span>
          </div>
          <hr className="my-2" />
          <div className="flex justify-between text-base">
            <span className="font-semibold">Total</span>
            <span className="font-display text-xl font-semibold text-happy-600">
              S/ {Number(pedido.total).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="mt-4 border-t pt-3 text-xs text-slate-500">
          {pedido.metodo_entrega === 'RECOJO_TIENDA' ? (
            <p>Recojo en Tda. Huallaga · Jr. Huallaga 726 int. 150, Cercado de Lima</p>
          ) : (
            <p>Envío a: {pedido.direccion_entrega || '—'}</p>
          )}
        </div>
      </Card>

      {/*
        Mientras el pedido siga esperando el pago con tarjeta, el comprador
        puede reintentar desde acá, y sigue siendo EL MISMO pedido, no uno
        nuevo por cada intento.

        Es un <a> y no un <Link> a propósito: hace falta una carga completa de
        la página. Con la navegación de Next el JavaScript de izipay se queda
        en memoria de la visita anterior, y esa librería solo se inicializa una
        vez por carga: el segundo intento mostraba un recuadro vacío.
      */}
      {pedido.estado === 'PENDIENTE_PAGO' && pedido.metodo_pago_seleccionado === 'izipay_card' && (
        <a
          href={`/pedido/${pedido.id}/pagar`}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-happy-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-happy-700"
        >
          <CreditCard className="h-4 w-4" /> Pagar S/ {Number(pedido.total).toFixed(2)} con tarjeta
        </a>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800"
        >
          <MessageCircle className="h-4 w-4" /> Consultar por WhatsApp {telefonoLegible(contacto.whatsapp)}
        </a>
        <Link href="/productos" className="text-happy-600 underline">
          Seguir comprando
        </Link>
      </div>

      <p className="mt-6 text-[11px] text-slate-400">
        Guarda este enlace: es el seguimiento de tu pedido.
      </p>
    </div>
  );
}
