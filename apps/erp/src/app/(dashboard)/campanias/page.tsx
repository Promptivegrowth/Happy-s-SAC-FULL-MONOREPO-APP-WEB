import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Sparkles, Pencil, Globe, Info, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Campañas' };
export const dynamic = 'force-dynamic';

type CampanaRow = {
  id: string;
  codigo: string;
  nombre: string;
  slug: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  banner_url: string | null;
  activa: boolean | null;
};

/**
 * En qué anda una campaña, mirando la fecha y no un interruptor.
 *
 * La web elige qué campaña mostrar buscando la que esté activa y cuyo rango
 * incluya hoy. O sea que las fechas son lo que de verdad la enciende y la
 * apaga, y quien la carga necesita ver eso mismo de un vistazo: "programada"
 * no es un error, es que todavía no le toca.
 */
function estadoDe(c: CampanaRow, hoy: string) {
  if (!c.activa) return { texto: 'Apagada', variant: 'secondary' as const };
  if (!c.fecha_inicio || !c.fecha_fin) return { texto: 'Sin fechas', variant: 'destructive' as const };
  if (hoy < c.fecha_inicio) return { texto: 'Programada', variant: 'outline' as const };
  if (hoy > c.fecha_fin) return { texto: 'Terminada', variant: 'secondary' as const };
  return { texto: 'En vivo', variant: 'default' as const };
}

function fmt(d: string | null) {
  if (!d) return '—';
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

export default async function CampaniasPage() {
  const sb = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: campsRaw } = await sb
    .from('campanas')
    .select('id, codigo, nombre, slug, fecha_inicio, fecha_fin, banner_url, activa')
    .order('fecha_inicio', { ascending: false });
  const camps = (campsRaw ?? []) as CampanaRow[];

  /*
   * Cuántos productos tiene cada una, y cuántos de esos SE VEN en la web.
   *
   * Son dos números distintos a propósito. Asignar un disfraz a Halloween no
   * lo publica: si no está publicado en la web, la página de la campaña sigue
   * vacía y no hay nada en pantalla que lo explique. Mostrar los dos juntos es
   * lo que evita esa media hora de "pero si ya los asigné".
   */
  const ids = camps.map((c) => c.id);
  const conteo = new Map<string, { total: number; publicados: number }>();
  if (ids.length > 0) {
    const { data: prods } = await sb
      .from('productos')
      .select('id, campana_id')
      .in('campana_id', ids);
    const filas = (prods ?? []) as { id: string; campana_id: string }[];

    const { data: pubs } = filas.length > 0
      ? await sb
          .from('productos_publicacion')
          .select('producto_id, publicado')
          .in('producto_id', filas.map((p) => p.id))
      : { data: [] };
    const publicados = new Set(
      ((pubs ?? []) as { producto_id: string; publicado: boolean | null }[])
        .filter((p) => p.publicado)
        .map((p) => p.producto_id),
    );

    for (const p of filas) {
      const c = conteo.get(p.campana_id) ?? { total: 0, publicados: 0 };
      c.total += 1;
      if (publicados.has(p.id)) c.publicados += 1;
      conteo.set(p.campana_id, c);
    }
  }

  const enVivo = camps.filter((c) => estadoDe(c, hoy).texto === 'En vivo');

  return (
    <PageShell
      title="Campañas"
      description="Las temporadas y promociones de la tienda web: Halloween, Navidad, Fiestas Patrias."
      actions={
        <Button asChild>
          <Link href="/campanias/nueva"><Plus className="h-4 w-4" /> Nueva campaña</Link>
        </Button>
      }
    >
      <Card className="mb-4 border-sky-200 bg-sky-50/60">
        <CardContent className="flex gap-3 py-4 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <div>
            <p>
              <strong>La campaña se enciende sola por fecha.</strong> La web muestra la que esté prendida
              y cuyo rango incluya el día de hoy — no hay que acordarse de bajarla: el 5 de noviembre
              Halloween se apaga y el 15 aparece Navidad.
            </p>
            <p className="mt-1 text-slate-600">
              Asignar un disfraz a una campaña <strong>no lo publica</strong>. Si la columna “en la web”
              dice menos que “asignados”, esos productos no se ven: publicalos desde Publicación Web.
            </p>
          </div>
        </CardContent>
      </Card>

      {enVivo.length > 1 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="flex gap-3 py-4 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              Hay <strong>{enVivo.length} campañas en vivo al mismo tiempo</strong>. La web muestra una
              sola: la que termina primero. Las demás quedan sin aparecer en el menú.
            </p>
          </CardContent>
        </Card>
      )}

      {camps.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="Todavía no hay campañas"
          description="Creá una para armar la sección de temporada de la tienda web."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaña</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Se muestra</TableHead>
                <TableHead className="text-right">Asignados</TableHead>
                <TableHead className="text-right">En la web</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {camps.map((c) => {
                const est = estadoDe(c, hoy);
                const n = conteo.get(c.id) ?? { total: 0, publicados: 0 };
                const vacia = est.texto === 'En vivo' && n.publicados === 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/campanias/${c.id}`} className="font-medium hover:underline">
                        {c.nombre}
                      </Link>
                      <span className="block text-xs text-slate-500">{c.codigo}</span>
                    </TableCell>
                    <TableCell><Badge variant={est.variant}>{est.texto}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {fmt(c.fecha_inicio)} → {fmt(c.fecha_fin)}
                    </TableCell>
                    <TableCell className="text-right">{n.total}</TableCell>
                    <TableCell className="text-right">
                      <span className={vacia ? 'font-semibold text-danger' : ''}>{n.publicados}</span>
                      {vacia && (
                        <span className="block text-xs text-danger">la página sale vacía</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.slug && (
                          <Button asChild variant="ghost" size="sm" title="Ver en la tienda">
                            <a
                              href={`https://www.disfraceshappys.com.pe/campanias/${c.slug}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Globe className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="sm" title="Editar">
                          <Link href={`/campanias/${c.id}`}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageShell>
  );
}
