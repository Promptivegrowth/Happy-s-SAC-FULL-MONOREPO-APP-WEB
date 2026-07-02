'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';
import { requireRol } from '@/server/session';

/**
 * Venta de exportación (Art. 33 Ley IGV Perú).
 *
 * Diferencias con la venta nacional:
 *   - IGV 0% obligatorio.
 *   - Moneda: USD / EUR / PEN (usualmente USD).
 *   - Cliente con documento extranjero (pasaporte / TAX ID) permitido.
 *   - INCOTERM obligatorio (FOB, CIF, EXW, DAP, etc.).
 *   - País destino ISO alpha-2 (SUNAT catálogo 04).
 *   - Comprobante siempre FACTURA (código operación 0200 = Exportación bienes).
 *   - Serie asignada específicamente por SUNAT (config en /configuracion/series).
 *
 * Nota: se registra como venta con canal='EXPORTACION' y es_exportacion=true.
 * Kardex sale igual que una venta normal (SALIDA_VENTA) — el producto ya
 * está despachado al momento de emitir la factura de exportación.
 */

const itemSchema = z.object({
  variante_id: z.string().uuid(),
  cantidad: z.number().int().positive(),
  precio_unitario: z.number().positive(), // en moneda origen
  descuento_monto: z.number().min(0).default(0),
});

