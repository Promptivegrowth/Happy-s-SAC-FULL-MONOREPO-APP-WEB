'use server';

import { z } from 'zod';
import { createServiceClient } from '@happy/db/service';
import { validarGuia, numeroGuia, MOTIVOS_TRASLADO, type GuiaRemisionInput } from '@happy/lib/sunat-ubl/despatch';
import { formatTallaChip } from '@happy/lib';
import { fechaLima } from '@happy/lib/format';
import { runAction, bumpPaths, type ActionResult } from './_helpers';
import { getSession } from '../session';
import { puedeVer } from '../permisos';
import { enviarGuiaConCliente, consultarGuiaConCliente, hayCredencialesGRE, type ResultadoGuia } from '../gre-core';
import { cargarEmpresaPDF, type EmpresaPDFData } from '../empresa-pdf-helper';
import { qrComoImagen } from '@happy/lib/sunat-ubl';

/*
 * Guías de remisión electrónicas.
 *
 * Todo lo que toca SUNAT corre con el cliente de servicio (ver gre-core.ts), así
 * que acá se controla primero que quien la emite tenga acceso a Guías.
 */
async function exigirAcceso() {
  const s = await getSession();
  if (!puedeVer(s.roles, '/guias')) throw new Error('Tu usuario no tiene acceso a Guías de remisión.');
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function servicio(): any {
  return createServiceClient();
}

const textoOpc = z.string().trim().optional().or(z.literal('')).transform((v) => v || undefined);

const guiaSchema = z.object({
  venta_id: z.string().uuid().optional().nullable(),
  comprobante_id: z.string().uuid().optional().nullable(),
  cliente_id: z.string().uuid().optional().nullable(),
  almacen_partida_id: z.string().uuid().optional().nullable(),
  recordar_partida: z.boolean().default(false),
  destinatario_tipo_doc: z.enum(['1', '6', '4', '7']),
  destinatario_num_doc: z.string().trim().min(1),
  destinatario_nombre: z.string().trim().min(1),
  motivo: z.enum(Object.keys(MOTIVOS_TRASLADO) as [keyof typeof MOTIVOS_TRASLADO, ...Array<keyof typeof MOTIVOS_TRASLADO>]),
  motivo_descripcion: textoOpc,
  modalidad: z.enum(['01', '02']),
  fecha_traslado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fecha_entrega_transportista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).transform((v) => v || undefined),
  peso_bruto_kg: z.coerce.number().positive('Falta el peso bruto'),
  num_bultos: z.coerce.number().int().positive().optional().nullable(),
  transportista_ruc: textoOpc,
  transportista_razon_social: textoOpc,
  transportista_mtc: textoOpc,
  placa: textoOpc,
  conductor_dni: textoOpc,
  conductor_nombres: textoOpc,
  conductor_apellidos: textoOpc,
  conductor_licencia: textoOpc,
  vehiculo_m1l: z.boolean().default(false),
  partida_ubigeo: z.string().regex(/^\d{6}$/, 'Falta el distrito de partida'),
  partida_direccion: z.string().trim().min(3),
  partida_cod_establecimiento: textoOpc,
  llegada_ubigeo: z.string().regex(/^\d{6}$/, 'Falta el distrito de llegada'),
  llegada_direccion: z.string().trim().min(3),
  llegada_cod_establecimiento: textoOpc,
  observacion: z.string().trim().max(250).optional().or(z.literal('')).transform((v) => v || undefined),
  items: z.array(z.object({
    variante_id: z.string().uuid().optional().nullable(),
    codigo: textoOpc,
    descripcion: z.string().trim().min(1),
    cantidad: z.coerce.number().positive(),
  })).min(1, 'La guía no tiene productos'),
});

export type GuiaFormData = z.input<typeof guiaSchema>;

/**
 * Registra la guía con su número y la manda a SUNAT.
 *
 * Devuelve ok aunque SUNAT no haya contestado todavía: la guía ya existe, tiene
 * número y el envío automático la termina. Lo que devuelve `estado` dice qué
 * pasó para que la pantalla lo muestre tal cual.
 */
