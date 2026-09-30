/**
 * Consulta de DNI/RUC que gasta el cupo solo cuando hace falta.
 *
 * El 28/09/2026 se agotaron las 1.000 consultas del mes de Decolecta y dejaron
 * de funcionar en todas las cajas. Cada DNI escrito se consultaba de nuevo,
 * aunque fuera un cliente que ya había comprado o el mismo número corregido.
 *
 * Ahora se busca en este orden, y se para en el primero que responda:
 *
 *   1. Lo ya consultado antes (`documentos_consultados`, mig 106).
 *   2. Los clientes registrados en el sistema.
 *   3. Decolecta, que es lo único que gasta cupo. Lo que devuelve se guarda.
 *
 * Y si Decolecta falla —cupo agotado, sin conexión— pero hay una respuesta
 * guardada aunque sea vieja, se usa esa: un nombre de hace un año sirve más que
 * ninguno, y la cajera igual puede corregirlo a mano.
 *
 * 29/09/2026, pedido de no gastar cupo en clientes repetidos, en ningún lado:
 *   - El RUC de un cliente registrado tampoco se vuelve a consultar, y lo
 *     consultado se guarda un año (antes 30 días). Si una empresa cambió de
 *     dirección, se corrige a mano en la venta o en la ficha del cliente.
 *   - Un número que RENIEC/SUNAT no encuentra también se guarda (30 días): antes
 *     cada reintento de un DNI mal escrito volvía a gastar una consulta.
 *   - Si llegan dos pedidos del mismo número a la vez (el autocompletado de la
 *     caja y la ventana de cobro), sale una sola consulta.
 *
 * Lo usan las tres aplicaciones con el mismo cliente de servicio, así que lo
 * que consulta una caja le sirve a todas.
 */

import { consultaDNI, consultaRUC, type ConsultaDNI, type ConsultaRUC } from './index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteDb = { from: (tabla: string) => any };

export type TipoDocumento = 'dni' | 'ruc';
export type FuenteConsulta = 'guardado' | 'clientes' | 'reniec-sunat' | 'guardado-viejo';

/** Cuánto se confía en una respuesta guardada antes de volver a gastar una consulta. */
const VIGENCIA_DIAS: Record<TipoDocumento, number> = { dni: 365, ruc: 365 };
/** Cuánto se recuerda que un número no existe (por si RENIEC/SUNAT lo da de alta después). */
const VIGENCIA_NO_ENCONTRADO_DIAS = 30;

/** Lo que se guarda cuando RENIEC/SUNAT dice que el número no existe o no es válido. */
type NoEncontrado = { noEncontrado: true; mensaje: string };
type Guardado = { datos: ConsultaDNI | ConsultaRUC | NoEncontrado; consultado_en: string };

function esNoEncontrado(d: Guardado['datos']): d is NoEncontrado {
  return (d as NoEncontrado).noEncontrado === true;
}

/** Las respuestas "no existe" que vale la pena recordar; el cupo agotado o un corte no. */
function esRespuestaDefinitiva(msg: string): boolean {
  return /no encontrado|Documento inválido/i.test(msg);
}

/** Consultas en curso en esta instancia, para no pedir dos veces el mismo número a la vez. */
const enCurso = new Map<string, Promise<{ datos: ConsultaDNI | ConsultaRUC; fuente: FuenteConsulta }>>();

async function leerGuardado(sb: ClienteDb, tipo: TipoDocumento, numero: string): Promise<Guardado | null> {
  try {
    const { data } = await sb
      .from('documentos_consultados')
      .select('datos, consultado_en')
      .eq('tipo', tipo)
      .eq('numero', numero)
      .maybeSingle();
    return (data as Guardado | null) ?? null;
  } catch {
    return null;
  }
}

async function guardar(sb: ClienteDb, tipo: TipoDocumento, numero: string, datos: ConsultaDNI | ConsultaRUC | NoEncontrado) {
  try {
    await sb
      .from('documentos_consultados')
      .upsert({ tipo, numero, datos, consultado_en: new Date().toISOString() }, { onConflict: 'tipo,numero' });
  } catch {
    /* guardar es un extra: si falla, la consulta igual se devuelve */
  }
}

