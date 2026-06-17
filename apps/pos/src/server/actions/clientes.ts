'use server';

/**
 * Búsqueda + creación rápida de clientes desde el POS.
 *
 * Diseño: el cajero debe poder vender SIN exigir datos completos
 * (muchos clientes solo dan nombre y DNI). Por eso el "crearRapido" sólo
 * requiere documento + nombre; el resto es opcional y se completa después
 * desde el ERP en /clientes/[id].
 */

import { z } from 'zod';
import { createClient } from '@happy/db/server';

export type ClienteRow = {
  id: string;
  tipo_documento: 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';
  numero_documento: string;
  razon_social: string | null;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  nombre_para_mostrar: string;
};

function armarNombreParaMostrar(c: {
  razon_social: string | null;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
}): string {
  if (c.razon_social) return c.razon_social;
  return [c.nombres, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ').trim() || '—';
}

// ============================================================================
// BUSCAR CLIENTES (por DNI/RUC exacto o nombre parcial)
// ============================================================================
export async function buscarClientesPOS(q: string): Promise<ClienteRow[]> {
  const query = (q ?? '').trim();
  if (query.length < 2) return [];

  const sb = await createClient();
  const esNumero = /^\d+$/.test(query);

  // Si parece documento (solo dígitos), buscar por documento; sino por nombre.
  let req = sb
    .from('clientes')
    .select('id, tipo_documento, numero_documento, razon_social, nombres, apellido_paterno, apellido_materno, telefono, email, direccion')
    .eq('activo', true)
    .limit(20);

  if (esNumero) {
    req = req.ilike('numero_documento', `${query}%`);
  } else {
    // Búsqueda OR sobre los 4 campos de nombre (case insensitive)
    req = req.or(
      `razon_social.ilike.%${query}%,nombres.ilike.%${query}%,apellido_paterno.ilike.%${query}%,apellido_materno.ilike.%${query}%`,
    );
  }

  const { data, error } = await req;
  if (error) {
    console.warn('[buscarClientesPOS]', error.message);
    return [];
  }
  return ((data ?? []) as Omit<ClienteRow, 'nombre_para_mostrar'>[]).map((c) => ({
    ...c,
    nombre_para_mostrar: armarNombreParaMostrar(c),
  }));
}

// ============================================================================
// CREAR CLIENTE RÁPIDO (datos mínimos)
// ============================================================================
const crearRapidoSchema = z.object({
  tipo_documento: z.enum(['DNI', 'RUC', 'CE', 'PASAPORTE']),
  numero_documento: z.string().trim().min(4).max(20),
  nombre_completo: z.string().trim().min(2),
  telefono: z.string().trim().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  direccion: z.string().trim().optional().or(z.literal('')),
});

export async function crearClienteRapidoPOS(
  input: z.input<typeof crearRapidoSchema>,
): Promise<{ ok: true; cliente: ClienteRow } | { ok: false; error: string }> {
  try {
    const data = crearRapidoSchema.parse(input);
    const sb = await createClient();

    // Si ya existe con ese documento, lo retornamos en vez de duplicar.
    const { data: existente } = await sb
      .from('clientes')
      .select('id, tipo_documento, numero_documento, razon_social, nombres, apellido_paterno, apellido_materno, telefono, email, direccion')
      .eq('tipo_documento', data.tipo_documento)
      .eq('numero_documento', data.numero_documento.trim())
      .maybeSingle();
    if (existente) {
      return {
        ok: true,
        cliente: { ...existente, nombre_para_mostrar: armarNombreParaMostrar(existente) },
      };
    }

    // Split heurístico para DNI: "Juan Pérez Gómez" → nombres="Juan", ap_pat="Pérez", ap_mat="Gómez"
    const nombre = data.nombre_completo.trim();
    let razon_social: string | null = null;
    let nombres: string | null = null;
    let ap_pat: string | null = null;
    let ap_mat: string | null = null;
    if (data.tipo_documento === 'RUC') {
      razon_social = nombre;
    } else {
      const partes = nombre.split(/\s+/);
      if (partes.length >= 3) {
        ap_pat = partes[partes.length - 2] ?? null;
        ap_mat = partes[partes.length - 1] ?? null;
        nombres = partes.slice(0, partes.length - 2).join(' ');
      } else if (partes.length === 2) {
        nombres = partes[0]!;
        ap_pat = partes[1]!;
      } else {
        nombres = nombre;
      }
    }

    const tipoCliente: 'PUBLICO_FINAL' | 'MAYORISTA_A' = data.tipo_documento === 'RUC' ? 'MAYORISTA_A' : 'PUBLICO_FINAL';
    const insertPayload = {
      tipo_documento: data.tipo_documento,
      numero_documento: data.numero_documento.trim(),
      tipo_cliente: tipoCliente,
      razon_social,
      nombres,
      apellido_paterno: ap_pat,
      apellido_materno: ap_mat,
      telefono: data.telefono || null,
      email: data.email || null,
      direccion: data.direccion || null,
      activo: true,
    };
    const { data: nuevo, error } = await sb
      .from('clientes')
      .insert(insertPayload)
      .select('id, tipo_documento, numero_documento, razon_social, nombres, apellido_paterno, apellido_materno, telefono, email, direccion')
      .single();
    if (error) return { ok: false, error: `BD: ${error.message}` };
    return {
      ok: true,
      cliente: { ...nuevo, nombre_para_mostrar: armarNombreParaMostrar(nuevo) },
    };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues.map((i) => i.message).join(' · ') };
    }
    return { ok: false, error: (e as Error).message };
  }
}