const ventaExportSchema = z.object({
  almacen_id: z.string().uuid(),

  // Cliente (permite documento extranjero — no forzamos formato peruano)
  cliente_id: z.string().uuid().nullable().optional(),
  documento_extranjero: z.string().optional().nullable(),   // pasaporte / RUT / TAX ID
  tipo_documento_cliente: z.enum(['DNI','RUC','CE','PASAPORTE']).nullable().optional(),
  razon_social: z.string().optional().nullable(),
  direccion_extranjero: z.string().optional().nullable(),

  // Datos exportación
  pais_destino_iso: z.string().length(2),
  incoterm: z.enum(['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']),
  moneda: z.enum(['USD','EUR','PEN']).default('USD'),
  tipo_cambio: z.number().positive(),                       // moneda origen → PEN
  puerto_salida: z.string().optional().nullable(),
  codigo_operacion_sunat: z.string().default('0200'),
  numero_dua: z.string().optional().nullable(),

  vendedor_usuario_id: z.string().uuid().optional().nullable(),
  observacion: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

export type VentaExportInput = z.infer<typeof ventaExportSchema>;
export type VentaExportResultado =
  | { ok: true; venta_id: string; numero: string; comprobante?: { id: string; serie: string; numero: number } }
  | { ok: false; error: string };

export async function registrarVentaExportacion(input: VentaExportInput): Promise<VentaExportResultado> {
  // Solo gerente o cajero pueden emitir exportación (rol B2B se resuelve luego si se pide).
  await requireRol('gerente');

  let parsed: VentaExportInput;
  try {
    parsed = ventaExportSchema.parse(input);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  // 1) Verificar serie de exportación activa
  const { data: serieExp } = await sb
    .from('series_comprobantes')
    .select('serie')
    .eq('tipo', 'FACTURA')
    .eq('canal', 'EXPORTACION')
    .eq('activa', true)
    .maybeSingle();
  if (!serieExp) {
    return {
      ok: false,
      error:
        'No hay serie de Factura de Exportación activa. Ir a Configuración → Series de Comprobantes ' +
        'y activar la serie que asignó SUNAT.',
    };
  }

  // 2) Verificar país activo
  const { data: pais } = await sb
    .from('paises_exportacion')
    .select('codigo_iso, nombre, codigo_sunat, activo')
    .eq('codigo_iso', parsed.pais_destino_iso.toUpperCase())
    .maybeSingle();
  if (!pais || !pais.activo) {
    return {
      ok: false,
      error: `País destino ${parsed.pais_destino_iso} no existe o está inactivo. Configuración → Países de exportación.`,
    };
  }

  // 3) Validar stock en almacén
  const cantPorVariante = new Map<string, number>();
  for (const i of parsed.items) {
    cantPorVariante.set(i.variante_id, (cantPorVariante.get(i.variante_id) ?? 0) + i.cantidad);
  }
  const varianteIds = Array.from(cantPorVariante.keys());
  const { data: stocks } = await sb
    .from('stock_actual')
    .select('variante_id, cantidad')
    .eq('almacen_id', parsed.almacen_id)
    .in('variante_id', varianteIds);
  const stockPorVar = new Map<string, number>();
  for (const s of (stocks ?? []) as { variante_id: string; cantidad: number | string }[]) {
    stockPorVar.set(s.variante_id, Number(s.cantidad ?? 0));
  }
  const faltantes: string[] = [];
  for (const [vid, cant] of cantPorVariante) {
    const st = stockPorVar.get(vid) ?? 0;
    if (st < cant) faltantes.push(`${vid.slice(0, 8)}: pide ${cant}, hay ${st}`);
  }
  if (faltantes.length > 0) {
    return { ok: false, error: `Sin stock suficiente:\n${faltantes.map((f) => '· ' + f).join('\n')}` };
  }

  // 4) Insertar venta
  const subTotal = parsed.items.reduce((a, i) => a + (i.cantidad * i.precio_unitario - i.descuento_monto), 0);

  const { data: numVenta } = await sb.rpc('next_correlativo', { p_clave: 'VENTA', p_padding: 6 });
  const numero = `VEN-${numVenta}`;

  const { data: venta, error: errVenta } = await sb.from('ventas').insert({
    numero,
    canal: 'EXPORTACION',
    fecha: new Date().toISOString(),
    almacen_id: parsed.almacen_id,
    cliente_id: parsed.cliente_id ?? null,
    tipo_documento_cliente: parsed.tipo_documento_cliente ?? 'PASAPORTE',
    documento_cliente: parsed.documento_extranjero ?? null,
    nombre_cliente_rapido: parsed.razon_social ?? null,
    vendedor_usuario_id: parsed.vendedor_usuario_id ?? user.id,
    sub_total: subTotal,        // IGV=0 → subtotal = total
    descuento_total: parsed.items.reduce((a, i) => a + i.descuento_monto, 0),
    igv: 0,
    total: subTotal,
    moneda: parsed.moneda,
    estado: 'COMPLETADA',
    observacion: parsed.observacion ?? null,
    // Campos exportación
    es_exportacion: true,
    pais_destino_iso: parsed.pais_destino_iso.toUpperCase(),
    incoterm: parsed.incoterm,
    tipo_cambio: parsed.tipo_cambio,
    puerto_salida: parsed.puerto_salida ?? null,
    codigo_operacion_sunat: parsed.codigo_operacion_sunat,
  }).select('id').single();
  if (errVenta) return { ok: false, error: `Error venta: ${errVenta.message}` };

  // 5) Líneas
  const lineas = parsed.items.map((i) => ({
    venta_id: venta.id,
    variante_id: i.variante_id,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    descuento_monto: i.descuento_monto,
    igv: 0,
  }));
  const { error: errLin } = await sb.from('ventas_lineas').insert(lineas);
  if (errLin) return { ok: false, error: `Error líneas: ${errLin.message}` };

  // 6) Kardex — SALIDA_VENTA por línea
  const movs = parsed.items.map((i) => ({
    tipo: 'SALIDA_VENTA' as const,
    almacen_id: parsed.almacen_id,
    variante_id: i.variante_id,
    cantidad: i.cantidad,
    referencia_tipo: 'VENTA',
    referencia_id: venta.id,
    usuario_id: user.id,
    observacion: `Exportación ${pais.nombre} - ${numero}`,
  }));
  await sb.from('kardex_movimientos').insert(movs);

  // 7) Comprobante — FACTURA EXPORTACIÓN
  const { data: numComp } = await sb.rpc('next_correlativo', { p_clave: `COMP_${serieExp.serie}`, p_padding: 8 });
  const { data: comp, error: errComp } = await sb.from('comprobantes').insert({
    tipo: 'FACTURA',
    serie: serieExp.serie,
    numero: Number(numComp),
    venta_id: venta.id,
    cliente_id: parsed.cliente_id ?? null,
    tipo_documento_cliente: parsed.tipo_documento_cliente ?? 'PASAPORTE',
    numero_documento_cliente: parsed.documento_extranjero ?? null,
    razon_social_cliente: parsed.razon_social ?? null,
    direccion_cliente: parsed.direccion_extranjero ?? null,
    fecha_emision: new Date().toISOString(),
    moneda: parsed.moneda,
    tipo_cambio: parsed.tipo_cambio,
    sub_total: subTotal,
    igv: 0,
    total: subTotal,
    estado: 'BORRADOR',
    forma_pago: 'CONTADO',
    es_exportacion: true,
    pais_destino_iso: parsed.pais_destino_iso.toUpperCase(),
    incoterm: parsed.incoterm,
    puerto_salida: parsed.puerto_salida ?? null,
    codigo_operacion_sunat: parsed.codigo_operacion_sunat,
    numero_dua: parsed.numero_dua ?? null,
  }).select('id, serie, numero').single();
  if (errComp) return { ok: false, error: `Error comprobante: ${errComp.message}` };

  // Líneas de comprobante — afectación IGV '40' (Exportación, inafecto)
  const compLineas = parsed.items.map((i) => {
    const bruto = i.cantidad * i.precio_unitario - i.descuento_monto;
    return {
      comprobante_id: comp.id,
      variante_id: i.variante_id,
      codigo: '',
      descripcion: '',
      cantidad: i.cantidad,
      unidad_sunat: 'NIU',
      precio_unitario: i.precio_unitario,
      descuento: i.descuento_monto,
      sub_total: bruto,
      igv: 0,
      total: bruto,
      afectacion_igv: '40',   // '40' = Exportación (catálogo SUNAT 07)
    };
  });
  await sb.from('comprobantes_lineas').insert(compLineas);
  await sb.from('ventas').update({ comprobante_id: comp.id }).eq('id', venta.id);

  revalidatePath('/ventas');
  revalidatePath('/ventas/exportacion');

  return { ok: true, venta_id: venta.id, numero, comprobante: comp };
}