/** Un cliente ya registrado, llevado a la misma forma que devuelve RENIEC/SUNAT. */
async function desdeClientes(sb: ClienteDb, tipo: TipoDocumento, numero: string): Promise<ConsultaDNI | ConsultaRUC | null> {
  try {
    const { data } = await sb
      .from('clientes')
      .select('razon_social, nombres, apellido_paterno, apellido_materno, nombre_comercial, direccion')
      .eq('numero_documento', numero)
      .limit(1)
      .maybeSingle();
    const c = data as {
      razon_social: string | null; nombres: string | null; apellido_paterno: string | null;
      apellido_materno: string | null; nombre_comercial: string | null; direccion: string | null;
    } | null;
    if (!c) return null;

    if (tipo === 'ruc') {
      if (!c.razon_social?.trim()) return null;
      return {
        numero,
        razonSocial: c.razon_social.trim(),
        nombreComercial: c.nombre_comercial ?? undefined,
        direccion: c.direccion ?? undefined,
      } satisfies ConsultaRUC;
    }

    const completo = [c.nombres, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ').trim()
      || c.razon_social?.trim() || '';
    if (!completo) return null;
    return {
      numero,
      nombres: c.nombres ?? '',
      apellidoPaterno: c.apellido_paterno ?? '',
      apellidoMaterno: c.apellido_materno ?? '',
      nombreCompleto: completo,
    } satisfies ConsultaDNI;
  } catch {
    return null;
  }
}

/**
 * `usarClientes: false` es para lo público (el checkout de la web): ahí no se
 * puede devolver lo que Happy's tiene registrado de sus clientes, o cualquiera
 * podría averiguar datos de un cliente escribiendo su DNI. Por eso lo que sale
 * de `clientes` nunca se copia a la tabla compartida: ahí solo va lo que
 * respondió RENIEC/SUNAT.
 */
export async function consultarDocumento(
  sb: ClienteDb,
  tipo: TipoDocumento,
  numero: string,
  opciones: { usarClientes?: boolean } = {},
): Promise<{ datos: ConsultaDNI | ConsultaRUC; fuente: FuenteConsulta }> {
  const usarClientes = opciones.usarClientes ?? true;
  const clave = `${tipo}:${numero}:${usarClientes ? 'c' : 'p'}`;
  const previa = enCurso.get(clave);
  if (previa) return previa;
  const promesa = resolver(sb, tipo, numero, usarClientes).finally(() => enCurso.delete(clave));
  enCurso.set(clave, promesa);
  return promesa;
}

async function resolver(
  sb: ClienteDb,
  tipo: TipoDocumento,
  numero: string,
  usarClientes: boolean,
): Promise<{ datos: ConsultaDNI | ConsultaRUC; fuente: FuenteConsulta }> {
  const guardado = await leerGuardado(sb, tipo, numero);
  if (guardado) {
    const dias = (Date.now() - new Date(guardado.consultado_en).getTime()) / 86_400_000;
    if (esNoEncontrado(guardado.datos)) {
      if (dias <= VIGENCIA_NO_ENCONTRADO_DIAS) throw new Error(guardado.datos.mensaje);
    } else if (dias <= VIGENCIA_DIAS[tipo]) {
      return { datos: guardado.datos, fuente: 'guardado' };
    }
  }

  // Un cliente ya registrado (DNI o RUC) se usa sin gastar cupo.
  if (usarClientes) {
    const cliente = await desdeClientes(sb, tipo, numero);
    if (cliente) return { datos: cliente, fuente: 'clientes' };
  }

  const viejo = guardado && !esNoEncontrado(guardado.datos) ? guardado.datos : null;
  try {
    const datos = tipo === 'dni' ? await consultaDNI(numero) : await consultaRUC(numero);
    await guardar(sb, tipo, numero, datos);
    return { datos, fuente: 'reniec-sunat' };
  } catch (e) {
    const msg = (e as Error).message;
    if (esRespuestaDefinitiva(msg)) {
      await guardar(sb, tipo, numero, { noEncontrado: true, mensaje: msg });
      throw e;
    }
    // El servicio no respondió (cupo, conexión): mejor un dato guardado viejo que nada.
    if (viejo) return { datos: viejo, fuente: 'guardado-viejo' };
    throw e;
  }
}