// ============================================================================
// ACTUALIZAR CLIENTE (campos parciales — para completar desde POS)
// ============================================================================
const actualizarSchema = z.object({
  nombre_completo: z.string().trim().min(2).optional(),
  telefono: z.string().trim().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  direccion: z.string().trim().optional().or(z.literal('')),
});

export async function actualizarClientePOS(
  id: string,
  input: z.input<typeof actualizarSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const data = actualizarSchema.parse(input);
    const sb = await createClient();

    const update: {
      razon_social?: string | null;
      nombres?: string | null;
      apellido_paterno?: string | null;
      apellido_materno?: string | null;
      telefono?: string | null;
      email?: string | null;
      direccion?: string | null;
    } = {};
    if (data.telefono !== undefined) update.telefono = data.telefono || null;
    if (data.email !== undefined) update.email = data.email || null;
    if (data.direccion !== undefined) update.direccion = data.direccion || null;

    if (data.nombre_completo) {
      // Aplicar mismo split que en creación
      const { data: prev } = await sb.from('clientes').select('tipo_documento').eq('id', id).single();
      if (prev?.tipo_documento === 'RUC') {
        update.razon_social = data.nombre_completo;
        update.nombres = null;
        update.apellido_paterno = null;
        update.apellido_materno = null;
      } else {
        const partes = data.nombre_completo.split(/\s+/);
        if (partes.length >= 3) {
          update.apellido_paterno = partes[partes.length - 2] ?? null;
          update.apellido_materno = partes[partes.length - 1] ?? null;
          update.nombres = partes.slice(0, partes.length - 2).join(' ');
        } else if (partes.length === 2) {
          update.nombres = partes[0]!;
          update.apellido_paterno = partes[1]!;
          update.apellido_materno = null;
        } else {
          update.nombres = data.nombre_completo;
          update.apellido_paterno = null;
          update.apellido_materno = null;
        }
        update.razon_social = null;
      }
    }

    if (Object.keys(update).length === 0) return { ok: true };

    const { error } = await sb.from('clientes').update(update).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues.map((i) => i.message).join(' · ') };
    }
    return { ok: false, error: (e as Error).message };
  }
}
