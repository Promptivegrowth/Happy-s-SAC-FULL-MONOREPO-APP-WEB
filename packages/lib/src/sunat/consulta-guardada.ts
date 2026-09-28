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
 * Lo usan las tres aplicaciones con el mismo cliente de servicio, así que lo
 * que consulta una caja le sirve a todas.
 */

import { consultaDNI, consultaRUC, type ConsultaDNI, type ConsultaRUC } from './index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteDb = { from: (tabla: string) => any };

export type TipoDocumento = 'dni' | 'ruc';
export type FuenteConsulta = 'guardado' | 'clientes' | 'reniec-sunat' | 'guardado-viejo';

/**
 * Cuánto se confía en una respuesta guardada. Un nombre de RENIEC no cambia; la
 * razón social y sobre todo la dirección de un RUC sí pueden cambiar, y la
 * factura tiene que llevar la vigente.
 */
const VIGENCIA_DIAS: Record<TipoDocumento, number> = { dni: 365, ruc: 30 };

type Guardado = { datos: ConsultaDNI | ConsultaRUC; consultado_en: string };

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

async function guardar(sb: ClienteDb, tipo: TipoDocumento, numero: string, datos: ConsultaDNI | ConsultaRUC) {
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
 * podría averiguar datos de un cliente escribiendo su DNI.
 */
export async function consultarDocumento(
  sb: ClienteDb,
  tipo: TipoDocumento,
  numero: string,
  opciones: { usarClientes?: boolean } = {},
): Promise<{ datos: ConsultaDNI | ConsultaRUC; fuente: FuenteConsulta }> {
  const usarClientes = opciones.usarClientes ?? true;
  const guardado = await leerGuardado(sb, tipo, numero);
  if (guardado) {
    const dias = (Date.now() - new Date(guardado.consultado_en).getTime()) / 86_400_000;
    if (dias <= VIGENCIA_DIAS[tipo]) return { datos: guardado.datos, fuente: 'guardado' };
  }

  // Un DNI de un cliente registrado se usa sin gastar cupo. Un RUC no: la
  // dirección fiscal cargada a mano hace meses es justo lo que conviene
  // refrescar con SUNAT, así que el cliente registrado queda de respaldo.
  if (tipo === 'dni' && usarClientes) {
    const cliente = await desdeClientes(sb, tipo, numero);
    if (cliente) return { datos: cliente, fuente: 'clientes' };
  }

  try {
    const datos = tipo === 'dni' ? await consultaDNI(numero) : await consultaRUC(numero);
    await guardar(sb, tipo, numero, datos);
    return { datos, fuente: 'reniec-sunat' };
  } catch (e) {
    // El servicio no respondió: mejor un dato guardado viejo, o el del cliente
    // registrado, que nada.
    if (guardado) return { datos: guardado.datos, fuente: 'guardado-viejo' };
    if (usarClientes) {
      const cliente = await desdeClientes(sb, tipo, numero);
      if (cliente) return { datos: cliente, fuente: 'clientes' };
    }
    throw e;
  }
}
