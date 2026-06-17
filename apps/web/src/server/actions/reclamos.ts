'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@happy/db/service';

/**
 * Server action pública para registrar un reclamo desde la web del consumidor
 * (`apps/web/src/app/libro-de-reclamaciones`). El staff la consume vía la
 * acción equivalente en `apps/erp/src/server/actions/reclamos.ts`; esta vive
 * en el bundle público para no acoplar `apps/web` con `apps/erp`.
 *
 * - No requiere sesión (consumidor anónimo).
 * - Usa service client (bypass RLS).
 * - Captura IP + user-agent del request automáticamente.
 * - Genera correlativo vía RPC `generar_numero_reclamo` (formato REC-YYMMDD-NNNN);
 *   si no existe, cae a `next_correlativo` con clave 'RECLAMACION'.
 *
 * Devuelve `{ ok: true, id, numero }` para que la confirmación pueda generar
 * el PDF de comprobante.
 */

// Solo los valores del enum tipo_documento_identidad. 'OTRO' no existe en BD.
const TIPOS_DOC = ['DNI', 'RUC', 'CE', 'PASAPORTE'] as const;
const TIPOS_BIEN = ['PRODUCTO', 'SERVICIO'] as const;
const TIPOS_RECLAMO = ['RECLAMO', 'QUEJA'] as const;

const schema = z.object({
  tipo: z.enum(TIPOS_RECLAMO),
  cliente_nombre: z.string().min(2, 'Nombre requerido').max(200),
  cliente_documento_tipo: z.enum(TIPOS_DOC),
  cliente_documento_numero: z.string().min(6, 'Documento inválido').max(20),
  cliente_telefono: z.string().min(6, 'Teléfono requerido').max(20),
  cliente_email: z.string().email('Email inválido'),
  cliente_direccion: z.string().min(5, 'Dirección requerida').max(300),
  cliente_ubigeo: z.string().max(10).optional().or(z.literal('')),
  es_menor_edad: z.boolean().default(false),
  apoderado_nombre: z.string().max(200).optional().or(z.literal('')),
  apoderado_documento: z.string().max(20).optional().or(z.literal('')),
  tipo_bien: z.enum(TIPOS_BIEN),
  monto_reclamado: z.coerce.number().min(0).optional(),
  venta_id: z.string().uuid().optional().or(z.literal('')),
  pedido_web_id: z.string().uuid().optional().or(z.literal('')),
  descripcion: z.string().min(10, 'La descripción debe tener al menos 10 caracteres').max(4000),
  pedido_consumidor: z.string().min(5, 'Indique qué solución espera').max(2000),
  acepta_terminos: z.literal(true, {
    errorMap: () => ({ message: 'Debe aceptar los términos para continuar' }),
  }),
});

export type CrearReclamoPublicoInput = z.input<typeof schema>;

export type CrearReclamoResult =
  | { ok: true; id: string; numero: string }
  | { ok: false; error: string };

