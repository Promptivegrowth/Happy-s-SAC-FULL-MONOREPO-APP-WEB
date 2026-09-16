'use client';

/**
 * Impresión automática del ticket al cobrar.
 *
 * Lo que la tienda espera es lo mismo que hace el ERP de Agrocar: se presiona
 * "Pagar" y el ticket sale. Sin diálogo de impresión de Windows, sin elegir
 * impresora, sin un segundo clic.
 *
 * Camino normal: se arma el ticket en ESC/POS, se deja en la cola y el agente
 * de esa computadora lo levanta y lo imprime, normalmente en menos de un
 * segundo.
 *
 * Camino de respaldo: si no hay agente instalado, o está apagado, o la
 * ticketera no responde, se abre el PDF de siempre. Nadie se queda sin poder
 * cobrar porque un programa auxiliar esté caído; lo peor que pasa es que la
 * cajera vuelve a tener que dar Ctrl+P como hasta ahora.
 */

import { numeroALetras } from '@happy/lib';
import { construirTicket, type DatosTicket, type TipoComprobanteTicket } from '@happy/lib/escpos/ticket';
import { logoAPuntos } from '@happy/lib/escpos/logo';
import type { ComprobantePDFData } from '@/server/actions/caja-helpers';
import {
  encolarTicket, esperarImpresion, equiposDisponibles, equipoElegido,
  listoParaImprimir, type EquipoImpresion,
} from './cola-impresion';

export type EmpresaTicket = {
  razon_social: string;
  nombre_comercial: string | null;
  ruc: string;
  direccion_fiscal: string | null;
  telefono: string | null;
  logo_url: string | null;
  igv_porcentaje: number;
};

export type Establecimiento = { nombre: string | null; direccion: string | null } | null;

/**
 * El logo convertido a puntos se guarda en memoria.
 *
 * Es la única parte del ticket que hay que descargar y rasterizar: hacerlo en
 * cada venta agregaría medio segundo justo cuando el cliente está esperando.
 */
let logoEnMemoria: boolean[][] | null | undefined;

async function logoDelTicket(url: string | null): Promise<boolean[][] | null> {
  if (logoEnMemoria !== undefined) return logoEnMemoria;
  logoEnMemoria = await logoAPuntos(url);
  return logoEnMemoria;
}

/** Pasa los datos del comprobante al formato que entiende el generador. */
export async function datosDelTicket(
  pdf: ComprobantePDFData,
  extra: { empresa: EmpresaTicket; establecimiento: Establecimiento; caja?: string | null; vuelto?: number | null; hash?: string | null },
): Promise<DatosTicket> {
  return {
    empresa: {
      razon_social: extra.empresa.razon_social,
      nombre_comercial: extra.empresa.nombre_comercial,
      ruc: extra.empresa.ruc,
      direccion_fiscal: extra.empresa.direccion_fiscal,
      telefono: extra.empresa.telefono,
    },
    establecimiento: extra.establecimiento,
    comprobante: {
      tipo: pdf.comprobante.tipo as TipoComprobanteTicket,
      numero_completo: pdf.comprobante.numero_completo,
      fecha: pdf.comprobante.fecha,
      igv_porcentaje: pdf.comprobante.igv_porcentaje,
      moneda: 'PEN',
      hash: extra.hash ?? null,
    },
    cliente: {
      tipo_documento: pdf.cliente.tipo_documento,
      numero_documento: pdf.cliente.numero_documento,
      nombre_o_razon_social: pdf.cliente.nombre_o_razon_social,
      direccion: pdf.cliente.direccion,
    },
    items: pdf.items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      importe: i.sub_total,
    })),
    totales: {
      gravado: pdf.totales.sub_total,
      igv: pdf.totales.igv,
      total: pdf.totales.total,
    },
    pagos: pdf.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
    vuelto: extra.vuelto ?? null,
    vendedor: pdf.vendedor,
    caja: extra.caja ?? null,
    // El importe en letras es obligatorio en la representación impresa y el
    // POS lo puede calcular solo: no hace falta esperar a que SUNAT responda.
    total_letras: numeroALetras(pdf.totales.total),
    logo: await logoDelTicket(extra.empresa.logo_url),
  };
}

