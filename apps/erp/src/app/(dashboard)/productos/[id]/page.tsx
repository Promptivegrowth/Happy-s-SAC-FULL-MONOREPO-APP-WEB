import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { PageShell } from '@/components/page-shell';
import { ProductoForm } from '@/components/forms/producto-form';
import { VariantesSection } from '@/components/forms/variantes-section';
import { GaleriaSection } from '@/components/forms/galeria-section';
import { PublicacionSection } from '@/components/forms/publicacion-section';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarProducto } from '@/server/actions/productos';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: prod }, { data: cats }, { data: camps }, { data: vars }, { data: pub }, { data: imgs }, { data: extras }] = await Promise.all([
    sb.from('productos').select('*').eq('id', id).single(),
    sb.from('categorias').select('id, nombre, codigo').eq('activo', true).order('nombre'),
    sb.from('campanas').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    sb.from('productos_variantes').select('*').eq('producto_id', id).order('talla'),
    sb.from('productos_publicacion').select('*').eq('producto_id', id).maybeSingle(),
    sb.from('productos_imagenes').select('id, url, orden, es_portada').eq('producto_id', id).order('orden'),
    // Categorías extra. Cast hasta regenerar tipos de Supabase tras aplicar mig 31.
    (sb as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('productos_categorias_extra')
      .select('categoria_id')
      .eq('producto_id', id),
  ]);
  if (!prod) notFound();
  const categoriasExtraIniciales = ((extras ?? []) as { categoria_id: string }[]).map((e) => e.categoria_id);

  async function onDelete() { 'use server'; return eliminarProducto(id); }

  return (
    <PageShell
      title={prod.nombre}
      description={`Código ${prod.codigo} · ficha ${prod.version_ficha}`}
      actions={<DeleteButton action={onDelete} itemName="este producto" />}
    >
      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos del modelo</TabsTrigger>
          <TabsTrigger value="variantes">Variantes ({(vars ?? []).length})</TabsTrigger>
          <TabsTrigger value="galeria">Galería ({(imgs ?? []).length})</TabsTrigger>
          <TabsTrigger value="publicacion">Publicación web {pub?.publicado ? '✓' : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value="datos">
          <ProductoForm
            initial={prod}
            categorias={cats ?? []}
            campanas={camps ?? []}
            categoriasExtraIniciales={categoriasExtraIniciales}
          />
        </TabsContent>
        <TabsContent value="variantes">
          <VariantesSection productoId={id} variantes={vars ?? []} />
        </TabsContent>
        <TabsContent value="galeria">
          <GaleriaSection productoId={id} imagenes={imgs ?? []} />
        </TabsContent>
        <TabsContent value="publicacion">
          <PublicacionSection
            productoId={id}
            pub={pub}
            productoNombre={prod.nombre}
            tallasDelProducto={Array.from(new Set((vars ?? []).map((v) => v.talla as string)))}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
