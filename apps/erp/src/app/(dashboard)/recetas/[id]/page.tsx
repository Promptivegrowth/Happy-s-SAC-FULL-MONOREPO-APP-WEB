import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { History } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { RecetaEditor } from './editor-client';
import { obtenerTallasCongeladas } from '@/server/actions/recetas';
import { cargarEmpresaPDF } from '@/server/empresa-pdf-helper';
import { formatTallaChip } from '@happy/lib';

export const dynamic = 'force-dynamic';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD', 'TU'] as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: receta }, { data: lineas }, { data: materiales }, { data: unidades }] = await Promise.all([
    sb.from('recetas').select('*, productos(id, nombre, codigo)').eq('id', id).single(),
    sb.from('recetas_lineas').select('*, materiales(codigo, nombre, categoria, precio_unitario, factor_conversion)').eq('receta_id', id),
    sb.from('materiales').select('id, codigo, nombre, categoria, precio_unitario, factor_conversion, unidad_consumo_id').eq('activo', true).order('nombre'),
    sb.from('unidades_medida').select('id, codigo, nombre').order('codigo'),
  ]);
  if (!receta) notFound();

  const prod = (receta as unknown as { productos: { id: string; nombre: string; codigo: string } }).productos;

  // Carga adicional para los nuevos features: duplicar receta y procesos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const [{ data: productosTodos }, { data: areas }, { data: procesos }, { data: catalogoPasos }] = await Promise.all([
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre').limit(1000),
    sb.from('areas_produccion').select('id, codigo, nombre, valor_minuto').eq('activa', true).order('nombre'),
    sbAny
      .from('productos_procesos')
      .select('id, proceso, area_id, talla, orden, tiempo_estandar_min, es_tercerizado, observacion, descripcion_operativa, version, areas_produccion(id, codigo, nombre, valor_minuto)')
      .eq('producto_id', prod.id)
      .eq('activo', true) // solo la versión vigente (mig 38)
      .order('orden'),
    // Catálogo de pasos operativos por área (mig 61). Solo activos — los
    // inactivos existen para historial pero no aparecen en el dropdown.
    sbAny
      .from('catalogo_pasos_operativos')
      .select('id, area_id, nombre, orden')
      .eq('activo', true)
      .order('area_id')
      .order('orden'),
  ]);

  // Tallas presentes en la receta
  const tallasUsadas = Array.from(new Set((lineas ?? []).map((l) => l.talla))).sort();
  const tallasFaltantes = TALLAS.filter((t) => !tallasUsadas.includes(t));

  // Editabilidad GRANULAR POR TALLA:
  //  - Si la receta es HISTÓRICA (activa=false) → bloqueada siempre. Las
  //    OTs viejas la usaron y modificarla alteraría reportes históricos.
  //  - Si es ACTIVA: se congela SOLO la talla específica que tiene OTs
  //    creadas DESPUÉS de la receta. Las demás tallas siguen editables
  //    (agregar/eliminar líneas) aunque otras tengan OTs. Esto permite
  //    completar tallas faltantes sin necesidad de crear v2.0.
  //  - Las OTs anteriores a la receta no congelan nada (corresponden a
  //    versiones previas del producto).
  const esHistorica = !receta.activa;
  const tallasCongeladas = esHistorica
    ? [...TALLAS] // histórica = todas bloqueadas
    : await obtenerTallasCongeladas(id, prod.id);
  // Cantidad de líneas OT del producto (para mostrar en el banner informativo).
  const { count: cantidadOts } = await sb
    .from('ot_lineas')
    .select('id', { count: 'exact', head: true })
    .eq('producto_id', prod.id);

  // Datos para el PDF de la receta (materiales + procesos). Empresa para el
  // membrete brandeado. Pedido cliente 2026-08-16.
  const empresa = await cargarEmpresaPDF();
  const versionMateriales = (receta.version as string) ?? 'v1.0';
  const versionProcesos = ((procesos ?? [])[0]?.version as string | undefined) ?? 'v1.0';
  const recetaPdfData = {
    producto: prod.nombre,
    codigo: prod.codigo,
    versionMateriales,
    versionProcesos,
    activa: Boolean(receta.activa),
    creadaEn: (receta.created_at as string | null) ?? null,
    materiales: (lineas ?? []).map((l) => {
      const mat = (l as unknown as { materiales: { codigo: string; nombre: string; categoria: string; precio_unitario: number | null; factor_conversion: number | null } | null }).materiales;
      const precio = Number(mat?.precio_unitario ?? 0);
      const factor = Number(mat?.factor_conversion ?? 1) || 1;
      return {
        talla: l.talla as string,
        material: mat?.nombre ?? '(material eliminado)',
        codigo: mat?.codigo ?? '—',
        categoria: mat?.categoria ?? '—',
        cantidad: Number(l.cantidad ?? 0),
        costo: (precio / factor) * Number(l.cantidad ?? 0),
        saleAServicio: Boolean((l as unknown as { sale_a_servicio: boolean | null }).sale_a_servicio),
        saleAOjalBoton: Boolean((l as unknown as { sale_a_ojal_boton: boolean | null }).sale_a_ojal_boton),
      };
    }),
    procesos: ((procesos ?? []) as unknown as Array<{ proceso: string; orden: number | null; talla: string | null; tiempo_estandar_min: number | null; es_tercerizado: boolean | null; areas_produccion: { nombre: string; valor_minuto: number | null } | null }>).map((p) => {
      const tiempo = Number(p.tiempo_estandar_min ?? 0);
      const vm = Number(p.areas_produccion?.valor_minuto ?? 0);
      return {
        orden: Number(p.orden ?? 0),
        proceso: p.proceso,
        area: p.areas_produccion?.nombre ?? '',
        talla: p.talla,
        tiempoMin: tiempo,
        costo: tiempo * vm,
        esTercerizado: Boolean(p.es_tercerizado),
      };
    }),
  };

  return (
    <PageShell
      title={`Receta: ${prod.nombre}`}
      description={`Versión ${receta.version} · ${prod.codigo}`}
      actions={
        <div className="flex items-center gap-2">
          <Link href={`/recetas/${id}/historial`}>
            <Button variant="outline" className="gap-1">
              <History className="h-4 w-4" /> Historial de versiones
            </Button>
          </Link>
          <Link href={`/productos/${prod.id}`}>
            <Button variant="outline">Ver producto</Button>
          </Link>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Líneas BOM</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{(lineas ?? []).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Tallas con receta</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{tallasUsadas.length} / 11</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Estado</p>
          <p className="mt-1">{receta.activa ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Histórica</Badge>}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Tallas faltantes</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {tallasFaltantes.length === 0 ? (
              <Badge variant="success" className="text-[10px]">Todas cubiertas</Badge>
            ) : tallasFaltantes.slice(0, 8).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">{formatTallaChip(t)}</Badge>
            ))}
          </div>
        </Card>
      </div>

      <RecetaEditor
        recetaId={id}
        productoId={prod.id}
        materiales={materiales ?? []}
        unidades={unidades ?? []}
        lineas={lineas ?? []}
        productos={(productosTodos ?? []) as Parameters<typeof RecetaEditor>[0]['productos']}
        areas={(areas ?? []) as Parameters<typeof RecetaEditor>[0]['areas']}
        procesos={(procesos ?? []) as Parameters<typeof RecetaEditor>[0]['procesos']}
        catalogoPasos={(catalogoPasos ?? []) as Parameters<typeof RecetaEditor>[0]['catalogoPasos']}
        tallasCongeladas={tallasCongeladas}
        esHistorica={esHistorica}
        cantidadOts={cantidadOts ?? 0}
        versionMateriales={(receta.version as string) ?? 'v1.0'}
        versionProcesos={((procesos ?? [])[0]?.version as string | undefined) ?? 'v1.0'}
        empresaPdf={empresa}
        pdfData={recetaPdfData}
      />
    </PageShell>
  );
}
