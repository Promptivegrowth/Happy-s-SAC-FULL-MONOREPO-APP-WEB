import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Tags } from 'lucide-react';
import { NewButton, EditButton, DeleteButton, ProductosProvider } from './client';
import { formatPEN, formatDate , formatTallaChip } from '@happy/lib';

export const metadata = { title: 'Tarifas de servicios' };
export const dynamic = 'force-dynamic';

type Tarifa = {
  id: string;
  proceso: string | null;
  producto_id: string | null;
  talla: string | null;
  precio_unitario: number;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  observacion: string | null;
  productos: { codigo: string; nombre: string } | null;
};

/** Con ~800 tarifas, pintarlas todas de una hacía la pantalla inusable. */
const POR_PAGINA = 100;

export default async function Page({ searchParams }: { searchParams: Promise<{ proceso?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const filtroProceso = sp.proceso || '';
  const q = (sp.q || '').trim();
  const sb = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const [{ data: tarifasData }, { data: productos }] = await Promise.all([
    sbAny
      .from('tarifas_servicios')
      .select('id, proceso, producto_id, talla, precio_unitario, vigente_desde, vigente_hasta, observacion, productos!tarifas_servicios_producto_id_fkey(codigo, nombre)')
      .order('proceso', { nullsFirst: true })
      .order('producto_id', { nullsFirst: true }),
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre').limit(2000),
  ]);
  const todas = (tarifasData ?? []) as Tarifa[];
  const procesos = Array.from(new Set(todas.map((t) => t.proceso).filter(Boolean))) as string[];
  procesos.sort();
  const qLower = q.toLowerCase();
  const filtradas = todas.filter((t) => {
    if (filtroProceso) {
      const coincide = filtroProceso === '__SIN__' ? !t.proceso : t.proceso === filtroProceso;
      if (!coincide) return false;
    }
    if (!qLower) return true;
    const texto = `${t.proceso ?? ''} ${t.productos?.nombre ?? ''} ${t.productos?.codigo ?? ''} ${t.talla ?? ''} ${t.observacion ?? ''}`.toLowerCase();
    return texto.includes(qLower);
  });

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.page) || 1), totalPaginas);
  const tarifas = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  /** Arma el link conservando los filtros vigentes. */
  const linkCon = (cambios: { proceso?: string; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const proc = cambios.proceso !== undefined ? cambios.proceso : filtroProceso;
    const texto = cambios.q !== undefined ? cambios.q : q;
    const pag = cambios.page ?? 1;
    if (proc) params.set('proceso', proc);
    if (texto) params.set('q', texto);
    if (pag > 1) params.set('page', String(pag));
    const qs = params.toString();
    return `/configuracion/tarifas-servicios${qs ? `?${qs}` : ''}`;
  };

  const catalogoProductos = (productos ?? []).map((p) => ({
    id: p.id as string,
    codigo: p.codigo as string,
    nombre: p.nombre as string,
  }));

  return (
    <ProductosProvider productos={catalogoProductos}>
    <PageShell
      title="Tarifas de servicios"
      description="Tarifario CENTRAL de pago por unidad. Una sola entrada vale para todos los talleres. Si un taller específico cobra distinto, puedes ponerle una tarifa propia en /talleres/[id]/tarifas."
      actions={
        <div className="flex items-center gap-2">
          <Link href="/configuracion">
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <NewButton />
        </div>
      }
    >
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-2 font-display font-semibold text-corp-900">📐 Cómo funciona la cascada de tarifas</h3>
        <p className="text-xs text-slate-600">
          Cuando el sistema calcula el monto sugerido de una OS, busca la tarifa más específica:
        </p>
        <ol className="mt-2 ml-5 list-decimal text-xs text-slate-600">
          <li>
            <strong>Override del taller</strong> (en <code className="rounded bg-slate-100 px-1">/talleres/[id]/tarifas</code>):
            si ese taller específico cobra distinto, gana.
          </li>
          <li>
            <strong>Tarifa central de servicios</strong> (esta pantalla): la estándar para todos los talleres.
          </li>
        </ol>
        <p className="mt-2 text-xs text-slate-600">
          <strong>Tip</strong>: deja un campo vacío para que aplique a CUALQUIER valor. Empieza con tarifas por proceso
          (ej. COSTURA = S/ 4.50 para todos los productos y tallas) y agrega excepciones después.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-200 p-3">
        {filtroProceso && <input type="hidden" name="proceso" value={filtroProceso} />}
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Buscar tarifa
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Por producto, código, proceso, talla o nota…"
            className="h-9 w-full rounded-md border px-2 text-sm"
          />
        </div>
        <Button type="submit" size="sm" variant="premium">Buscar</Button>
        {(q || filtroProceso) && (
          <Link href="/configuracion/tarifas-servicios" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">
            Limpiar filtros
          </Link>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {filtradas.length} {filtradas.length === 1 ? 'tarifa' : 'tarifas'}
          {filtradas.length > POR_PAGINA && ` · mostrando ${tarifas.length} (página ${pagina} de ${totalPaginas})`}
        </span>
      </form>

      {procesos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Filtrar por proceso:</span>
          <Link
            href={linkCon({ proceso: '' })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${!filtroProceso ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-happy-300'}`}
          >
            Todas ({todas.length})
          </Link>
          {procesos.map((pr) => {
            const n = todas.filter((t) => t.proceso === pr).length;
            return (
              <Link
                key={pr}
                href={linkCon({ proceso: pr })}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${filtroProceso === pr ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-happy-300'}`}
              >
                {pr.replace('_', ' ')} ({n})
              </Link>
            );
          })}
        </div>
      )}

      {tarifas.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title={todas.length === 0 ? 'Sin tarifas configuradas' : 'Ninguna tarifa coincide con el filtro'}
          description={
            todas.length === 0
              ? 'Sin tarifas, el sistema no puede sugerir el monto al crear órdenes de servicio. Empieza cargando una tarifa por proceso.'
              : 'Prueba con otro texto de búsqueda o quita el filtro de proceso.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proceso</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead className="text-right">Tarifa</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      {t.proceso ? (
                        <Badge variant="default" className="text-[10px]">{t.proceso.replace('_', ' ')}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Cualquier proceso</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.productos?.nombre ? (
                        <span>
                          <span className="font-medium">{t.productos.nombre}</span>
                          <span className="ml-1 font-mono text-[10px] text-slate-400">{t.productos.codigo}</span>
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Cualquier producto</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.talla ? (
                        <Badge variant="outline" className="text-[10px]">{formatTallaChip(t.talla)}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Cualquier talla</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">
                      {formatPEN(Number(t.precio_unitario))}
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-500">
                      {t.vigente_desde ? formatDate(t.vigente_desde) : '—'}
                      {t.vigente_hasta && ` → ${formatDate(t.vigente_hasta)}`}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-slate-500">{t.observacion ?? ''}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <EditButton
                          tarifa={{
                            id: t.id,
                            proceso: t.proceso,
                            producto_id: t.producto_id,
                            talla: t.talla,
                            precio_unitario: Number(t.precio_unitario),
                            observacion: t.observacion,
                          }}
                        />
                        <DeleteButton tarifaId={t.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Página {pagina} de {totalPaginas} · {filtradas.length} tarifas en total
          </span>
          <div className="flex items-center gap-2">
            {pagina > 1 ? (
              <Link href={linkCon({ page: pagina - 1 })} className="rounded-md border px-3 py-1.5 font-medium hover:bg-slate-50">
                ← Anterior
              </Link>
            ) : (
              <span className="rounded-md border px-3 py-1.5 text-slate-300">← Anterior</span>
            )}
            {pagina < totalPaginas ? (
              <Link href={linkCon({ page: pagina + 1 })} className="rounded-md border px-3 py-1.5 font-medium hover:bg-slate-50">
                Siguiente →
              </Link>
            ) : (
              <span className="rounded-md border px-3 py-1.5 text-slate-300">Siguiente →</span>
            )}
          </div>
        </div>
      )}
    </PageShell>
    </ProductosProvider>
  );
}
