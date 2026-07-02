import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { listarPaisesExportacion } from '@/server/actions/paises-exportacion';
import { PaisEditor } from './pais-editor';

export const metadata = { title: 'Países de exportación' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireRol('gerente');
  const paises = await listarPaisesExportacion(false);

  return (
    <PageShell
      title="Países de exportación"
      description="Catálogo de países a los que exportamos (SUNAT catálogo 04)."
      actions={<PaisEditor pais={null} />}
    >
      <Card className="p-4 text-xs text-slate-600">
        <p>
          <strong>Norma peruana:</strong> El código país usado en la factura de exportación electrónica
          proviene del catálogo <code className="rounded bg-slate-100 px-1 font-mono">04</code> de SUNAT.
          Los códigos precargados (Ecuador 218, Chile 152, Venezuela 862) son los oficiales.
          Al agregar un país nuevo consultá el catálogo actualizado en SUNAT antes de operar.
        </p>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bandera</TableHead>
              <TableHead>País</TableHead>
              <TableHead>ISO</TableHead>
              <TableHead>Código SUNAT</TableHead>
              <TableHead>Moneda sugerida</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paises.map((p) => (
              <TableRow key={p.codigo_iso}>
                <TableCell className="text-2xl">{banderaFromIso(p.codigo_iso)}</TableCell>
                <TableCell className="font-semibold">{p.nombre}</TableCell>
                <TableCell className="font-mono text-xs">{p.codigo_iso}</TableCell>
                <TableCell className="font-mono text-xs">{p.codigo_sunat}</TableCell>
                <TableCell><Badge variant="outline">{p.moneda_sugerida}</Badge></TableCell>
                <TableCell>
                  {p.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="warning">Inactivo</Badge>}
                </TableCell>
                <TableCell className="text-right"><PaisEditor pais={p} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </PageShell>
  );
}

// Convierte código ISO alpha-2 a emoji de bandera (U+1F1E6 + offset).
function banderaFromIso(iso: string): string {
  if (iso.length !== 2) return '🌍';
  const base = 0x1f1e6;
  const A = 'A'.charCodeAt(0);
  return String.fromCodePoint(base + iso.charCodeAt(0) - A, base + iso.charCodeAt(1) - A);
}