export async function emitirGuia(datos: GuiaFormData): Promise<ActionResult<{ id: string; numero: string } & ResultadoGuia>> {
  return runAction(async () => {
    const sesion = await exigirAcceso();
    const d = guiaSchema.parse(datos);
    const sb = servicio();

    const { data: empresa } = await sb.from('empresa').select('ruc, razon_social').single();
    if (!empresa) throw new Error('Empresa no configurada');

    const hoy = fechaLima();
    const publico = d.modalidad === '01';
    const paraValidar: Omit<GuiaRemisionInput, 'serie' | 'numero' | 'fechaEmision' | 'horaEmision'> = {
      emisor: { ruc: empresa.ruc, razonSocial: empresa.razon_social },
      destinatario: { tipoDoc: d.destinatario_tipo_doc, numDoc: d.destinatario_num_doc, nombre: d.destinatario_nombre },
      motivo: d.motivo, motivoDescripcion: d.motivo_descripcion,
      modalidad: d.modalidad, fechaTraslado: d.fecha_traslado,
      fechaEntregaTransportista: publico ? (d.fecha_entrega_transportista ?? d.fecha_traslado) : undefined,
      pesoBrutoKg: d.peso_bruto_kg, numBultos: d.num_bultos ?? undefined,
      transportista: publico ? { ruc: d.transportista_ruc ?? '', razonSocial: d.transportista_razon_social ?? '', registroMtc: d.transportista_mtc } : undefined,
      vehiculoPlaca: d.placa, vehiculoM1L: !publico && d.vehiculo_m1l,
      conductor: !publico && !d.vehiculo_m1l ? {
        tipoDoc: '1', numDoc: d.conductor_dni ?? '', nombres: d.conductor_nombres ?? '',
        apellidos: d.conductor_apellidos ?? '', licencia: d.conductor_licencia ?? '',
      } : undefined,
      partida: { ubigeo: d.partida_ubigeo, direccion: d.partida_direccion, codigoEstablecimiento: d.partida_cod_establecimiento },
      llegada: { ubigeo: d.llegada_ubigeo, direccion: d.llegada_direccion, codigoEstablecimiento: d.llegada_cod_establecimiento },
      observacion: d.observacion,
      items: d.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad })),
    };
    const errores = validarGuia(paraValidar, hoy);
    if (errores.length) throw new Error(errores.join(' '));

    // Sin credenciales la guía no puede llegar a SUNAT: se corta acá, antes de
    // gastar un número y dejar una guía colgada que después se mande sola.
    if (!(await hayCredencialesGRE(sb))) {
      throw new Error('Todavía no se pueden emitir guías: faltan las credenciales de la API de SUNAT (Configuración → SUNAT).');
    }

    const { data: serieRow } = await sb.from('series_comprobantes')
      .select('serie').eq('tipo', 'GUIA_REMISION').eq('activa', true).order('serie').limit(1).maybeSingle();
    if (!serieRow?.serie) throw new Error('No hay una serie de guía de remisión activa (Configuración → Series).');
    const serie = serieRow.serie as string;

    const { data: nro, error: errNro } = await sb.rpc('next_correlativo', { p_clave: `COMP_${serie}`, p_padding: 7 });
    if (errNro || !nro) throw new Error(`No se pudo tomar el número de la guía: ${errNro?.message ?? 'sin respuesta'}`);
    const numero = Number(nro);
    const numeroCompleto = numeroGuia(serie, numero);

    const { data: guia, error: errIns } = await sb.from('guias_remision').insert({
      serie, numero, // numero_completo lo calcula la base
      venta_id: d.venta_id ?? null, comprobante_id: d.comprobante_id ?? null, cliente_id: d.cliente_id ?? null,
      almacen_partida_id: d.almacen_partida_id ?? null,
      motivo_traslado: d.motivo, motivo_descripcion: d.motivo_descripcion ?? null,
      modalidad: publico ? 'PUBLICO' : 'PRIVADO',
      destinatario_tipo_doc: d.destinatario_tipo_doc, destinatario_num_doc: d.destinatario_num_doc,
      destinatario_nombre: d.destinatario_nombre.toUpperCase(),
      fecha_traslado: d.fecha_traslado,
      fecha_entrega_transportista: publico ? (d.fecha_entrega_transportista ?? d.fecha_traslado) : null,
      peso_bruto_kg: d.peso_bruto_kg, num_bultos: d.num_bultos ?? null,
      transportista_ruc: publico ? d.transportista_ruc : null,
      transportista_razon_social: publico ? d.transportista_razon_social?.toUpperCase() : null,
      transportista_mtc: publico ? (d.transportista_mtc ?? null) : null,
      placa_vehiculo: !publico && !d.vehiculo_m1l ? d.placa?.replace(/-/g, '').toUpperCase() : null,
      conductor_dni: !publico && !d.vehiculo_m1l ? d.conductor_dni : null,
      conductor_nombre: !publico && !d.vehiculo_m1l ? d.conductor_nombres?.toUpperCase() : null,
      conductor_apellidos: !publico && !d.vehiculo_m1l ? d.conductor_apellidos?.toUpperCase() : null,
      conductor_licencia: !publico && !d.vehiculo_m1l ? d.conductor_licencia?.toUpperCase() : null,
      vehiculo_m1l: !publico && d.vehiculo_m1l,
      direccion_partida: d.partida_direccion.toUpperCase(), ubigeo_partida: d.partida_ubigeo,
      cod_establecimiento_partida: d.partida_cod_establecimiento ?? null,
      direccion_llegada: d.llegada_direccion.toUpperCase(), ubigeo_llegada: d.llegada_ubigeo,
      cod_establecimiento_llegada: d.llegada_cod_establecimiento ?? null,
      observacion: d.observacion ?? null,
      creado_por: sesion.id,
    }).select('id').single();
    if (errIns || !guia) throw new Error(`No se pudo guardar la guía: ${errIns?.message ?? 'sin respuesta'}`);

    const { error: errItems } = await sb.from('guias_remision_items').insert(d.items.map((i) => ({
      guia_id: guia.id, variante_id: i.variante_id ?? null, codigo: i.codigo ?? null,
      descripcion: i.descripcion.toUpperCase(), cantidad: i.cantidad, unidad: 'NIU',
    })));
    if (errItems) {
      // Sin productos la guía no sirve: se borra para no dejar una fila a medias.
      await sb.from('guias_remision').delete().eq('id', guia.id);
      throw new Error(`No se pudieron guardar los productos: ${errItems.message}`);
    }

    // La dirección de partida se aprende: la próxima guía de ese almacén ya la trae.
    if (d.almacen_partida_id && d.recordar_partida) {
      await sb.from('almacenes').update({
        direccion: d.partida_direccion,
        ubigeo: d.partida_ubigeo,
        ...(d.partida_cod_establecimiento ? { codigo_establecimiento_sunat: d.partida_cod_establecimiento } : {}),
      }).eq('id', d.almacen_partida_id);
    }

    const r = await enviarGuiaConCliente(sb, guia.id);
    await bumpPaths('/guias');
    return { id: guia.id as string, numero: numeroCompleto, ...r };
  });
}

