import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { RecetaEditor } from './editor-client';

export const dynamic = 'force-dynamic';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: receta }, { data: lineas }, { data: materiales }, { data: unidades }] = await Promise.all([
    sb.from('recetas').select('*, productos(id, nombre, codigo)').eq('id', id).single(),
    sb.from('recetas_lineas').select('*, materiales(codigo, nombre, categoria, precio_unitario)').eq('receta_id', id),
    sb.from('materiales').select('id, codigo, nombre, categoria, precio_unitario').eq('activo', true).order('nombre'),
    sb.from('unidades_medida').select('id, codigo, nombre').order('codigo'),
  ]);
  if (!receta) notFound();

  const prod = (receta as unknown as { productos: { id: string; nombre: string; codigo: string } }).productos;

  // Tallas presentes en la receta
  const tallasUsadas = Array.from(new Set((lineas ?? []).map((l) => l.talla))).sort();
  const tallasFaltantes = TALLAS.filter((t) => !tallasUsadas.includes(t));

  return (
    <PageShell
      title={`Receta: ${prod.nombre}`}
      description={`Versión ${receta.version} · ${prod.codigo}`}
      actions={
        <Link href={`/productos/${prod.id}`}>
          <Button variant="outline">Ver producto</Button>
        </Link>
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
              <Badge key={t} variant="outline" className="text-[10px]">{t.replace('T','')}</Badge>
            ))}
          </div>
        </Card>
      </div>

      <RecetaEditor
        recetaId={id}
        materiales={materiales ?? []}
        unidades={unidades ?? []}
        lineas={lineas ?? []}
      />
    </PageShell>
  );
}
