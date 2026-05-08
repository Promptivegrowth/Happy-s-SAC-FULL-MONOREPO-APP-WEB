'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TIPOS_OPERARIO = ['OPERARIO','AYUDANTE','SUPERVISOR','JEFE_AREA','ADMINISTRATIVO','SERVICIO'] as const;
const TIPOS_CONTRATO = ['PLANILLA','DESTAJO','MIXTO','HONORARIOS'] as const;
const DIAS = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM'] as const;

const schema = z.object({
  codigo: z.string().max(20).optional().or(z.literal('')),
  nombres: z.string().min(2).max(120),
  apellido_paterno: z.string().max(80).optional().or(z.literal('')),
  apellido_materno: z.string().max(80).optional().or(z.literal('')),
  dni: z.string().regex(/^\d{8}$/, 'DNI debe tener 8 dígitos').optional().or(z.literal('')),
  telefono: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  area_id: z.string().uuid().optional().or(z.literal('')),
  tipo_operario: z.enum(TIPOS_OPERARIO).default('OPERARIO'),
  tipo_contrato: z.enum(TIPOS_CONTRATO).optional().or(z.literal('')),
  tarifa_destajo: z.coerce.number().nonnegative().optional().or(z.literal('')),
  sueldo_base: z.coerce.number().nonnegative().optional().or(z.literal('')),
  fecha_ingreso: z.string().min(8).optional().or(z.literal('')),
  jornada_personalizada: z.boolean().default(false),
  jornada_inicio: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
  jornada_fin: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
  notas: z.string().max(500).optional().or(z.literal('')),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  const dias = fd.getAll('jornada_dias').filter((d) => DIAS.includes(String(d) as typeof DIAS[number])) as string[];
  const data = schema.parse({
    codigo: fd.get('codigo') || '',
    nombres: fd.get('nombres') || '',
    apellido_paterno: fd.get('apellido_paterno') || '',
    apellido_materno: fd.get('apellido_materno') || '',
    dni: fd.get('dni') || '',
    telefono: fd.get('telefono') || '',
    email: fd.get('email') || '',
    area_id: fd.get('area_id') || '',
    tipo_operario: (fd.get('tipo_operario') || 'OPERARIO') as (typeof TIPOS_OPERARIO)[number],
    tipo_contrato: fd.get('tipo_contrato') || '',
    tarifa_destajo: fd.get('tarifa_destajo') || '',
    sueldo_base: fd.get('sueldo_base') || '',
    fecha_ingreso: fd.get('fecha_ingreso') || '',
    jornada_personalizada: fd.get('jornada_personalizada') === 'on',
    jornada_inicio: fd.get('jornada_inicio') || '',
    jornada_fin: fd.get('jornada_fin') || '',
    notas: fd.get('notas') || '',
    activo: fd.get('activo') !== 'off',
  });
  return { ...data, jornada_dias: dias };
}

function clean(d: ReturnType<typeof parseForm>) {
  return {
    codigo: (d.codigo ?? '').trim().toUpperCase(),
    nombres: d.nombres.trim(),
    apellido_paterno: d.apellido_paterno || null,
    apellido_materno: d.apellido_materno || null,
    dni: d.dni || null,
    telefono: d.telefono || null,
    email: d.email || null,
    area_id: d.area_id || null,
    tipo_operario: d.tipo_operario,
    tipo_contrato: (d.tipo_contrato || null) as (typeof TIPOS_CONTRATO)[number] | null,
    tarifa_destajo: d.tarifa_destajo === '' ? null : Number(d.tarifa_destajo),
    sueldo_base: d.sueldo_base === '' ? null : Number(d.sueldo_base),
    fecha_ingreso: d.fecha_ingreso || null,
    jornada_personalizada: d.jornada_personalizada,
    jornada_inicio: d.jornada_personalizada ? (d.jornada_inicio || null) : null,
    jornada_fin: d.jornada_personalizada ? (d.jornada_fin || null) : null,
    jornada_dias: d.jornada_personalizada && d.jornada_dias.length > 0 ? d.jornada_dias : null,
    notas: d.notas || null,
    activo: d.activo,
  };
}

export async function crearOperario(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const cleaned = clean(data);
    if (!cleaned.codigo) {
      const { data: nro, error: errNro } = await sb.rpc('next_correlativo', { p_clave: 'OPERARIO', p_padding: 3 });
      if (errNro) throw new Error(errNro.message);
      cleaned.codigo = `OP-${nro}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny.from('operarios').insert(cleaned).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) { await bumpPaths('/operarios'); redirect('/operarios'); }
  return r;
}

export async function actualizarOperario(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('operarios').update(clean(data)).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) { await bumpPaths('/operarios', `/operarios/${id}`); redirect('/operarios'); }
  return r;
}

/** Soft-delete: marca activo=false y setea fecha_salida. */
export async function eliminarOperario(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('operarios')
      .update({ activo: false, fecha_salida: new Date().toISOString().slice(0, 10) })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/operarios');
  return r;
}
