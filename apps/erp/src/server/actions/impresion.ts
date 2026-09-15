'use server';

/**
 * Computadoras con ticketera (agente de impresión).
 *
 * Cada caja que imprime tickets tiene acá una fila. El `token` es el código que
 * se pega en el instalador del agente: identifica a esa computadora y no abre
 * nada más que su propia cola de impresión.
 */

import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import { z } from 'zod';

export type EquipoImpresionDTO = {
  id: string;
  nombre: string;
  token: string;
  almacen_id: string | null;
  almacen_nombre: string | null;
  impresora: string | null;
  impresora_detectada: string | null;
  impresoras_disponibles: string[];
  avance_corte_mm: number;
  ultima_conexion: string | null;
  version_agente: string | null;
  activo: boolean;
  /** Dio señales en el último minuto: el agente pregunta cada segundo. */
  conectado: boolean;
  /** Conectado Y con una ticketera encontrada: puede imprimir de verdad. */
  listo: boolean;
};

async function soloGerencia() {
  const { sb, userId } = await requireUser();
  const { data: roles } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', userId);
  const esGerente = (roles ?? []).some((r) => (r as { rol: string }).rol === 'gerente');
  if (!esGerente) throw new Error('Solo gerencia puede configurar las ticketeras.');
  return { sb, userId };
}

const UN_MINUTO = 60_000;

function aDTO(fila: Record<string, unknown>): EquipoImpresionDTO {
  const ultima = (fila.ultima_conexion as string | null) ?? null;
  const conectado = Boolean(ultima) && Date.now() - new Date(ultima!).getTime() < UN_MINUTO;
  const impresora = (fila.impresora as string | null) ?? null;
  const detectada = (fila.impresora_detectada as string | null) ?? null;
  const almacen = fila.almacenes as { nombre?: string } | null | undefined;

  return {
    id: fila.id as string,
    nombre: fila.nombre as string,
    token: fila.token as string,
    almacen_id: (fila.almacen_id as string | null) ?? null,
    almacen_nombre: almacen?.nombre ?? null,
    impresora,
    impresora_detectada: detectada,
    impresoras_disponibles: String(fila.impresoras_disponibles ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    avance_corte_mm: Number(fila.avance_corte_mm ?? 15),
    ultima_conexion: ultima,
    version_agente: (fila.version_agente as string | null) ?? null,
    activo: Boolean(fila.activo),
    conectado,
    listo: conectado && Boolean(impresora || detectada),
  };
}

export async function listarEquiposImpresion(): Promise<EquipoImpresionDTO[]> {
  const { sb } = await requireUser();
  const { data } = await sb
    .from('equipos_impresion')
    .select('id, nombre, token, almacen_id, impresora, impresora_detectada, impresoras_disponibles, avance_corte_mm, ultima_conexion, version_agente, activo, almacenes:almacen_id(nombre)')
    .order('nombre');
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(aDTO);
}

const EsquemaNuevo = z.object({
  nombre: z.string().trim().min(2, 'Ponle un nombre que identifique la computadora').max(60),
  almacen_id: z.string().uuid().nullable().optional(),
});

export async function crearEquipoImpresion(
  entrada: z.infer<typeof EsquemaNuevo>,
): Promise<ActionResult<EquipoImpresionDTO>> {
  const r = await runAction(async () => {
    const { sb } = await soloGerencia();
    const datos = EsquemaNuevo.parse(entrada);

    const { data, error } = await sb
      .from('equipos_impresion')
      .insert({ nombre: datos.nombre, almacen_id: datos.almacen_id ?? null } as never)
      .select('id, nombre, token, almacen_id, impresora, impresora_detectada, impresoras_disponibles, avance_corte_mm, ultima_conexion, version_agente, activo, almacenes:almacen_id(nombre)')
      .single();

    if (error) throw new Error(error.message);
    return aDTO(data as unknown as Record<string, unknown>);
  });
  if (r.ok) await bumpPaths('/configuracion/impresion');
  return r;
}

const EsquemaEditar = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(2).max(60).optional(),
  almacen_id: z.string().uuid().nullable().optional(),
  /** Vacío = que el agente elija sola la ticketera. */
  impresora: z.string().trim().max(200).nullable().optional(),
  avance_corte_mm: z.number().min(5, 'Menos de 5 mm y la cuchilla corta el texto')
    .max(40, 'Más de 40 mm es regalar papel').optional(),
  activo: z.boolean().optional(),
});

