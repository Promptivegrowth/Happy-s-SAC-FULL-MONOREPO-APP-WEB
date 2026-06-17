import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import {
  ArrowLeft,
  AlertTriangle,
  User as UserIcon,
  Package,
  Mail,
  Phone,
  MapPin,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { obtenerReclamo } from '@/server/actions/reclamos';
import {
  PLAZO_ALERTA_DIAS,
  PLAZO_LEGAL_DIAS,
  diasDesde,
  tonoEstado,
  tonoTipo,
} from '@/server/actions/reclamos-helpers';
import { ResponderForm } from './responder-form';
import { DescargarReclamoPdfButton } from './descargar-pdf-button';

export const metadata = { title: 'Detalle de reclamo' };
export const dynamic = 'force-dynamic';

export default async function ReclamoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obtenerReclamo(id);
  if (!res.ok || !res.data) {
    if (res.error?.toLowerCase().includes('no encontrado')) notFound();
    return (
      <PageShell title="Reclamo" description="Error al cargar.">
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">{res.error ?? 'No se pudo cargar'}</p>
        </Card>
      </PageShell>
    );
  }

  const r = res.data;
  const dias = diasDesde(r.fecha);
  const sinResponder = r.estado === 'NUEVO' || r.estado === 'EN_REVISION';
  const vencido = sinResponder && dias > PLAZO_ALERTA_DIAS;
  const excedePlazoLegal = sinResponder && dias > PLAZO_LEGAL_DIAS;

  const fechaTxt = new Date(r.fecha).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fechaRespuestaTxt = r.fecha_respuesta
    ? new Date(r.fecha_respuesta).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <PageShell
      title={`Reclamo ${r.numero}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={tonoTipo(r.tipo)} className="text-[10px]">
            {r.tipo}
          </Badge>
          <Badge variant={tonoEstado(r.estado)} className="text-[10px]">
            {r.estado.replace('_', ' ')}
          </Badge>
          <span className="text-slate-500">· {fechaTxt}</span>
        </span>
      }
      actions={
        <div className="flex gap-2">
          <Link href="/reclamos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <DescargarReclamoPdfButton id={r.id} numero={r.numero} />
        </div>
      }
    >
      {/* Alerta de cumplimiento */}
      {vencido && (
        <Card
          className={
            excedePlazoLegal
              ? 'border-rose-400 bg-rose-50 p-4'
              : 'border-amber-300 bg-amber-50 p-4'
          }
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={
                excedePlazoLegal ? 'h-5 w-5 shrink-0 text-rose-600' : 'h-5 w-5 shrink-0 text-amber-600'
              }
            />
            <div className="text-sm">
              <p
                className={
                  excedePlazoLegal ? 'font-semibold text-rose-900' : 'font-semibold text-amber-900'
                }
              >
                {excedePlazoLegal
                  ? `Plazo legal vencido — han pasado ${dias} días sin responder (Indecopi exige máximo ${PLAZO_LEGAL_DIAS} días calendario).`
                  : `Atención: ${dias} días desde la recepción del reclamo. Responda antes de los ${PLAZO_LEGAL_DIAS} días para cumplir con Indecopi.`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Bien contratado */}
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          <Package className="h-4 w-4" /> Bien contratado
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase text-slate-500">Tipo</p>
            <p className="text-sm font-medium">{r.tipo_bien ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-slate-500">Monto reclamado</p>
            <p className="text-sm font-medium">
              {r.monto_reclamado != null
                ? `S/ ${r.monto_reclamado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-slate-500">Vinculaciones</p>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {r.venta_id && (
                <Link href={`/ventas/${r.venta_id}`}>
                  <Badge variant="outline" className="text-[10px]">
                    Venta {r.venta_numero ?? r.venta_id.slice(0, 8)}
                  </Badge>
                </Link>
              )}
              {r.pedido_web_id && (
                <Link href={`/pedidos-web/${r.pedido_web_id}`}>
                  <Badge variant="outline" className="text-[10px]">
                    Pedido web {r.pedido_web_numero ?? r.pedido_web_id.slice(0, 8)}
                  </Badge>
                </Link>
              )}
              {r.comprobante_id && (
                <Link href={`/comprobantes/${r.comprobante_id}`}>
                  <Badge variant="outline" className="text-[10px]">
                    Comprobante {r.comprobante_numero ?? r.comprobante_id.slice(0, 8)}
                  </Badge>
                </Link>
              )}
              {!r.venta_id && !r.pedido_web_id && !r.comprobante_id && (
                <span className="text-xs text-slate-400">—</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Datos del consumidor */}
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          <UserIcon className="h-4 w-4" /> Datos del consumidor
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase text-slate-500">Nombre</p>
            <p className="text-sm font-medium">{r.cliente_nombre}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-slate-500">Documento</p>
            <p className="text-sm font-medium">
              {r.cliente_documento_tipo} {r.cliente_documento_numero}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[11px] uppercase text-slate-500">
              <Phone className="h-3 w-3" /> Teléfono
            </p>
            <p className="text-sm">{r.cliente_telefono ?? '—'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[11px] uppercase text-slate-500">
              <Mail className="h-3 w-3" /> Email
            </p>
            <p className="text-sm">{r.cliente_email ?? '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="flex items-center gap-1 text-[11px] uppercase text-slate-500">
              <MapPin className="h-3 w-3" /> Dirección
            </p>
            <p className="text-sm">{r.cliente_direccion ?? '—'}</p>
            {r.cliente_ubigeo && (
              <p className="font-mono text-[10px] text-slate-500">Ubigeo: {r.cliente_ubigeo}</p>
            )}
          </div>
          {r.es_menor_edad && (
            <div className="sm:col-span-2 rounded-md bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-900">Consumidor menor de edad</p>
              <p className="text-amber-800">
                Apoderado: <strong>{r.apoderado_nombre ?? '—'}</strong>
                {r.apoderado_documento && (
                  <span className="ml-2 font-mono text-xs">({r.apoderado_documento})</span>
                )}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Descripción */}
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          Descripción del reclamo
        </h2>
        <p className="whitespace-pre-wrap text-sm text-slate-800">{r.descripcion}</p>
      </Card>

      {/* Pedido del consumidor */}
      {r.pedido_consumidor && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Pedido del consumidor
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{r.pedido_consumidor}</p>
        </Card>
      )}

      {/* Respuesta del proveedor */}
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          <CheckCircle2 className="h-4 w-4" /> Respuesta del proveedor
        </h2>
        {r.respuesta ? (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap text-sm text-slate-800">{r.respuesta}</p>
            <div className="flex flex-wrap items-center gap-3 border-t pt-2 text-[11px] text-slate-500">
              {fechaRespuestaTxt && <span>Respondido el {fechaRespuestaTxt}</span>}
              {r.respondido_por_email && <span>· por {r.respondido_por_email}</span>}
              <Badge variant={tonoEstado(r.estado)} className="text-[10px]">
                {r.estado.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        ) : (
          <ResponderForm id={r.id} estadoActual={r.estado} />
        )}
      </Card>

      {/* Metadata de tracking */}
      <Card className="bg-slate-50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Tracking</p>
        <div className="mt-1 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-3">
          <span>
            IP: <span className="font-mono">{r.ip_consumidor ?? '—'}</span>
          </span>
          <span className="truncate" title={r.user_agent ?? ''}>
            UA: <span className="font-mono">{r.user_agent ?? '—'}</span>
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" /> Términos aceptados:{' '}
            <strong>{r.acepta_terminos ? 'Sí' : 'No'}</strong>
          </span>
        </div>
      </Card>
    </PageShell>
  );
}
