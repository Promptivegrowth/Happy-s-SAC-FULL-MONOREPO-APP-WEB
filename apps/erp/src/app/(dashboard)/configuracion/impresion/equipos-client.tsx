'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import {
  Printer, Plus, Copy, Check, Loader2, RefreshCw, Power, Trash2,
  AlertTriangle, Scissors,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  crearEquipoImpresion, actualizarEquipoImpresion, eliminarEquipoImpresion,
  regenerarTokenImpresion, olvidarMaquinasImpresion, type EquipoImpresionDTO,
} from '@/server/actions/impresion';

type Almacen = { id: string; codigo: string; nombre: string };

/**
 * Configuración de las computadoras con ticketera.
 *
 * El flujo de instalación es: se crea la computadora acá, se copia su código y
 * se pega en el agente que corre en esa máquina. En menos de un minuto aparece
 * con el punto verde.
 *
 * La lista se refresca sola cada 15 segundos: quien está instalando necesita
 * ver el punto cambiar de color sin andar recargando la página.
 */
export function EquiposImpresionClient({
  equiposIniciales,
  almacenes,
  urlPos,
}: {
  equiposIniciales: EquipoImpresionDTO[];
  almacenes: Almacen[];
  urlPos: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState('');
  const [almacenId, setAlmacenId] = useState<string>(almacenes[0]?.id ?? '');
  const [copiado, setCopiado] = useState<string | null>(null);

  const equipos = equiposIniciales;

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);

  function codigoInstalacion(e: EquipoImpresionDTO): string {
    return `url=${urlPos}\ntoken=${e.token}`;
  }

  async function copiar(e: EquipoImpresionDTO) {
    try {
      await navigator.clipboard.writeText(codigoInstalacion(e));
      setCopiado(e.id);
      setTimeout(() => setCopiado(null), 2500);
      toast.success('Código copiado — pégalo en la ventana del agente');
    } catch {
      toast.error('No se pudo copiar. Selecciona el código y cópialo a mano.');
    }
  }

  function agregar() {
    if (nombre.trim().length < 2) { toast.error('Ponle un nombre que identifique la computadora'); return; }
    iniciar(async () => {
      const r = await crearEquipoImpresion({ nombre: nombre.trim(), almacen_id: almacenId || null });
      if (!r.ok) { toast.error(r.error ?? 'No se pudo agregar'); return; }
      setNombre('');
      toast.success('Computadora agregada — ahora copia el código');
      router.refresh();
    });
  }

  function editar(id: string, cambios: Parameters<typeof actualizarEquipoImpresion>[0]) {
    iniciar(async () => {
      const r = await actualizarEquipoImpresion({ ...cambios, id });
      if (!r.ok) { toast.error(r.error ?? 'No se pudo guardar'); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* ─────────── Cómo se instala ─────────── */}
      <Card className="border-corp-200 bg-corp-50/50">
        <CardContent className="py-4 text-sm text-slate-700">
          <p className="mb-2 font-semibold text-corp-900">Cómo se instala, una sola vez por computadora</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abre <b>AgenteImpresionHappy.exe</b> en la computadora que tiene la ticketera.</li>
            <li>Acá abajo escribe un nombre para esa computadora (por ejemplo “Caja Huallaga”) y presiona <b>Agregar</b>.</li>
            <li>Presiona <b>Copiar código</b> y pégalo en la ventana del programa.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-600">
            El programa queda arrancando solo con Windows. En menos de un minuto la computadora
            aparece acá con el punto verde.
          </p>
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <b>Cada computadora necesita su propio código.</b> Si pegas el mismo en dos, las dos
            piden los tickets de la misma cola: unos salen en una y otros en la otra, y el mismo
            comprobante puede llegar a imprimirse dos veces.
          </p>
        </CardContent>
      </Card>

      {/* ─────────── Agregar ─────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nombre de la computadora
            </label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregar()}
              placeholder="Caja Huallaga"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tienda</label>
            <select
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sin asignar</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
              ))}
            </select>
          </div>
          <Button variant="premium" onClick={agregar} disabled={pendiente}>
            {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Agregar
          </Button>
        </CardContent>
      </Card>

      {/* ─────────── Lista ─────────── */}
      {equipos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Todavía no hay ninguna computadora registrada. Agrega la primera arriba.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {equipos.map((e) => (
            <EquipoCard
              key={e.id}
              equipo={e}
              almacenes={almacenes}
              copiado={copiado === e.id}
              pendiente={pendiente}
              onCopiar={() => copiar(e)}
              onEditar={(cambios) => editar(e.id, { ...cambios, id: e.id })}
              onRegenerar={() => iniciar(async () => {
                if (!confirm('El código actual dejará de funcionar y habrá que volver a instalar el agente en esa computadora. ¿Continuamos?')) return;
                const r = await regenerarTokenImpresion(e.id);
                if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
                toast.success('Código nuevo generado');
                router.refresh();
              })}
              onOlvidarMaquinas={() => iniciar(async () => {
                const r = await olvidarMaquinasImpresion(e.id);
                if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
                toast.success('Aviso descartado');
                router.refresh();
              })}
              onEliminar={() => iniciar(async () => {
                if (!confirm(
                  `¿Borrar "${e.nombre}"?

Se borra también su historial de tickets y el código de instalación deja de servir. ` +
                  'Si solo quieres dejarla fuera de servicio, usa Desactivar.',
                )) return;
                const r = await eliminarEquipoImpresion(e.id);
                if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
                const n = r.data?.tickets ?? 0;
                toast.success(n > 0 ? `Computadora borrada, junto con ${n} ticket(s) de su historial` : 'Computadora borrada');
                router.refresh();
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EquipoCard({
  equipo: e, almacenes, copiado, pendiente, onCopiar, onEditar, onRegenerar, onEliminar, onOlvidarMaquinas,
}: {
  equipo: EquipoImpresionDTO;
  almacenes: Almacen[];
  copiado: boolean;
  pendiente: boolean;
  onCopiar: () => void;
  onEditar: (cambios: { impresora?: string | null; avance_corte_mm?: number; activo?: boolean; almacen_id?: string | null }) => void;
  onRegenerar: () => void;
  onEliminar: () => void;
  onOlvidarMaquinas: () => void;
}) {
  const [avance, setAvance] = useState(String(e.avance_corte_mm));

  const punto = e.listo ? 'bg-emerald-500' : e.conectado ? 'bg-amber-500' : 'bg-slate-300';
  const estado = e.listo
    ? 'Lista para imprimir'
    : e.conectado
      ? 'Conectada, pero no encuentra ninguna ticketera'
      : 'Sin conexión';

  return (
    <Card className={e.activo ? undefined : 'opacity-60'}>
      <CardContent className="space-y-3 py-4">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${punto}`} title={estado} />
          <span className="font-semibold text-corp-900">{e.nombre}</span>
          {e.almacen_nombre && <Badge variant="outline">{e.almacen_nombre}</Badge>}
          {!e.activo && <Badge variant="secondary">Desactivada</Badge>}
          {e.version_agente && <span className="text-xs text-slate-400">agente v{e.version_agente}</span>}
          <div className="ml-auto flex gap-1">
            <Button variant="outline" size="sm" onClick={onCopiar}>
              {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado' : 'Copiar código'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEditar({ activo: !e.activo })} disabled={pendiente}>
              <Power className="h-3.5 w-3.5" /> {e.activo ? 'Desactivar' : 'Activar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onRegenerar} disabled={pendiente} title="Genera un código nuevo; el anterior deja de servir">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm" onClick={onEliminar} disabled={pendiente}
              className="text-rose-600 hover:bg-rose-50"
              title="Borrar esta computadora y su historial de tickets"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <p className={`text-xs ${e.listo ? 'text-emerald-700' : e.conectado ? 'text-amber-700' : 'text-slate-500'}`}>
          {estado}
          {e.impresora_detectada && ` · imprimiendo por “${e.impresora_detectada}”`}
          {e.maquina && ` · en ${e.maquina}`}
        </p>

        {/* El mismo código en dos computadoras: los tickets se reparten al azar
            entre ellas. Es invisible mirando la fila, por eso el aviso. */}
        {e.maquinas_vistas.length > 1 && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900">
            <p className="flex items-start gap-1.5 font-semibold">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Este código está instalado en {e.maquinas_vistas.length} computadoras
            </p>
            <p className="mt-1">
              {e.maquinas_vistas.join(' · ')} — las dos piden los tickets de esta misma cola, así que
              unos salen en una y otros en la otra, y el mismo comprobante puede imprimirse dos veces.
            </p>
            <p className="mt-1">
              Desinstala el agente de la que no corresponde (o presiona <b>↻</b> para invalidar este
              código y volver a instalar solo en la correcta). Después de arreglarlo, presiona
              &ldquo;Ya lo resolví&rdquo; para que desaparezca este aviso.
            </p>
            <Button
              variant="outline" size="sm" className="mt-2"
              disabled={pendiente}
              onClick={onOlvidarMaquinas}
            >
              Ya lo resolví
            </Button>
          </div>
        )}

        {e.conectado && !e.listo && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            El agente está corriendo pero no reconoció ninguna ticketera. Elige abajo cuál es: hay
            marcas cuyo nombre no dice ni “POS” ni “80mm” y la detección automática no las encuentra.
          </p>
        )}

        {/* Ajustes */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Printer className="h-3 w-3" /> Ticketera
            </label>
            <select
              value={e.impresora ?? ''}
              onChange={(ev) => onEditar({ impresora: ev.target.value || null })}
              disabled={pendiente}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Que la elija sola</option>
              {e.impresoras_disponibles.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              {/* La forzada puede no estar en la lista si el agente aún no informó */}
              {e.impresora && !e.impresoras_disponibles.includes(e.impresora) && (
                <option value={e.impresora}>{e.impresora}</option>
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Scissors className="h-3 w-3" /> Avance antes de cortar
            </label>
            <div className="flex gap-1">
              <Input
                type="number" min={5} max={40} step={1}
                value={avance}
                onChange={(ev) => setAvance(ev.target.value)}
                onBlur={() => {
                  const n = Number(avance);
                  if (!Number.isFinite(n) || n === e.avance_corte_mm) return;
                  onEditar({ avance_corte_mm: n });
                }}
                className="h-9"
              />
              <span className="flex h-9 items-center text-sm text-slate-500">mm</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tienda</label>
            <select
              value={e.almacen_id ?? ''}
              onChange={(ev) => onEditar({ almacen_id: ev.target.value || null })}
              disabled={pendiente}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Sin asignar</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Si el corte se come la última línea del ticket, sube los milímetros. Si sobra papel en
          blanco al final, bájalos. La cuchilla está a distinta altura en cada modelo, por eso se
          ajusta por computadora y no para todas a la vez.
        </p>
      </CardContent>
    </Card>
  );
}
