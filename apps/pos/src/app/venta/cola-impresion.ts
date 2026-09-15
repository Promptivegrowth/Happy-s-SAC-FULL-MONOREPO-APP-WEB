'use client';

/**
 * Envío de tickets a la cola de impresión.
 *
 * El POS deja el ticket en la base y el agente de la computadora elegida lo
 * levanta y lo imprime, normalmente en menos de un segundo. El navegador nunca
 * habla con la impresora, así que el driver de Windows deja de decidir el corte
 * y el formato: los decide el propio ticket.
 *
 * Todo acá está pensado para que la ausencia del agente NO impida cobrar. Si no
 * hay equipo configurado o el agente está apagado, el POS cae al PDF de
 * siempre. Nadie se queda sin poder vender porque un programa auxiliar esté
 * caído.
 */

import { createClient } from '@happy/db/browser';

/** Equipo elegido en este navegador; se recuerda para no preguntar cada vez. */
const CLAVE_EQUIPO = 'happy.equipo-impresion';

export type EquipoImpresion = {
  id: string;
  nombre: string;
  almacen_id: string | null;
  activo: boolean;
  ultima_conexion: string | null;
  impresora: string | null;
  impresora_detectada: string | null;
  impresoras_disponibles: string | null;
  /**
   * Milímetros que adelanta el papel antes de cortar, propios de esa ticketera:
   * la cuchilla no está a la misma distancia del cabezal en todos los modelos.
   */
  avance_corte_mm: number | null;
  version_agente: string | null;
};

export function equipoElegido(): string | null {
  try {
    return localStorage.getItem(CLAVE_EQUIPO);
  } catch {
    return null;
  }
}

export function guardarEquipo(id: string | null) {
  try {
    if (id) localStorage.setItem(CLAVE_EQUIPO, id);
    else localStorage.removeItem(CLAVE_EQUIPO);
  } catch {
    /* modo privado o almacenamiento bloqueado */
  }
}

/**
 * Un equipo cuenta como conectado si dio señales en el último minuto.
 *
 * El agente pregunta cada segundo, así que un minuto de silencio ya significa
 * que la computadora está apagada o sin internet.
 */
export function conectado(e: Pick<EquipoImpresion, 'ultima_conexion'>): boolean {
  if (!e?.ultima_conexion) return false;
  return Date.now() - new Date(e.ultima_conexion).getTime() < 60_000;
}

/** Puede imprimir de verdad: está conectado Y encontró una ticketera. */
export function listoParaImprimir(e: EquipoImpresion): boolean {
  return conectado(e) && Boolean(e.impresora || e.impresora_detectada);
}

/**
 * Equipos disponibles. Primero los de la tienda donde está la caja, y dentro de
 * esos, los que están conectados.
 */
export async function equiposDisponibles(almacenId?: string | null): Promise<EquipoImpresion[]> {
  const sb = createClient();
  const { data } = await sb
    .from('equipos_impresion')
    .select('id, nombre, almacen_id, activo, ultima_conexion, impresora, impresora_detectada, impresoras_disponibles, avance_corte_mm, version_agente')
    .eq('activo', true)
    .order('nombre');

  const lista = (data ?? []) as unknown as EquipoImpresion[];
  return lista.sort((a, b) => {
    const mismaTienda = (x: EquipoImpresion) => (almacenId && x.almacen_id === almacenId ? 1 : 0);
    return (
      mismaTienda(b) - mismaTienda(a) ||
      Number(listoParaImprimir(b)) - Number(listoParaImprimir(a)) ||
      a.nombre.localeCompare(b.nombre, 'es')
    );
  });
}

export type ResultadoCola = { ok: true; id: string } | { ok: false; error: string };

/**
 * Deja un ticket esperando a que el agente lo imprima.
 *
 * `contenidoBase64` son los bytes ESC/POS ya armados: el formato vive en el
 * sistema, así que se cambia el diseño del ticket actualizando el ERP, sin
 * reinstalar nada en las computadoras de la tienda.
 */
export async function encolarTicket(
  contenidoBase64: string,
  equipoId: string,
  opciones: { descripcion?: string; comprobanteId?: string | null } = {},
): Promise<ResultadoCola> {
  const sb = createClient();
  const { data: sesion } = await sb.auth.getUser();

  const { data, error } = await sb
    .from('cola_impresion')
    .insert({
      equipo_id: equipoId,
      contenido: contenidoBase64,
      descripcion: opciones.descripcion ?? null,
      comprobante_id: opciones.comprobanteId ?? null,
      creado_por: sesion?.user?.id ?? null,
    } as never)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Espera a que el agente confirme.
 *
 * Sirve para poder decir "impreso" y no solo "enviado": si la ticketera está
 * apagada o sin papel, la cajera tiene que enterarse en el momento y no cuando
 * el cliente ya se fue.
 */
export async function esperarImpresion(
  id: string,
  segundos = 12,
): Promise<'impreso' | 'error' | 'esperando'> {
  const sb = createClient();
  const hasta = Date.now() + segundos * 1000;

  while (Date.now() < hasta) {
    const { data } = await sb
      .from('cola_impresion')
      .select('estado')
      .eq('id', id)
      .maybeSingle();

    const estado = (data as { estado?: string } | null)?.estado;
    if (estado === 'impreso') return 'impreso';
    if (estado === 'error') return 'error';
    await new Promise((r) => setTimeout(r, 700));
  }
  return 'esperando';
}