export type ResultadoImpresion =
  | { via: 'agente'; estado: 'impreso' | 'esperando' | 'error'; equipo: string }
  | { via: 'pdf'; motivo: 'sin-equipo' | 'sin-agente' | 'fallo'; detalle?: string };

/**
 * Elige por qué computadora imprimir.
 *
 * Primero la que el cajero haya fijado en este navegador; si no, la de su
 * tienda que esté lista. Devuelve null cuando no hay ninguna instalada, que es
 * la señal para caer al PDF.
 */
export async function equipoParaImprimir(almacenId?: string | null): Promise<EquipoImpresion | null> {
  const lista = await equiposDisponibles(almacenId);
  if (lista.length === 0) return null;

  const fijado = equipoElegido();
  const elegido = fijado ? lista.find((e) => e.id === fijado) : undefined;
  if (elegido) return elegido;

  // `equiposDisponibles` ya ordena poniendo primero los de esta tienda que
  // están listos, así que el primero es la mejor opción disponible.
  return lista.find(listoParaImprimir) ?? lista[0] ?? null;
}

/**
 * Manda el ticket a la ticketera y espera la confirmación del agente.
 *
 * Se espera a propósito: poder decir "impreso" y no solo "enviado" es lo que
 * permite avisarle a la cajera que la ticketera está sin papel mientras el
 * cliente todavía está en el mostrador.
 */
export async function imprimirPorAgente(
  datos: DatosTicket,
  equipo: EquipoImpresion,
  opciones: { comprobanteId?: string | null; abrirCajon?: boolean } = {},
): Promise<ResultadoImpresion> {
  const ticket = construirTicket(datos, {
    avanceCorteMm: equipo.avance_corte_mm ?? undefined,
    abrirCajon: opciones.abrirCajon,
  });

  const encolado = await encolarTicket(ticket.aBase64(), equipo.id, {
    descripcion: `${datos.comprobante.tipo} ${datos.comprobante.numero_completo}`,
    comprobanteId: opciones.comprobanteId ?? null,
  });
  if (!encolado.ok) return { via: 'pdf', motivo: 'fallo', detalle: encolado.error };

  const estado = await esperarImpresion(encolado.id, 12);
  return { via: 'agente', estado, equipo: equipo.nombre };
}

/**
 * Manda a la ticketera un documento de caja: gastos, cierre de turno.
 *
 * No son comprobantes, así que no pasan por `construirTicket` ni llevan
 * comprobante asociado en la cola. Lo que sí comparten con las boletas es el
 * camino: van al agente de la computadora y salen por la ticketera, con su
 * corte.
 *
 * Antes se imprimían abriendo una ventana del navegador y llamando a imprimir,
 * o sea a través del controlador de Windows. Con papel de rollo continuo el
 * controlador no sabe dónde termina la hoja: la máquina sigue sacando papel
 * hasta que alguien la para. Pasó en tienda el 16/09/2026 al imprimir gastos.
 *
 * `armar` recibe el avance de corte configurado para ESA ticketera, que es
 * distinto en cada modelo.
 */
export async function imprimirDocumentoDeCaja(
  armar: (avanceCorteMm: number | undefined) => { aBase64: () => string },
  descripcion: string,
  almacenId?: string | null,
): Promise<ResultadoImpresion> {
  const equipo = await equipoParaImprimir(almacenId);
  if (!equipo) return { via: 'pdf', motivo: 'sin-equipo' };

  const ticket = armar(equipo.avance_corte_mm ?? undefined);
  const encolado = await encolarTicket(ticket.aBase64(), equipo.id, { descripcion });
  if (!encolado.ok) return { via: 'pdf', motivo: 'fallo', detalle: encolado.error };

  const estado = await esperarImpresion(encolado.id, 12);
  return { via: 'agente', estado, equipo: equipo.nombre };
}
