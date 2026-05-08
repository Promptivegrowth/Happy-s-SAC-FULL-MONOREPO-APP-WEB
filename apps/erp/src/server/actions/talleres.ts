'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const ESPECIALIDADES = ['CORTE','DECORADO','ESTAMPADO','BORDADO','SUBLIMADO','PLISADO','ACABADO','PLANCHADO','COSTURA','OJAL_BOTON'] as const;

const schema = z.object({
  // Opcional: si está vacío, el server lo autogenera como TAL-NNN
  codigo: z.string().max(20).optional().or(z.literal('')),
  nombre: z.string().min(2).max(200),
  tipo_documento: z.enum(['DNI','RUC','CE','PASAPORTE']).optional().or(z.literal('')),
  numero_documento: z.string().optional().or(z.literal('')),
  direccion: z.string().optional().or(z.literal('')),
  ubigeo: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  contacto_nombre: z.string().optional().or(z.literal('')),
  emite_comprobante: z.boolean().default(false),
  banco: z.string().optional().or(z.literal('')),
  numero_cuenta: z.string().optional().or(z.literal('')),
  notas: z.string().optional().or(z.literal('')),
  calificacion: z.coerce.number().min(0).max(5).default(5),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  const especialidades = fd.getAll('especialidades').filter((e) => ESPECIALIDADES.includes(String(e) as typeof ESPECIALIDADES[number]));
  const data = schema.parse({
    codigo: fd.get('codigo'),
    nombre: fd.get('nombre'),
    tipo_documento: fd.get('tipo_documento') || '',
    numero_documento: fd.get('numero_documento') || '',
    direccion: fd.get('direccion') || '',
    ubigeo: fd.get('ubigeo') || '',
    telefono: fd.get('telefono') || '',
    contacto_nombre: fd.get('contacto_nombre') || '',
    emite_comprobante: fd.get('emite_comprobante') === 'on',
    banco: fd.get('banco') || '',
    numero_cuenta: fd.get('numero_cuenta') || '',
    notas: fd.get('notas') || '',
    calificacion: fd.get('calificacion') || 5,
    activo: fd.get('activo') !== 'off',
  });
  return { ...data, especialidades: especialidades as string[] };
}

function clean(d: ReturnType<typeof parseForm>) {
  return {
    codigo: (d.codigo ?? '').trim().toUpperCase(),
    nombre: d.nombre.trim(),
    tipo_documento: d.tipo_documento || null,
    numero_documento: d.numero_documento || null,
    direccion: d.direccion || null,
    ubigeo: d.ubigeo || null,
    telefono: d.telefono || null,
    contacto_nombre: d.contacto_nombre || null,
    especialidades: (d.especialidades.length > 0 ? d.especialidades : ['COSTURA']) as ('CORTE' | 'COSTURA' | 'BORDADO' | 'ESTAMPADO' | 'SUBLIMADO' | 'PLISADO' | 'DECORADO' | 'ACABADO' | 'PLANCHADO' | 'OJAL_BOTON' | 'TRAZADO' | 'TENDIDO' | 'HABILITADO' | 'CONTROL_CALIDAD' | 'EMBALAJE')[],
    emite_comprobante: d.emite_comprobante,
    banco: d.banco || null,
    numero_cuenta: d.numero_cuenta || null,
    notas: d.notas || null,
    calificacion: d.calificacion,
    activo: d.activo,
  };
}

export async function crearTaller(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const cleaned = clean(data);
    // Auto-código si vino vacío: TAL-NNN con el siguiente correlativo.
    if (!cleaned.codigo) {
      const { data: nro, error: errNro } = await sb.rpc('next_correlativo', { p_clave: 'TALLER', p_padding: 3 });
      if (errNro) throw new Error(errNro.message);
      cleaned.codigo = `TAL-${nro}`;
    }
    const { data: row, error } = await sb.from('talleres').insert(cleaned).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  // Sin redirect server-side: el cliente navega tras el toast con redirectTo
  // del useActionForm. Evita que el redirect interrumpa el toast de éxito.
  if (r.ok) await bumpPaths('/talleres');
  return r;
}

export async function actualizarTaller(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { error } = await sb.from('talleres').update(clean(data)).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/talleres', `/talleres/${id}`);
  return r;
}

/**
 * Soft-delete: marca el taller como activo=false. La navegación post-éxito
 * la hace el cliente (DeleteButton) para evitar que el redirect del server
 * cuelgue el useTransition.
 */
export async function eliminarTaller(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('talleres').update({ activo: false }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/talleres');
  return r;
}
