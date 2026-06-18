import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { FileText, AlertCircle, Shirt, Ruler } from 'lucide-react';
import { obtenerFichaPublica } from '@/server/queries/ficha-publica';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await obtenerFichaPublica(token);
  if ('error' in data) return { title: 'Ficha técnica' };
  return {
    title: `Ficha técnica · ${data.producto.nombre}`,
    description: `Ficha técnica oficial de ${data.producto.nombre} — ${data.empresa?.razon_social ?? 'HAPPY SAC'}`,
  };
}

export default async function FichaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await obtenerFichaPublica(token);

  if ('error' in data) {
    return (
      <main className="container mx-auto max-w-md px-4 py-20">
        <Card className="p-10 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-400" />
          <h1 className="mt-4 font-display text-xl font-semibold text-corp-900">{data.error}</h1>
          <p className="mt-2 text-sm text-slate-500">
            Si necesitás acceder a esta ficha técnica, pedile al vendedor un link actualizado.
          </p>
        </Card>
      </main>
    );
  }

  const { ficha, producto, empresa, medidas, imagenes } = data;
  const delantero = imagenes.find((i) => i.tipo === 'DELANTERO');
  const posterior = imagenes.find((i) => i.tipo === 'POSTERIOR');
  const diagMedidas = imagenes.find((i) => i.tipo === 'MEDIDAS_DIAGRAMA');
  const tallas = Array.from(new Set(medidas.flatMap((m) => m.valores.map((v) => v.talla))));

  return (
    <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Cabecera empresa + producto */}
      <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-4">
          {empresa?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logo_url} alt="" className="h-14 w-auto" />
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{empresa?.nombre_comercial ?? empresa?.razon_social ?? 'HAPPY SAC'}</p>
            <h1 className="font-display text-2xl font-semibold text-corp-900">{producto.nombre}</h1>
            <p className="text-xs text-slate-500">
              Código {producto.codigo}
              {empresa?.ruc && ` · RUC ${empresa.ruc}`}
            </p>
          </div>
        </div>
        <div className="rounded-lg border-2 border-happy-500 px-4 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-happy-700">Ficha técnica</p>
          <p className="font-display text-lg font-semibold text-happy-700">Rev. {ficha.revision}</p>
          {ficha.fecha_aprobacion && (
            <p className="text-[10px] text-slate-500">
              {new Date(ficha.fecha_aprobacion).toLocaleDateString('es-PE')}
            </p>
          )}
        </div>
      </Card>

      {/* Imágenes principales */}
      {(delantero || posterior) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {delantero && (
            <Card className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={delantero.url} alt="Delantero" className="h-80 w-full object-contain bg-slate-50" />
              <p className="border-t border-slate-100 p-2 text-center text-xs text-slate-500">Vista delantera</p>
            </Card>
          )}
          {posterior && (
            <Card className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={posterior.url} alt="Posterior" className="h-80 w-full object-contain bg-slate-50" />
              <p className="border-t border-slate-100 p-2 text-center text-xs text-slate-500">Vista posterior</p>
            </Card>
          )}
        </div>
      )}

      {/* Descripción + composición */}
      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-corp-900">
          <FileText className="h-4 w-4" /> Descripción
        </h2>
        {ficha.descripcion_larga && <p className="text-sm text-slate-700">{ficha.descripcion_larga}</p>}
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          {ficha.temporada && <Dato label="Temporada" value={ficha.temporada} />}
          {ficha.alcance_uso && <Dato label="Uso" value={ficha.alcance_uso} />}
        </div>
      </Card>

      {(ficha.tela_principal_nombre || ficha.tela_secundaria_nombre) && (
        <Card className="space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-corp-900">
            <Shirt className="h-4 w-4" /> Composición textil
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {ficha.tela_principal_nombre && (
              <TelaCard
                titulo="Tela principal"
                nombre={ficha.tela_principal_nombre}
                composicion={ficha.tela_principal_composicion}
                color={ficha.tela_principal_color}
              />
            )}
            {ficha.tela_secundaria_nombre && (
              <TelaCard
                titulo="Tela secundaria"
                nombre={ficha.tela_secundaria_nombre}
                composicion={ficha.tela_secundaria_composicion}
                color={ficha.tela_secundaria_color}
              />
            )}
          </div>
        </Card>
      )}

      {/* Medidas */}
      {medidas.length > 0 && (
        <Card>
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-corp-900">
              <Ruler className="h-4 w-4" /> Cuadro de medidas (cm)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Descripción</TableHead>
                  {tallas.map((t) => <TableHead key={t} className="w-16 text-center">{t}</TableHead>)}
                  <TableHead className="w-16 text-center">Tol ±</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medidas.map((m) => (
                  <TableRow key={m.codigo}>
                    <TableCell className="text-center font-mono text-xs">{m.codigo}</TableCell>
                    <TableCell className="text-sm">{m.descripcion}</TableCell>
                    {tallas.map((t) => {
                      const v = m.valores.find((x) => x.talla === t);
                      return (
                        <TableCell key={t} className="text-center font-mono text-xs">
                          {v?.valor ?? '—'}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center font-mono text-xs text-slate-500">
                      ±{m.tolerancia_cm}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {diagMedidas && (
            <div className="border-t border-slate-100 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={diagMedidas.url} alt="Diagrama medidas" className="mx-auto max-h-96 object-contain" />
              <p className="mt-2 text-center text-xs text-slate-500">Diagrama de medidas</p>
            </div>
          )}
        </Card>
      )}

      {/* Acabados */}
      {ficha.notas_acabados && (
        <Card className="space-y-2 p-5">
          <h2 className="font-display text-base font-semibold text-corp-900">Acabados</h2>
          <p className="text-sm text-slate-700">{ficha.notas_acabados}</p>
        </Card>
      )}

      {/* Pie */}
      <div className="border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        Ficha técnica oficial generada por {empresa?.razon_social ?? 'HAPPY SAC'}
        {empresa?.telefono && ` · Tel ${empresa.telefono}`}
        {empresa?.email && ` · ${empresa.email}`}
      </div>
    </main>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-medium text-corp-900">{value}</p>
    </div>
  );
}

function TelaCard({ titulo, nombre, composicion, color }: { titulo: string; nombre: string; composicion: string | null; color: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <Badge variant="outline" className="mb-2 text-[10px]">{titulo}</Badge>
      <p className="font-display text-sm font-semibold text-corp-900">{nombre}</p>
      {composicion && <p className="text-xs text-slate-600">{composicion}</p>}
      {color && <p className="text-xs text-slate-500">Color: {color}</p>}
    </div>
  );
}
