import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { Button } from '@happy/ui/button';
import { FileText } from 'lucide-react';
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
  const [{ data: prod }, { data: cats }, { data: camps }, { data: vars }, { data: pub }, { data: imgs }, { data: extras }, { data: recetaActiva }] = await Promise.all([
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
    // Receta activa (para el botón "Ver receta BOM")
    sb.from('recetas').select('id').eq('producto_id', id).eq('activa', true).maybeSingle(),
  ]);
  if (!prod) notFound();
  const categoriasExtraIniciales = ((extras ?? []) as { categoria_id: string }[]).map((e) => e.categoria_id);

  // Costo de última producción por talla.
  // Definición acordada con el cliente:
  //   1) "Última producción" = última OS CERRADA del producto que incluyó esa talla.
  //   2) Costo = pago al taller (monto_total de la OS) prorrateado por unidad
  //              enviada + costo de materiales del BOM activo (al precio actual).
  //   3) Se muestra por variante (junto al "Costo estándar" en la tabla).
  // Toda la lógica está envuelta en try/catch para no romper la página si
  // alguna tabla devuelve algo inesperado.
  const ultimosCostos = await calcularUltimoCostoPorTalla(sb, id, recetaActiva?.id ?? null);

  async function onDelete() { 'use server'; return eliminarProducto(id); }

  return (
    <PageShell
      title={prod.nombre}
      description={`Código ${prod.codigo} · ficha ${prod.version_ficha}`}
      actions={
        <div className="flex items-center gap-2">
          {recetaActiva?.id && (
            <Link href={`/recetas/${recetaActiva.id}`}>
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" /> Ver receta BOM
              </Button>
            </Link>
          )}
          <DeleteButton action={onDelete} itemName="este producto" />
        </div>
      }
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
          <VariantesSection productoId={id} variantes={vars ?? []} ultimosCostos={ultimosCostos} />
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

// ----------------------------------------------------------------------------
// Costo de última producción por talla (Obs cliente: ver si el costo estándar
// quedó desactualizado vs lo realmente costó la última producción).
// ----------------------------------------------------------------------------
export type CostoUltimaProduccion = {
  /** Costo unitario REAL = pago_taller_unitario + materiales_unitarios */
  costoUnitario: number;
  /** Desglose informativo */
  pagoTaller: number;
  materiales: number;
  /** Trazabilidad: de qué OS viene el dato */
  osNumero: string;
  osFecha: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calcularUltimoCostoPorTalla(sb: any, productoId: string, recetaId: string | null): Promise<Record<string, CostoUltimaProduccion>> {
  const resultado: Record<string, CostoUltimaProduccion> = {};
  try {
    // 1) Todas las líneas de OS CERRADAS de este producto, con monto y total
    //    de unidades enviadas en cada OS (para prorratear).
    //    Ordenamos por fecha desc para que la primera fila por talla sea la más reciente.
    const { data: lineas } = await sb
      .from('ordenes_servicio_lineas')
      .select(`
        talla, cantidad,
        ordenes_servicio!inner(id, numero, monto_total, estado, fecha_recepcion, fecha_emision)
      `)
      .eq('producto_id', productoId)
      .eq('ordenes_servicio.estado', 'CERRADA');
    type Linea = {
      talla: string;
      cantidad: number;
      ordenes_servicio: { id: string; numero: string; monto_total: number; estado: string; fecha_recepcion: string | null; fecha_emision: string | null } | null;
    };
    const lineasOk = ((lineas ?? []) as Linea[]).filter((l) => l.ordenes_servicio);

    if (lineasOk.length === 0) return {}; // sin producción cerrada aún

    // 2) Total unidades por OS (para prorratear el monto_total al unitario).
    const idsOs = Array.from(new Set(lineasOk.map((l) => l.ordenes_servicio!.id)));
    const { data: totalesRaw } = await sb
      .from('ordenes_servicio_lineas')
      .select('os_id, cantidad')
      .in('os_id', idsOs);
    const totalUnidadesPorOs = new Map<string, number>();
    for (const t of (totalesRaw ?? []) as { os_id: string; cantidad: number }[]) {
      totalUnidadesPorOs.set(t.os_id, (totalUnidadesPorOs.get(t.os_id) ?? 0) + Number(t.cantidad ?? 0));
    }

    // 3) Costo de materiales por talla (BOM activo al precio actual).
    //    NO se prorratea — es el costo por unidad de cada talla según receta.
    const materialesPorTalla = new Map<string, number>();
    if (recetaId) {
      const { data: rl } = await sb
        .from('recetas_lineas')
        .select('talla, cantidad, materiales(precio_unitario)')
        .eq('receta_id', recetaId);
      type RL = { talla: string; cantidad: number; materiales: { precio_unitario: number | null } | null };
      for (const l of (rl ?? []) as RL[]) {
        const precio = Number(l.materiales?.precio_unitario ?? 0);
        const cant = Number(l.cantidad ?? 0);
        materialesPorTalla.set(l.talla, (materialesPorTalla.get(l.talla) ?? 0) + precio * cant);
      }
    }

    // 4) Para cada talla, agarrar la línea de OS más reciente y construir el costo.
    //    Ordenamos client-side por fecha_recepcion (o emision si recepción es null).
    const lineasOrdenadas = [...lineasOk].sort((a, b) => {
      const fa = a.ordenes_servicio!.fecha_recepcion ?? a.ordenes_servicio!.fecha_emision ?? '';
      const fb = b.ordenes_servicio!.fecha_recepcion ?? b.ordenes_servicio!.fecha_emision ?? '';
      return fb.localeCompare(fa);
    });

    for (const l of lineasOrdenadas) {
      const t = l.talla as string;
      if (resultado[t]) continue; // ya tenemos la más reciente para esa talla
      const os = l.ordenes_servicio!;
      const totalUnid = totalUnidadesPorOs.get(os.id) ?? 0;
      const pagoTallerUnit = totalUnid > 0 ? Number(os.monto_total ?? 0) / totalUnid : 0;
      const materialesUnit = materialesPorTalla.get(t) ?? 0;
      resultado[t] = {
        costoUnitario: Math.round((pagoTallerUnit + materialesUnit) * 100) / 100,
        pagoTaller: Math.round(pagoTallerUnit * 100) / 100,
        materiales: Math.round(materialesUnit * 100) / 100,
        osNumero: os.numero,
        osFecha: os.fecha_recepcion ?? os.fecha_emision,
      };
    }
    return resultado;
  } catch (e) {
    console.warn('[productos/[id]] no se pudo calcular costo última producción:', (e as Error).message);
    return {};
  }
}
