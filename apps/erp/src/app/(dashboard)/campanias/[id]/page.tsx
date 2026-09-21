import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { PageShell } from '@/components/page-shell';
import { CampanaForm } from '@/components/forms/campana-form';
import { ProductosDeCampana, type ProductoFila } from './productos-client';
import { Globe, ArrowLeft, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Campaña' };
export const dynamic = 'force-dynamic';

type Campana = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  slug: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  banner_url: string | null;
  activa: boolean | null;
  destacada_web: boolean | null;
  orden_web: number | null;
};

export default async function CampanaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: campRaw } = await sb
    .from('campanas')
    .select('id, codigo, nombre, descripcion, slug, fecha_inicio, fecha_fin, banner_url, activa, destacada_web, orden_web')
    .eq('id', id)
    .maybeSingle();
  const camp = campRaw as Campana | null;
  if (!camp) notFound();

  /*
   * Los disfraces activos, separados en los que ya están y los que se pueden
   * sumar, con la campaña ajena a la vista.
   *
   * Un producto pertenece a UNA campaña, así que sumar uno que está en otra lo
   * mueve. Se trae el nombre de esa otra para poder avisarlo antes, y no
   * después de haber vaciado Navidad sin querer.
   */
  const [{ data: prodsRaw }, { data: campsRaw }] = await Promise.all([
    sb.from('productos').select('id, codigo, nombre, campana_id').eq('activo', true).order('nombre'),
    sb.from('campanas').select('id, nombre'),
  ]);
  const prods = (prodsRaw ?? []) as { id: string; codigo: string; nombre: string; campana_id: string | null }[];
  const nombreCampana = new Map(((campsRaw ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]));

  const { data: pubsRaw } = prods.length > 0
    ? await sb.from('productos_publicacion').select('producto_id, publicado').in('producto_id', prods.map((p) => p.id))
    : { data: [] };
  const publicados = new Set(
    ((pubsRaw ?? []) as { producto_id: string; publicado: boolean | null }[])
      .filter((p) => p.publicado)
      .map((p) => p.producto_id),
  );

  const aFila = (p: typeof prods[number]): ProductoFila => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    publicado: publicados.has(p.id),
    otraCampana: p.campana_id && p.campana_id !== camp.id ? (nombreCampana.get(p.campana_id) ?? 'otra campaña') : null,
  });

  const dentro = prods.filter((p) => p.campana_id === camp.id).map(aFila);
  const fuera = prods.filter((p) => p.campana_id !== camp.id).map(aFila);
  const sinPublicar = dentro.filter((p) => !p.publicado).length;

  return (
    <PageShell
      title={camp.nombre}
      description={`${camp.codigo} · así es como se ve la sección de temporada en la tienda web.`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/campanias"><ArrowLeft className="h-4 w-4" /> Volver</Link>
          </Button>
          {camp.slug && (
            <Button asChild variant="outline">
              <a
                href={`https://www.disfraceshappys.com.pe/campanias/${camp.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <Globe className="h-4 w-4" /> Ver en la tienda
              </a>
            </Button>
          )}
        </div>
      }
    >
      {sinPublicar > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="flex gap-3 py-4 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              <strong>{sinPublicar} de los {dentro.length} disfraces de esta campaña no están publicados</strong> en
              la web, así que no se ven en la página aunque estén asignados. Publicalos desde{' '}
              <Link href="/web-catalogo" className="underline">Publicación Web</Link>.
            </p>
          </CardContent>
        </Card>
      )}

      <CampanaForm initial={camp} />

      <div className="mt-8">
        <h2 className="mb-1 font-display text-lg font-semibold">Disfraces de la campaña</h2>
        <p className="mb-4 text-sm text-slate-500">
          Los que aparecen en la página. Un disfraz puede estar en una sola campaña a la vez.
        </p>
        <ProductosDeCampana campanaId={camp.id} dentro={dentro} fuera={fuera} />
      </div>
    </PageShell>
  );
}