export async function actualizarEquipoImpresion(
  entrada: z.infer<typeof EsquemaEditar>,
): Promise<ActionResult<EquipoImpresionDTO>> {
  const r = await runAction(async () => {
    const { sb } = await soloGerencia();
    const { id, ...cambios } = EsquemaEditar.parse(entrada);

    // Cadena vacía = "ninguna": deja al agente adivinar de nuevo.
    if (cambios.impresora !== undefined && !cambios.impresora) cambios.impresora = null;

    const { data, error } = await sb
      .from('equipos_impresion')
      .update(cambios as never)
      .eq('id', id)
      .select('id, nombre, token, almacen_id, impresora, impresora_detectada, impresoras_disponibles, avance_corte_mm, ultima_conexion, version_agente, activo, almacenes:almacen_id(nombre)')
      .single();

    if (error) throw new Error(error.message);
    return aDTO(data as unknown as Record<string, unknown>);
  });
  if (r.ok) await bumpPaths('/configuracion/impresion');
  return r;
}

/**
 * Da de baja la computadora.
 *
 * Se borra en vez de desactivar solo si nunca imprimió nada: mientras tenga
 * tickets en el historial, la fila tiene que quedar para poder mirarlos.
 */
export async function eliminarEquipoImpresion(id: string): Promise<ActionResult<{ borrado: boolean }>> {
  const r = await runAction(async () => {
    const { sb } = await soloGerencia();

    const { count } = await sb
      .from('cola_impresion')
      .select('id', { count: 'exact', head: true })
      .eq('equipo_id', id);

    if ((count ?? 0) > 0) {
      const { error } = await sb.from('equipos_impresion').update({ activo: false } as never).eq('id', id);
      if (error) throw new Error(error.message);
      return { borrado: false };
    }

    const { error } = await sb.from('equipos_impresion').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { borrado: true };
  });
  if (r.ok) await bumpPaths('/configuracion/impresion');
  return r;
}

/**
 * Genera un token nuevo para esa computadora.
 *
 * Sirve cuando el código se compartió por error o cuando se reinstala el agente
 * en otra máquina: el código viejo deja de funcionar en el acto.
 */
export async function regenerarTokenImpresion(id: string): Promise<ActionResult<{ token: string }>> {
  const r = await runAction(async () => {
    const { sb } = await soloGerencia();
    const { data, error } = await sb
      .from('equipos_impresion')
      .update({ token: crypto.randomUUID() } as never)
      .eq('id', id)
      .select('token')
      .single();
    if (error) throw new Error(error.message);
    return { token: (data as { token: string }).token };
  });
  if (r.ok) await bumpPaths('/configuracion/impresion');
  return r;
}

/** Últimos tickets de una computadora, para ver qué pasó cuando algo falla. */
export type TicketColaDTO = {
  id: string;
  descripcion: string | null;
  estado: string;
  intentos: number;
  error: string | null;
  created_at: string;
  impreso_at: string | null;
};

export async function ultimosTickets(equipoId: string, limite = 20): Promise<TicketColaDTO[]> {
  const { sb } = await requireUser();
  const { data } = await sb
    .from('cola_impresion')
    .select('id, descripcion, estado, intentos, error, created_at, impreso_at')
    .eq('equipo_id', equipoId)
    .order('created_at', { ascending: false })
    .limit(limite);
  return (data ?? []) as unknown as TicketColaDTO[];
}
