import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { PageShell } from '@/components/page-shell';
import { ProductoForm } from '@/components/forms/producto-form';
import { VariantesSection } from '@/components/forms/variantes-section';
import { PublicacionSection } from '@/components/forms/publicacion-section';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarProducto } from '@/server/actions/productos';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: prod }, { data: cats }, { data: camps }, { data: vars }, { data: pub }] = await Promise.all([
    sb.from('productos').select('*').eq('id', id).single(),
    sb.from('categorias').select('id, nombre, codigo').eq('activo', true).order('nombre'),
    sb.from('campanas').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    sb.from('productos_variantes').select('*').eq('producto_id', id).order('talla'),
    sb.from('productos_publicacion').select('*').eq('producto_id', id).maybeSingle(),
  ]);
  if (!prod) notFound();

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
          <TabsTrigger value="publicacion">Publicación web {pub?.publicado ? '✓' : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value="datos">
          <ProductoForm initial={prod} categorias={cats ?? []} campanas={camps ?? []} />
        </TabsContent>
        <TabsContent value="variantes">
          <VariantesSection productoId={id} variantes={vars ?? []} />
        </TabsContent>
        <TabsContent value="publicacion">
          <PublicacionSection productoId={id} pub={pub} productoNombre={prod.nombre} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
