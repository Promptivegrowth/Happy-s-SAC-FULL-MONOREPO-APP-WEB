import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft } from 'lucide-react';
import { SelectorEtiquetas, AyudaZebra, type ProductoEtiqueta } from './selector-etiquetas';

export const metadata = { title: 'Etiquetas de código de barras' };
export const dynamic = 'force-dynamic';

export default async function EtiquetasPage() {
  const sb = await createClient();

  // Se traen SOLO los campos que la etiqueta imprime. La página anterior de
  // tarifas enseñó la lección: mandar el producto entero al cliente hace
  // megabytes de HTML por nada.
  const { data, error } = await sb
    .from('productos')
    .select('id, codigo, nombre, productos_variantes(sku, codigo_barras, talla, activo)')
    .eq('activo', true)
    .order('nombre');

  const productos: ProductoEtiqueta[] = (data ?? [])
    .map((p) => {
      const vs = (p as unknown as { productos_variantes?: { sku: string; codigo_barras: string | null; talla: string; activo: boolean | null }[] })
        .productos_variantes ?? [];
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        variantes: vs
          .filter((v) => v.activo !== false)
          .map((v) => ({ sku: v.sku, codigo_barras: v.codigo_barras, talla: v.talla })),
      };
    })
    .filter((p) => p.variantes.length > 0);

  const totalTallas = productos.reduce((s, p) => s + p.variantes.length, 0);
  const conCodigo = productos.reduce((s, p) => s + p.variantes.filter((v) => (v.codigo_barras ?? '').trim()).length, 0);

  return (
    <PageShell
      title="Etiquetas de código de barras"
      description="Imprime las etiquetas que se pegan en la prenda. El POS lee ese código con la pistola y encuentra el producto y su talla."
      actions={
        <Link href="/productos">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Volver a productos
          </Button>
        </Link>
      }
    >
      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-danger">
            No se pudo cargar el catálogo: {error.message}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="rounded-lg border bg-white px-3 py-1.5">
              <b>{productos.length}</b> productos
            </span>
            <span className="rounded-lg border bg-white px-3 py-1.5">
              <b>{totalTallas}</b> tallas
            </span>
            <span className="rounded-lg border bg-white px-3 py-1.5">
              <b>{conCodigo}</b> con código de barras cargado
              {totalTallas > conCodigo && (
                <span className="text-amber-700"> · {totalTallas - conCodigo} sin código</span>
              )}
            </span>
          </div>

          <AyudaZebra />
          <SelectorEtiquetas productos={productos} />
        </>
      )}
    </PageShell>
  );
}
