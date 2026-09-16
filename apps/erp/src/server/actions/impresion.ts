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
  /** La Zebra de etiquetas. Vacío = esta computadora no imprime etiquetas. */
  impresoraEtiquetas: string | null;
  /** Lo que el agente declara saber hacer. Vacío = agente antiguo, solo tickets. */
  capacidades: string | null;
  /** Si el agente instalado entiende de etiquetas. */
  sabeEtiquetas: boolean;
  impresora_detectada: string | null;
  impresoras_disponibles: string[];
  avance_corte_mm: number;
  ultima_conexion: string | null;
  version_agente: string | null;
  activo: boolean;
  /** Nombre de Windows de la computadora que reportó por última vez. */
  maquina: string | null;
  /**
   * Computadoras distintas que usaron este código. Más de una significa que el
   * mismo código se instaló en varias máquinas y los tickets se reparten entre
   * ellas —o el mismo sale impreso dos veces—.
   */
  maquinas_vistas: string[];
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
  const capacidades = (fila.capacidades as string | null) ?? null;
  const detectada = (fila.impresora_detectada as string | null) ?? null;
  const almacen = fila.almacenes as { nombre?: string } | null | undefined;

  return {
    id: fila.id as string,
    nombre: fila.nombre as string,
    token: fila.token as string,
    almacen_id: (fila.almacen_id as string | null) ?? null,
    almacen_nombre: almacen?.nombre ?? null,
    impresora,
    impresoraEtiquetas: (fila.impresora_etiquetas as string | null) ?? null,
    capacidades,
    sabeEtiquetas: (capacidades ?? '').split(',').map((c) => c.trim()).includes('etiqueta'),
    impresora_detectada: detectada,
    impresoras_disponibles: String(fila.impresoras_disponibles ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    avance_corte_mm: Number(fila.avance_corte_mm ?? 15),
    ultima_conexion: ultima,
    version_agente: (fila.version_agente as string | null) ?? null,
    activo: Boolean(fila.activo),
    maquina: (fila.maquina as string | null) ?? null,
    maquinas_vistas: String(fila.maquinas_vistas ?? '')
      .split('|')
      .map((m) => m.trim())
      .filter(Boolean),
    conectado,
    listo: conectado && Boolean(impresora || detectada),
  };
}

export async function listarEquiposImpresion(): Promise<EquipoImpresionDTO[]> {
  const { sb } = await requireUser();
  const { data } = await sb
    .from('equipos_impresion')
    .select('id, nombre, token, almacen_id, impresora, impresora_etiquetas, capacidades, impresora_detectada, impresoras_disponibles, avance_corte_mm, ultima_conexion, version_agente, activo, maquina, maquinas_vistas, almacenes:almacen_id(nombre)')
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
      .select('id, nombre, token, almacen_id, impresora, impresora_etiquetas, capacidades, impresora_detectada, impresoras_disponibles, avance_corte_mm, ultima_conexion, version_agente, activo, maquina, maquinas_vistas, almacenes:almacen_id(nombre)')
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
  impresora_etiquetas: z.string().trim().max(200).nullable().optional(),
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
    if (cambios.impresora_etiquetas !== undefined && !cambios.impresora_etiquetas) {
      cambios.impresora_etiquetas = null;
    }

    const { data, error } = await sb
      .from('equipos_impresion')
      .update(cambios as never)
      .eq('id', id)
      .select('id, nombre, token, almacen_id, impresora, impresora_etiquetas, capacidades, impresora_detectada, impresoras_disponibles, avance_corte_mm, ultima_conexion, version_agente, activo, maquina, maquinas_vistas, almacenes:almacen_id(nombre)')
      .single();

    if (error) throw new Error(error.message);
    return aDTO(data as unknown as Record<string, unknown>);
  });
  if (r.ok) await bumpPaths('/configuracion/impresion');
  return r;
}

/**
 * Borra la computadora, con sus tickets.
 *
 * Antes, si la computadora tenía tickets en el historial, esto la desactivaba
 * en vez de borrarla "para conservar el historial". Era una mala decisión: el
 * usuario pedía borrar, el sistema hacía otra cosa y no quedaba forma de
 * completar la acción. Y lo que se estaba protegiendo no vale nada — la cola de
 * impresión son trabajos de papel ya salidos, que además se purgan solos a los
 * tres días; el comprobante, que es lo que importa, vive en otra tabla y no se
 * toca.
 *
 * Para dejarla registrada pero fuera de servicio está el botón Desactivar, que
 * es una acción distinta y explícita.
 */
