import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { MaterialForm } from '@/components/forms/material-form';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarMaterial } from '@/server/actions/materiales';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data }, { data: unidades }, { data: proveedores }, { data: usoLineas }] = await Promise.all([
    sb.from('materiales').select('*').eq('id', id).single(),
    sb.from('unidades_medida').select('id, codigo, nombre').order('codigo'),
    sb.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
    // ¿En qué recetas se usa este material? El cliente pidió (20/07/2026)
    // poder verlo para quitar el material de la receta y recién poder
    // eliminarlo. Se agrupa por receta más abajo.
    sb
      .from('recetas_lineas')
      .select('receta_id, talla, recetas(id, version, activa, productos(id, codigo, nombre))')
      .eq('material_id', id)
      .limit(500),
  ]);
  if (!data) notFound();

  // Agrupar líneas por receta para mostrar "Producto · versión · N tallas"
  type UsoRow = {
    receta_id: string;
    talla: string | null;
    recetas: { id: string; version: string; activa: boolean; productos: { id: string; codigo: string; nombre: string } | null } | null;
  };
  const usoPorReceta = new Map<string, { receta: NonNullable<UsoRow['recetas']>; tallas: number }>();
  for (const l of (usoLineas ?? []) as unknown as UsoRow[]) {
    if (!l.recetas) continue;
    const prev = usoPorReceta.get(l.receta_id);
    if (prev) prev.tallas += 1;
    else usoPorReceta.set(l.receta_id, { receta: l.recetas, tallas: 1 });
  }
  const usos = Array.from(usoPorReceta.values()).sort((a, b) => {
    // Recetas activas primero, luego por nombre de producto
    if (a.receta.activa !== b.receta.activa) return a.receta.activa ? -1 : 1;
    return (a.receta.productos?.nombre ?? '').localeCompare(b.receta.productos?.nombre ?? '', 'es');
  });

  async function onDelete() { 'use server'; return eliminarMaterial(id); }

  return (
    <PageShell
      title={`Editar: ${data.nombre}`}
      description={`Código ${data.codigo} · ${data.categoria}`}
      actions={
        <DeleteButton
          action={onDelete}
          itemName="este material"
          notaExtra="Si el material está en uso (recetas, kardex, compras), no se eliminará: se desactivará y dejará de aparecer en búsquedas."
        />
      }
    >
      <MaterialForm initial={data} unidades={unidades ?? []} proveedores={proveedores ?? []} />

      {/* ¿Dónde se usa? — permite al usuario ir a cada receta, quitar el
          material ahí y recién entonces poder eliminarlo de verdad. */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-400" />
            <h2 className="font-display text-base font-semibold text-corp-900">
              Usado en recetas {usos.length > 0 && <span className="text-slate-400">({usos.length})</span>}
            </h2>
          </div>
          {usos.length === 0 ? (
            <p className="text-sm text-slate-500">
              Este material no está en ninguna receta. Se puede eliminar sin problema
              (salvo que tenga movimientos de kardex, compras o traslados).
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">
                Para poder eliminar este material, primero quítelo de estas recetas
                (o reemplácelo por el material correcto en cada una).
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Receta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Tallas con este material</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usos.map(({ receta, tallas }) => (
                    <TableRow key={receta.id}>
                      <TableCell>
                        <Link href={`/recetas/${receta.id}`} className="font-medium text-corp-900 hover:text-happy-600 hover:underline">
                          {receta.productos?.nombre ?? '—'}
                        </Link>
                        <span className="ml-2 text-xs text-slate-400">{receta.productos?.codigo}</span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{receta.version}</TableCell>
                      <TableCell>
                        {receta.activa
                          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Activa</Badge>
                          : <Badge variant="secondary">Versión antigua</Badge>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{tallas}</TableCell>
                      <TableCell>
                        <Link href={`/recetas/${receta.id}`} title="Abrir receta">
                          <ExternalLink className="h-4 w-4 text-slate-400 hover:text-happy-600" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