export async function crearReclamoPublico(
  input: CrearReclamoPublicoInput,
): Promise<CrearReclamoResult> {
  let data: z.infer<typeof schema>;
  try {
    data = schema.parse(input);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.errors[0];
      const campo = first?.path.join('.') || 'datos';
      return { ok: false, error: `Datos inválidos · ${campo}: ${first?.message ?? ''}` };
    }
    return { ok: false, error: (e as Error).message };
  }

  if (data.es_menor_edad) {
    if (!data.apoderado_nombre || data.apoderado_nombre.trim().length < 2) {
      return {
        ok: false,
        error: 'Si el consumidor es menor de edad, debe indicar el nombre del apoderado',
      };
    }
  }

  const sb = createServiceClient();
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip')?.trim() ??
    null;
  const ua = h.get('user-agent') ?? null;

  // Correlativo: primero el RPC dedicado, si falla, fallback.
  let numero: string | null = null;
  const { data: nro1, error: errNro1 } = await sb.rpc('generar_numero_reclamo');
  if (!errNro1 && typeof nro1 === 'string' && nro1.length > 0) {
    numero = nro1;
  } else {
    const { data: nro2, error: errNro2 } = await sb.rpc('next_correlativo', {
      p_clave: 'RECLAMACION',
      p_padding: 6,
    });
    if (errNro2) {
      return { ok: false, error: `No se pudo generar número de reclamo: ${errNro2.message}` };
    }
    numero = `REC-${nro2}`;
  }
  if (!numero) numero = `REC-${Date.now()}`;

  const { data: row, error } = await sb
    .from('reclamos')
    .insert({
      numero,
      tipo: data.tipo,
      cliente_nombre: data.cliente_nombre.trim(),
      cliente_documento_tipo: data.cliente_documento_tipo,
      cliente_documento_numero: data.cliente_documento_numero.trim(),
      cliente_telefono: data.cliente_telefono.trim(),
      cliente_email: data.cliente_email.trim().toLowerCase(),
      cliente_direccion: data.cliente_direccion.trim(),
      cliente_ubigeo: data.cliente_ubigeo?.trim() || null,
      es_menor_edad: data.es_menor_edad,
      apoderado_nombre: data.apoderado_nombre?.trim() || null,
      apoderado_documento: data.apoderado_documento?.trim() || null,
      tipo_bien: data.tipo_bien,
      monto_reclamado: data.monto_reclamado ?? null,
      venta_id: data.venta_id || null,
      pedido_web_id: data.pedido_web_id || null,
      descripcion: data.descripcion.trim(),
      pedido_consumidor: data.pedido_consumidor.trim(),
      acepta_terminos: true,
      ip_consumidor: ip,
      user_agent: ua,
      estado: 'NUEVO',
    })
    .select('id, numero')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/libro-de-reclamaciones');
  return { ok: true, id: row.id as string, numero: row.numero as string };
}

/**
 * Devuelve los datos del reclamo recién creado para que la pantalla de
 * confirmación arme el PDF de comprobante (jspdf vive en el cliente).
 */
export type ReclamoConfirmacion = {
  id: string;
  numero: string;
  fecha: string;
  tipo: 'RECLAMO' | 'QUEJA';
  estado: string;
  tipo_bien: string | null;
  monto_reclamado: number | null;
  cliente_nombre: string;
  cliente_documento_tipo: string;
  cliente_documento_numero: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_direccion: string | null;
  cliente_ubigeo: string | null;
  es_menor_edad: boolean;
  apoderado_nombre: string | null;
  apoderado_documento: string | null;
  descripcion: string;
  pedido_consumidor: string | null;
};

export async function obtenerReclamoConfirmacion(
  id: string,
): Promise<{ ok: true; data: ReclamoConfirmacion } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: 'Id requerido' };
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('reclamos')
    .select(
      'id, numero, fecha, tipo, estado, tipo_bien, monto_reclamado, cliente_nombre, cliente_documento_tipo, cliente_documento_numero, cliente_telefono, cliente_email, cliente_direccion, cliente_ubigeo, es_menor_edad, apoderado_nombre, apoderado_documento, descripcion, pedido_consumidor',
    )
    .eq('id', id)
    .single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Reclamo no encontrado' };

  return {
    ok: true,
    data: {
      id: data.id as string,
      numero: data.numero as string,
      fecha: data.fecha as string,
      tipo: data.tipo as 'RECLAMO' | 'QUEJA',
      estado: data.estado as string,
      tipo_bien: (data.tipo_bien as string | null) ?? null,
      monto_reclamado:
        data.monto_reclamado != null ? Number(data.monto_reclamado) : null,
      cliente_nombre: data.cliente_nombre as string,
      cliente_documento_tipo: data.cliente_documento_tipo as string,
      cliente_documento_numero: data.cliente_documento_numero as string,
      cliente_telefono: (data.cliente_telefono as string | null) ?? null,
      cliente_email: (data.cliente_email as string | null) ?? null,
      cliente_direccion: (data.cliente_direccion as string | null) ?? null,
      cliente_ubigeo: (data.cliente_ubigeo as string | null) ?? null,
      es_menor_edad: Boolean(data.es_menor_edad),
      apoderado_nombre: (data.apoderado_nombre as string | null) ?? null,
      apoderado_documento: (data.apoderado_documento as string | null) ?? null,
      descripcion: data.descripcion as string,
      pedido_consumidor: (data.pedido_consumidor as string | null) ?? null,
    },
  };
}