export async function eliminarEquipoImpresion(id: string): Promise<ActionResult<{ tickets: number }>> {
  const r = await runAction(async () => {
    const { sb } = await soloGerencia();

    // Se cuentan antes solo para poder decir cuántos se fueron con ella.
    const { count } = await sb
      .from('cola_impresion')
      .select('id', { count: 'exact', head: true })
      .eq('equipo_id', id);

    // Los tickets se van en cascada (ver la migración 93).
    const { error } = await sb.from('equipos_impresion').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { tickets: count ?? 0 };
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

/**
 * Da por resuelto el aviso de código instalado en varias computadoras.
 *
 * Se limpia la lista dejando solo la que reportó último. Hace falta porque
 * mover el agente de una computadora a otra es legítimo y también deja dos
 * nombres: sin poder limpiarlo, el aviso quedaría para siempre y la gente
 * aprendería a ignorarlo.
 */
export async function olvidarMaquinasImpresion(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    const { sb } = await soloGerencia();
    const { data } = await sb.from('equipos_impresion').select('maquina').eq('id', id).maybeSingle();
    const actual = (data as { maquina?: string | null } | null)?.maquina ?? null;
    const { error } = await sb
      .from('equipos_impresion')
      .update({ maquinas_vistas: actual } as never)
      .eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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

/**
 * Manda una tanda de etiquetas a la Zebra, por la cola del agente.
 *
 * Antes las etiquetas se imprimían generando un PDF y dándole a imprimir desde
 * el navegador, o sea a través del controlador de Windows. Con el rollo de DOS
 * etiquetas a lo ancho eso sale mal siempre: el PDF declara una página del
 * tamaño de UNA etiqueta, el controlador ve un papel del doble de ancho y
 * estira el diseño hasta llenarlo. Un solo código repartido sobre los dos
 * stickers, que es lo que reportaron el 16/09/2026.
 *
 * Por la cola, en cambio, el ZPL llega tal cual a la impresora y ella lo ubica
 * por coordenadas. El PDF queda igual como respaldo para cuando no hay agente.
 */
export async function encolarEtiquetas(
  equipoId: string,
  zplBase64: string,
  descripcion: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { sb, userId } = await requireUser();
    if (!equipoId) throw new Error('Elige la computadora que tiene la Zebra');
    if (!zplBase64) throw new Error('No hay etiquetas que imprimir');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    /*
     * No se encola una etiqueta a una computadora que no tiene dónde
     * imprimirla.
     *
     * El agente la rechazaría igual —nunca cae a la ticketera de respaldo—,
     * pero avisar acá evita que alguien mande cien etiquetas y se entere
     * después mirando el historial.
     */
    const { data: equipo } = await sbAny
      .from('equipos_impresion')
      .select('nombre, impresora_etiquetas, capacidades, activo')
      .eq('id', equipoId)
      .maybeSingle();
    if (!equipo) throw new Error('Esa computadora no está registrada');
    if (!equipo.activo) throw new Error(`${equipo.nombre} está desactivada`);
    if (!equipo.impresora_etiquetas) {
      throw new Error(
        `${equipo.nombre} no tiene configurada la impresora de etiquetas. ` +
          'Se elige en Configuración → Impresión.',
      );
    }
    const capacidades = String(equipo.capacidades ?? '').split(',').map((c) => c.trim());
    if (!capacidades.includes('etiqueta')) {
      throw new Error(
        `El agente instalado en ${equipo.nombre} es anterior y no imprime etiquetas. ` +
          'Hay que actualizarlo.',
      );
    }

    const { data, error } = await sbAny
      .from('cola_impresion')
      .insert({
        equipo_id: equipoId,
        contenido: zplBase64,
        descripcion: descripcion.slice(0, 200),
        tipo: 'ETIQUETA',
        estado: 'pendiente',
        creado_por: userId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id as string };
  });
}

/** Las computadoras que pueden imprimir etiquetas ahora mismo. */
export async function equiposConEtiquetas(): Promise<
  Array<{ id: string; nombre: string; impresora: string }>
> {
  const { sb } = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data } = await sbAny
    .from('equipos_impresion')
    .select('id, nombre, impresora_etiquetas')
    .eq('activo', true)
    .not('impresora_etiquetas', 'is', null)
    .order('nombre');
  return ((data ?? []) as Array<{ id: string; nombre: string; impresora_etiquetas: string }>)
    .map((e) => ({ id: e.id, nombre: e.nombre, impresora: e.impresora_etiquetas }));
}
