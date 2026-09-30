'use server';

/**
 * Datos para imprimir cualquier comprobante en A4 desde el ERP.
 *
 * El PDF de las ventas de caja lo arma y guarda el POS al cobrar. Los que nacen
 * en el ERP —boletas y facturas de pedidos web, notas de crédito— no tenían
 * cómo imprimirse: esto junta lo necesario y el navegador arma el PDF
 * (ver components/comprobante-a4-pdf.ts). El QR va hecho desde acá porque la
 * librería que lo dibuja vive en el servidor.
 */

import { createServiceClient } from '@happy/db/service';
import { qrComoImagen } from '@happy/lib/sunat-ubl';
import { etiquetaPago } from '@happy/lib/pagos/etiqueta';
import { runAction, requireUser, type ActionResult } from './_helpers';
import { cargarEmpresaPDF, type EmpresaPDFData } from '../empresa-pdf-helper';

export type DatosComprobanteA4 = {
  empresa: EmpresaPDFData | null;
  tipo: string;
  numero: string;
  fecha: string;
  cliente: { tipoDoc: string | null; numDoc: string | null; nombre: string; direccion: string | null };
  referencia: string | null;
  motivo: string | null;
  lineas: Array<{ descripcion: string; cantidad: number; precio: number; descuento: number; total: number }>;
  totales: { base: number; igv: number; total: number };
  pagos: string[];
  qrDataUrl: string | null;
  estado: string;
};

const CODIGO_TIPO: Record<string, string> = { FACTURA: '01', BOLETA: '03', NOTA_CREDITO: '07', NOTA_DEBITO: '08' };
const CODIGO_DOC: Record<string, string> = { DNI: '1', CE: '4', RUC: '6', PASAPORTE: '7' };

export async function datosComprobanteA4(id: string): Promise<ActionResult<DatosComprobanteA4>> {
  return runAction(async () => {
    await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceClient() as any;
    const { data: c } = await sb.from('comprobantes').select('*').eq('id', id).single();
    if (!c) throw new Error('Comprobante no encontrado');

    const [{ data: lineas }, empresa] = await Promise.all([
      sb.from('comprobantes_lineas').select('descripcion, cantidad, precio_unitario, descuento, total').eq('comprobante_id', id).order('id'),
      cargarEmpresaPDF(),
    ]);

    let referencia: string | null = null;
    if (c.documento_referencia_id) {
      const { data: r } = await sb.from('comprobantes').select('numero_completo').eq('id', c.documento_referencia_id).maybeSingle();
      referencia = r?.numero_completo ?? null;
    }
    let pagos: string[] = [];
    if (c.venta_id) {
      const { data: p } = await sb.from('ventas_pagos').select('metodo, monto, referencia').eq('venta_id', c.venta_id);
      pagos = ((p ?? []) as Array<{ metodo: string; monto: number; referencia: string | null }>)
        .filter((x) => x.metodo !== 'CREDITO')
        .map((x) => `${etiquetaPago(x.metodo, x.referencia)} — S/ ${Number(x.monto).toFixed(2)}`);
    }

    // QR de la representación impresa (R.S. 097-2012/SUNAT): RUC|tipo|serie|número|IGV|total|fecha|tipo doc|n° doc
    let qrDataUrl: string | null = null;
    if (CODIGO_TIPO[c.tipo] && empresa?.ruc) {
      const [serie, numero] = String(c.numero_completo).split('-');
      const cadena = [
        empresa.ruc, CODIGO_TIPO[c.tipo], serie, numero,
        Number(c.igv ?? 0).toFixed(2), Number(c.total ?? 0).toFixed(2),
        new Date(c.fecha_emision).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
        CODIGO_DOC[c.tipo_documento_cliente ?? ''] ?? '0', c.numero_documento_cliente ?? '',
      ].join('|');
      qrDataUrl = await qrComoImagen(cadena).catch(() => null);
    }

    return {
      empresa,
      tipo: c.tipo,
      numero: c.numero_completo,
      fecha: c.fecha_emision,
      cliente: {
        tipoDoc: c.tipo_documento_cliente, numDoc: c.numero_documento_cliente,
        nombre: c.razon_social_cliente || 'CLIENTE VARIOS', direccion: c.direccion_cliente,
      },
      referencia,
      motivo: c.tipo === 'NOTA_CREDITO' || c.tipo === 'NOTA_DEBITO' ? (c.nota_interna ?? null) : null,
      lineas: ((lineas ?? []) as Array<{ descripcion: string; cantidad: number; precio_unitario: number; descuento: number | null; total: number }>).map((l) => ({
        descripcion: l.descripcion, cantidad: Number(l.cantidad), precio: Number(l.precio_unitario),
        descuento: Number(l.descuento ?? 0), total: Number(l.total),
      })),
      totales: { base: Number(c.sub_total ?? 0), igv: Number(c.igv ?? 0), total: Number(c.total ?? 0) },
      pagos,
      qrDataUrl,
      estado: c.estado,
    };
  });
}
