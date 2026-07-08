import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { Ruler, Receipt, Factory, Tags, FileText, Globe, Warehouse } from 'lucide-react';

export const metadata = { title: 'Configuración' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  await requireRol('gerente');
  const sb = await createClient();
  const { data: empresa } = await sb.from('empresa').select('*').single();
  const { data: cfg } = await sb.from('configuracion').select('*');

  return (
    <PageShell title="Configuración" description="Datos de la empresa, parámetros del sistema, integraciones.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/configuracion/unidades">
          <Card className="group cursor-pointer transition hover:-translate-y-0.5 hover:border-happy-300 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-happy-50 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                <Ruler className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">Unidades de medida</p>
                <p className="text-xs text-slate-500">Gestionar unidades de compra y consumo</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/configuracion/tarifas-servicios">
          <Card className="group cursor-pointer transition hover:-translate-y-0.5 hover:border-happy-300 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-happy-50 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                <Tags className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">Tarifas de servicios</p>
                <p className="text-xs text-slate-500">Tarifa central por proceso/producto/talla — vale para todos los talleres</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/configuracion/areas">
          <Card className="group cursor-pointer transition hover:-translate-y-0.5 hover:border-happy-300 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-happy-50 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                <Factory className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">Áreas de producción</p>
                <p className="text-xs text-slate-500">Tarifa por minuto y catálogo de áreas</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/configuracion/sunat">
          <Card className="group cursor-pointer transition hover:-translate-y-0.5 hover:border-happy-300 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-happy-50 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                <Receipt className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">SUNAT</p>
                <p className="text-xs text-slate-500">Credenciales SOL, certificado digital, ambiente</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/configuracion/series">
          <Card className="group cursor-pointer transition hover:-translate-y-0.5 hover:border-happy-300 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-happy-50 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">Series de comprobantes</p>
                <p className="text-xs text-slate-500">Boleta, factura, factura de exportación</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/configuracion/almacenes">
          <Card className="group cursor-pointer transition hover:-translate-y-0.5 hover:border-happy-300 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-happy-50 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                <Warehouse className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">Almacenes</p>
                <p className="text-xs text-slate-500">Umbral de stock bajo por almacén</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/configuracion/paises-exportacion">
          <Card className="group cursor-pointer transition hover:-translate-y-0.5 hover:border-happy-300 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-happy-50 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                <Globe className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">Países de exportación</p>
                <p className="text-xs text-slate-500">Ecuador, Chile, Venezuela + agregar más</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
            <CardDescription>Datos fiscales que aparecen en comprobantes SUNAT</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Razón Social" value={empresa?.razon_social} />
            <Row label="Nombre Comercial" value={empresa?.nombre_comercial} />
            <Row label="RUC" value={empresa?.ruc} />
            <Row label="Dirección" value={empresa?.direccion_fiscal} />
            <Row label="Email" value={empresa?.email} />
            <Row label="Teléfono" value={empresa?.telefono} />
            <Row label="IGV" value={`${empresa?.igv_porcentaje}%`} />
            <Row label="Zona horaria" value={empresa?.zona_horaria} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parámetros</CardTitle>
            <CardDescription>Ajustes globales editables</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {cfg?.map((c) => (
              <div key={c.clave} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{c.clave}</p>
                  <p className="text-xs text-slate-500">{c.descripcion}</p>
                </div>
                <Badge variant="outline" className="max-w-[200px] truncate font-mono text-[10px]">
                  {JSON.stringify(c.valor)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between border-b pb-1 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value ?? '—'}</span>
    </div>
  );
}
