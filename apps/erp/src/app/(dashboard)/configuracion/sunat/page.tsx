import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { PageShell } from '@/components/page-shell';
import { SubmitButton } from '@/components/forms/submit-button';
import { requireRol } from '@/server/session';
import { actualizarSunatConfig } from '@/server/actions/sunat';

async function action(fd: FormData) { 'use server'; await actualizarSunatConfig(null, fd); }
import { ShieldCheck, AlertCircle } from 'lucide-react';

export const metadata = { title: 'Configuración SUNAT' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireRol('gerente');
  const sb = await createClient();
  const { data: empresa } = await sb.from('empresa').select('id, ruc, razon_social').single();
  const { data: cfg } = empresa
    ? await sb.from('sunat_config').select('*').eq('empresa_id', empresa.id).maybeSingle()
    : { data: null };

  const tieneCert = Boolean(cfg?.certificado_pfx_base64);

  return (
    <PageShell
      title="Configuración SUNAT"
      description="Facturación electrónica con certificado digital propio."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">RUC emisor</p>
          <p className="font-mono text-lg font-semibold text-corp-900">{empresa?.ruc ?? '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Ambiente</p>
          <Badge variant={cfg?.ambiente === 'PRODUCCION' ? 'destructive' : 'warning'} className="text-xs">
            {cfg?.ambiente ?? 'NO CONFIGURADO'}
          </Badge>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Certificado digital</p>
          {tieneCert ? (
            <Badge variant="success" className="gap-1"><ShieldCheck className="h-3 w-3" /> Cargado</Badge>
          ) : (
            <Badge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" /> Pendiente</Badge>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <form action={action} className="space-y-6" encType="multipart/form-data">
          <FormSection title="Credenciales SOL">
            <FormGrid cols={2}>
              <FormRow label="Ambiente" required>
                <select name="ambiente" defaultValue={cfg?.ambiente ?? 'BETA'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="BETA">BETA (pruebas)</option>
                  <option value="PRODUCCION">PRODUCCIÓN</option>
                </select>
              </FormRow>
              <FormRow label="Usuario SOL secundario" required hint="Username del usuario SOL creado para emisión electrónica">
                <Input name="usuario_sol" defaultValue={cfg?.usuario_sol ?? ''} required placeholder="MODDATOS / FACTURA01" />
              </FormRow>
              <FormRow label="Clave SOL" required>
                <Input name="clave_sol" type="password" defaultValue={cfg?.clave_sol ?? ''} required placeholder="••••••••" />
              </FormRow>
              <FormRow label="Endpoint factura" required>
                <Input name="endpoint_factura" defaultValue={cfg?.endpoint_factura ?? 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService'} required />
              </FormRow>
            </FormGrid>
          </FormSection>

          <FormSection title="Certificado digital (.pfx / .p12)">
            <FormGrid cols={2}>
              <FormRow label={tieneCert ? 'Reemplazar certificado' : 'Subir certificado'} hint=".pfx o .p12 emitido por una EC autorizada">
                <input
                  name="certificado_pfx"
                  type="file"
                  accept=".pfx,.p12"
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-corp-700 file:px-3 file:py-2 file:text-white"
                />
              </FormRow>
              <FormRow label="Contraseña del certificado" required={!tieneCert}>
                <Input name="certificado_password" type="password" placeholder={tieneCert ? '(no cambiar deja la actual)' : '••••••••'} />
              </FormRow>
            </FormGrid>
          </FormSection>

          <FormSection title="Firmante">
            <FormRow label="Nombre completo del representante legal">
              <Input name="firmante_nombre" defaultValue={cfg?.firmante_nombre ?? ''} placeholder="Para mostrar en el PDF" />
            </FormRow>
          </FormSection>

          <div className="rounded-lg border bg-amber-50 p-4 text-xs text-amber-800">
            <p className="font-semibold">⚠️ Importante</p>
            <p className="mt-1">
              Las claves se almacenan en Supabase. Para producción se recomienda encriptar con pgcrypto y rotar el cert al menos anualmente.
              SUNAT BETA: pruebas con RUC 20000000001/MODDATOS/MODDATOS. Producción requiere usuario SOL real y certificado vigente.
            </p>
          </div>

          <div className="flex justify-end">
            <SubmitButton variant="premium" size="lg">Guardar configuración</SubmitButton>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
