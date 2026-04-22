import { createClient } from '@happy/db/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';

export const metadata = { title: 'Configuración' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  await requireRol('gerente');
  const sb = await createClient();
  const { data: empresa } = await sb.from('empresa').select('*').single();
  const { data: cfg } = await sb.from('configuracion').select('*');

  return (
    <PageShell title="Configuración" description="Datos de la empresa, parámetros del sistema, integraciones.">
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
