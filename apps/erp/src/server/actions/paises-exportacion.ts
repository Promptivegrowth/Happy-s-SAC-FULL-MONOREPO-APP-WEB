'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@happy/db/server';
import { requireRol } from '@/server/session';

const paisSchema = z.object({
  codigo_iso: z.string().length(2).regex(/^[A-Z]{2}$/, 'Código ISO alpha-2 (2 letras mayúsculas)'),
  codigo_sunat: z.string().min(1).max(4),
  nombre: z.string().min(1),
  moneda_sugerida: z.enum(['USD', 'EUR', 'PEN']).default('USD'),
  activo: z.boolean().default(true),
  orden: z.number().int().min(0).default(100),
});

export type PaisExportacionInput = z.infer<typeof paisSchema>;

export async function guardarPaisExportacion(input: PaisExportacionInput, esNuevo: boolean) {
  await requireRol('gerente');
  const parsed = paisSchema.parse(input);
  const sb = await createClient();

  if (esNuevo) {
    const { error } = await sb.from('paises_exportacion').insert({
      codigo_iso: parsed.codigo_iso.toUpperCase(),
      codigo_sunat: parsed.codigo_sunat,
      nombre: parsed.nombre,
      moneda_sugerida: parsed.moneda_sugerida,
      activo: parsed.activo,
      orden: parsed.orden,
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb
      .from('paises_exportacion')
      .update({
        codigo_sunat: parsed.codigo_sunat,
        nombre: parsed.nombre,
        moneda_sugerida: parsed.moneda_sugerida,
        activo: parsed.activo,
        orden: parsed.orden,
      })
      .eq('codigo_iso', parsed.codigo_iso.toUpperCase());
    if (error) throw new Error(error.message);
  }

  revalidatePath('/configuracion/paises-exportacion');
}

export async function togglePaisActivo(codigoIso: string, activo: boolean) {
  await requireRol('gerente');
  const sb = await createClient();
  const { error } = await sb.from('paises_exportacion').update({ activo }).eq('codigo_iso', codigoIso);
  if (error) throw new Error(error.message);
  revalidatePath('/configuracion/paises-exportacion');
}

export type PaisExportacionRow = {
  codigo_iso: string;
  codigo_sunat: string;
  nombre: string;
  moneda_sugerida: string;
  activo: boolean;
  orden: number;
  puerto_default: string | null;
  incoterm_default: string | null;
  acuerdo_comercial: string | null;
  certificado_origen_requerido: boolean;
  arancel_preferencial_pct: number;
  iva_pais_destino_pct: number | null;
  observaciones: string | null;
};

export async function listarPaisesExportacion(soloActivos = false): Promise<PaisExportacionRow[]> {
  const sb = await createClient();
  let q = sb
    .from('paises_exportacion')
    .select('codigo_iso, codigo_sunat, nombre, moneda_sugerida, activo, orden, puerto_default, incoterm_default, acuerdo_comercial, certificado_origen_requerido, arancel_preferencial_pct, iva_pais_destino_pct, observaciones')
    .order('orden')
    .order('nombre');
  if (soloActivos) q = q.eq('activo', true);
  const { data } = await q;
  return ((data ?? []) as unknown as Partial<PaisExportacionRow>[]).map((p) => ({
    codigo_iso: p.codigo_iso!,
    codigo_sunat: p.codigo_sunat!,
    nombre: p.nombre!,
    moneda_sugerida: p.moneda_sugerida ?? 'USD',
    activo: p.activo ?? true,
    orden: p.orden ?? 100,
    puerto_default: p.puerto_default ?? null,
    incoterm_default: p.incoterm_default ?? null,
    acuerdo_comercial: p.acuerdo_comercial ?? null,
    certificado_origen_requerido: p.certificado_origen_requerido ?? true,
    arancel_preferencial_pct: Number(p.arancel_preferencial_pct ?? 0),
    iva_pais_destino_pct: p.iva_pais_destino_pct != null ? Number(p.iva_pais_destino_pct) : null,
    observaciones: p.observaciones ?? null,
  }));
}