/** Reintenta el envío de una guía que quedó sin llegar a SUNAT. */
export async function reenviarGuia(id: string): Promise<ActionResult<ResultadoGuia>> {
  return runAction(async () => {
    await exigirAcceso();
    const r = await enviarGuiaConCliente(servicio(), id);
    await bumpPaths('/guias', `/guias/${id}`);
    return r;
  });
}

/** Pregunta a SUNAT por la respuesta de una guía ya enviada. */
export async function consultarGuia(id: string): Promise<ActionResult<ResultadoGuia>> {
  return runAction(async () => {
    await exigirAcceso();
    const r = await consultarGuiaConCliente(servicio(), id);
    await bumpPaths('/guias', `/guias/${id}`);
    return r;
  });
}

/** Enlace de descarga (5 minutos) del XML firmado o del CDR de SUNAT. */
export async function enlaceArchivoGuia(id: string, archivo: 'xml' | 'cdr'): Promise<ActionResult<{ url: string; nombre: string }>> {
  return runAction(async () => {
    await exigirAcceso();
    const sb = servicio();
    const { data: g } = await sb.from('guias_remision').select('xml_firmado_url, cdr_url').eq('id', id).single();
    const path = archivo === 'xml' ? g?.xml_firmado_url : g?.cdr_url;
    if (!path) throw new Error(archivo === 'xml' ? 'La guía todavía no tiene XML.' : 'SUNAT todavía no devolvió el CDR.');
    const nombre = String(path).split('/').pop() ?? `guia.${archivo === 'xml' ? 'xml' : 'zip'}`;
    const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(path, 300, { download: nombre });
    if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo generar el enlace');
    return { url: data.signedUrl as string, nombre };
  });
}

