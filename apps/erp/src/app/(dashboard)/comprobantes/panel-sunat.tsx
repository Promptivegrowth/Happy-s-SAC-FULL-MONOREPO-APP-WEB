import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import {
  CheckCircle2, Clock, AlertTriangle, XCircle, Send, FileStack, ShieldCheck,
} from 'lucide-react';
import { HORA_RESUMEN, type EstadoSunat } from '@/server/actions/sunat-monitor-tipos';

/**
 * El panel de arriba de la pantalla de comprobantes.
 *
 * Contesta dos preguntas que antes había que deducir mirando la lista: si está
 * todo en orden, y cómo funciona el envío. Lo segundo importa tanto como lo
 * primero: sin saber que las boletas se informan a las 23:00, ver una boleta de
 * hoy "en espera" parece un problema.
 */
export function PanelSunat({ e }: { e: EstadoSunat }) {
  const todoBien = e.atrasados === 0 && e.conProblema === 0;
  const resumenHoyPendiente = e.horaLima < HORA_RESUMEN;

  return (
    <div className="space-y-3">
      {/* ─────────── El semáforo ─────────── */}
      <Card className={todoBien ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-300 bg-amber-50'}>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-start gap-3">
            {todoBien
              ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              : <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />}
            <div className="flex-1">
              <p className={`font-display text-lg font-semibold ${todoBien ? 'text-emerald-900' : 'text-amber-900'}`}>
                {todoBien
                  ? 'Todo al día con SUNAT'
                  : `Hay ${e.atrasados + e.conProblema} comprobante(s) que necesitan atención`}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {todoBien
                  ? 'Todas las boletas y facturas emitidas fueron aceptadas, o están esperando su envío normal.'
                  : 'Revisa abajo cuáles son. Un comprobante rechazado hay que corregirlo y volver a emitirlo.'}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Dato icono={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  valor={e.aceptados} etiqueta="Aceptados por SUNAT" />
            <Dato icono={<Clock className="h-4 w-4 text-sky-600" />}
                  valor={e.enEspera} etiqueta="Esperando su envío"
                  ayuda={resumenHoyPendiente
                    ? `Las boletas de hoy salen a las ${HORA_RESUMEN}:00`
                    : 'El resumen de hoy ya salió'} />
            <Dato icono={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                  valor={e.atrasados} etiqueta="Con más de 24 horas"
                  ayuda={e.atrasados > 0 ? 'Revísalos' : 'Ninguno'} alerta={e.atrasados > 0} />
            <Dato icono={<XCircle className="h-4 w-4 text-red-600" />}
                  valor={e.conProblema} etiqueta="Rechazados u observados"
                  ayuda={e.conProblema > 0 ? 'Hay que corregirlos' : 'Ninguno'} alerta={e.conProblema > 0} />
          </div>
        </CardContent>
      </Card>

      {/* ─────────── Las reglas ─────────── */}
      <Card>
        <CardContent className="py-4">
          <p className="mb-2 font-display text-sm font-semibold text-corp-900">
            Cómo se envían los comprobantes
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Regla
              icono={<Send className="h-4 w-4 text-happy-600" />}
              titulo="Las facturas van solas, al momento"
              texto={`Cada factura, nota de crédito y nota de débito se manda a SUNAT por separado, apenas se emite. El sistema revisa cada 15 minutos, así que en el peor caso tarda un cuarto de hora. La respuesta de SUNAT queda guardada como constancia (el CDR).`}
            />
            <Regla
              icono={<FileStack className="h-4 w-4 text-happy-600" />}
              titulo={`Las boletas van juntas, a las ${HORA_RESUMEN}:00`}
              texto={`SUNAT no recibe las boletas de a una: se informan en un Resumen Diario con todas las del día. Por eso una boleta emitida hoy figura "esperando" hasta las ${HORA_RESUMEN}:00, y eso es lo normal. Si un día falla el envío, al siguiente se manda igual: ningún día queda sin informar.`}
            />
            <Regla
              icono={<Clock className="h-4 w-4 text-happy-600" />}
              titulo="La respuesta del resumen no es inmediata"
              texto="SUNAT devuelve un número de ticket y contesta unos minutos después. El sistema vuelve a preguntar solo hasta obtener la respuesta; no hay que hacer nada."
            />
            <Regla
              icono={<AlertTriangle className="h-4 w-4 text-happy-600" />}
              titulo="Si algo se atrasa, avisa"
              texto="Cuando un comprobante lleva más de 24 horas sin respuesta conforme, el sistema manda un aviso a gerencia. Mientras no llegue ese aviso y este panel esté en verde, no hay nada que hacer."
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-slate-500">
            {e.ambiente && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                Ambiente: <b className="text-slate-700">{e.ambiente}</b>
              </span>
            )}
            {e.ultimaCorrida && (
              <span>Última revisión automática: <b className="text-slate-700">{e.ultimaCorrida}</b></span>
            )}
            <span>
              {e.corridas} revisiones registradas
              {e.fallosAcumulados === 0 ? ', sin fallas' : `, ${e.fallosAcumulados} con falla`}
            </span>
            {e.certificadoVence && (
              <span className={e.certificadoDias !== null && e.certificadoDias < 60 ? 'font-semibold text-amber-700' : ''}>
                Certificado digital vence el <b>{e.certificadoVence}</b>
                {e.certificadoDias !== null && ` (faltan ${e.certificadoDias} días)`}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─────────── Los resúmenes ─────────── */}
      {e.resumenes.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="mb-2 font-display text-sm font-semibold text-corp-900">
              Resúmenes diarios de boletas enviados
            </p>
            <p className="mb-3 text-xs text-slate-500">
              Cada fila es un día completo de boletas informado a SUNAT. Es acá donde se confirma
              que las boletas llegaron: el estado del resumen vale por todas las que viajaron en él.
            </p>
            <table className="w-full text-sm">
              <thead className="border-b text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1.5 text-left">Resumen</th>
                  <th className="py-1.5 text-left">Día informado</th>
                  <th className="py-1.5 text-right">Boletas</th>
                  <th className="py-1.5 text-left">Respuesta de SUNAT</th>
                </tr>
              </thead>
              <tbody>
                {e.resumenes.map((r) => (
                  <tr key={r.resumen_id} className="border-b last:border-0">
                    <td className="py-1.5 font-mono text-xs">{r.resumen_id}</td>
                    <td className="py-1.5">{r.fecha_referencia}</td>
                    <td className="py-1.5 text-right font-medium">{r.cantidad_boletas}</td>
                    <td className="py-1.5">
                      <Badge variant={r.estado === 'ACEPTADO' ? 'success' : r.estado === 'EN_PROCESO' ? 'default' : 'destructive'}>
                        {r.estado === 'EN_PROCESO' ? 'esperando respuesta' : r.estado}
                      </Badge>
                      {r.descripcion && (
                        <span className="ml-2 text-[11px] text-slate-500">{r.descripcion}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Dato({
  icono, valor, etiqueta, ayuda, alerta,
}: {
  icono: React.ReactNode; valor: number; etiqueta: string; ayuda?: string; alerta?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-white p-3 ${alerta ? 'border-amber-300' : ''}`}>
      <div className="flex items-center gap-1.5">
        {icono}
        <span className="font-display text-xl font-semibold text-corp-900">{valor}</span>
      </div>
      <p className="mt-0.5 text-[11px] font-medium text-slate-600">{etiqueta}</p>
      {ayuda && <p className="text-[10px] text-slate-400">{ayuda}</p>}
    </div>
  );
}

function Regla({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="flex gap-2 rounded-lg border bg-slate-50/60 p-3">
      <div className="mt-0.5 shrink-0">{icono}</div>
      <div>
        <p className="text-xs font-semibold text-corp-900">{titulo}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{texto}</p>
      </div>
    </div>
  );
}