export type VarianteGuia = { variante_id: string; codigo: string; descripcion: string };

/** Productos para sumar a mano a una guía (por nombre, SKU o código de barras). */
export async function buscarVariantesGuia(q: string): Promise<VarianteGuia[]> {
  await exigirAcceso();
  const texto = q.trim();
  if (texto.length < 2) return [];
  const sb = servicio();
  const patron = `%${texto.replace(/[%_,()]/g, ' ')}%`;

  const { data: porProducto } = await sb.from('productos').select('id').ilike('nombre', patron).eq('activo', true).limit(15);
  const ids = ((porProducto ?? []) as { id: string }[]).map((p) => p.id);
  const filtro = [`sku.ilike.${patron}`, `codigo_barras.ilike.${patron}`];
  if (ids.length) filtro.push(`producto_id.in.(${ids.join(',')})`);

  const { data } = await sb.from('productos_variantes')
    .select('id, sku, talla, producto:producto_id(nombre)')
    .eq('activo', true)
    .or(filtro.join(','))
    .limit(40);
  return ((data ?? []) as Array<{ id: string; sku: string | null; talla: string | null; producto: { nombre: string } | null }>).map((v) => ({
    variante_id: v.id,
    codigo: v.sku ?? '',
    descripcion: `${v.producto?.nombre ?? 'PRODUCTO'}${v.talla ? ` TALLA ${formatTallaChip(v.talla)}` : ''}`.toUpperCase(),
  }));
}

export type ImpresionGuia = {
  guia: Record<string, unknown> & { numero_completo: string };
  items: Array<{ codigo: string | null; descripcion: string; cantidad: number; unidad: string | null }>;
  documento: string | null;
  qrDataUrl: string | null;
  empresa: EmpresaPDFData | null;
};

/**
 * Lo que hace falta para imprimir la guía.
 *
 * La representación impresa lleva el QR que devuelve SUNAT en el CDR: es lo que
 * escanea la agencia o la policía para comprobar que la guía es real.
 */
export async function datosImpresionGuia(id: string): Promise<ActionResult<ImpresionGuia>> {
  return runAction(async () => {
    await exigirAcceso();
    const sb = servicio();
    const { data: guia } = await sb.from('guias_remision').select('*').eq('id', id).single();
    if (!guia) throw new Error('Guía no encontrada');
    const [{ data: items }, empresa] = await Promise.all([
      sb.from('guias_remision_items').select('codigo, descripcion, cantidad, unidad').eq('guia_id', id).order('id'),
      cargarEmpresaPDF(),
    ]);
    let documento: string | null = null;
    if (guia.comprobante_id) {
      const { data: c } = await sb.from('comprobantes').select('tipo, numero_completo').eq('id', guia.comprobante_id).maybeSingle();
      if (c) documento = `${c.tipo === 'FACTURA' ? 'Factura' : 'Boleta de venta'} ${c.numero_completo}`;
    }
    const qrDataUrl = guia.qr_url ? await qrComoImagen(guia.qr_url as string).catch(() => null) : null;
    return { guia, items: items ?? [], documento, qrDataUrl, empresa };
  });
}
