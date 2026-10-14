/**
 * Lo que lleva una Orden de Servicio, calculado SIN crearla: prendas por
 * talla, avíos y tarifas.
 *
 * Lo usan la creación real de la OS (corte.ts) y la vista previa de las
 * solicitudes que gerencia aprueba (pedido de Javier, 13/10/2026: "gerencia no
 * podrá ver ni saber a qué hace referencia la orden"). Al ser el mismo código,
 * lo que gerencia ve antes de aprobar es exactamente lo que sale en la OS.
 *
 * También el tarifario por talla para el PDF (copias de gerencia y taller).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export type LineaPrevista = { producto_id: string; talla: string; cantidad: number };
export type TarifaTalla = { tarifa: number; observacion: string | null; fuente: string };

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/**
 * Prendas de la OS. Con corte vinculado: lo cortado del modelo del corte en su
 * OT. Sin corte, desde la OT: lo cortado y, si una talla no tiene corte, lo
 * planificado (reglas del cliente del 21/07/2026). Filtrado por las tallas
 * elegidas.
 */
export async function lineasPrevistasOS(
  sb: Sb,
  origen: { corteId?: string | null; otId?: string | null; tallas?: string[] },
): Promise<LineaPrevista[]> {
  const filtro = origen.tallas && origen.tallas.length > 0 ? new Set(origen.tallas) : null;
  if (origen.corteId) {
    const { data: corte, error } = await sb.from('ot_corte').select('producto_id, ot_id').eq('id', origen.corteId).single();
    if (error) throw new Error(`corte: ${error.message}`);
    if (!corte) return [];
    const { data } = await sb.from('ot_lineas').select('talla, cantidad_cortada')
      .eq('ot_id', corte.ot_id).eq('producto_id', corte.producto_id);
    return ((data ?? []) as { talla: string; cantidad_cortada: number | null }[])
      .map((l) => ({ producto_id: corte.producto_id as string, talla: l.talla, cantidad: Number(l.cantidad_cortada ?? 0) }))
      .filter((l) => l.cantidad > 0 && (!filtro || filtro.has(l.talla)));
  }
  if (origen.otId && filtro) {
    const { data, error } = await sb.from('ot_lineas').select('producto_id, talla, cantidad_planificada, cantidad_cortada').eq('ot_id', origen.otId);
    if (error) throw new Error(`ot_lineas: ${error.message}`);
    return ((data ?? []) as { producto_id: string; talla: string; cantidad_planificada: number | null; cantidad_cortada: number | null }[])
      .map((l) => ({
        producto_id: l.producto_id, talla: l.talla,
        cantidad: Number(l.cantidad_cortada ?? 0) > 0 ? Number(l.cantidad_cortada) : Number(l.cantidad_planificada ?? 0),
      }))
      .filter((l) => l.cantidad > 0 && filtro.has(l.talla));
  }
  return [];
}

/**
 * Avíos que van al taller para esas prendas, según la receta activa: lo de
 * cada talla que "sale al servicio" (o al de ojal/botón), menos lo que se
 * queda en almacén, por las unidades enviadas.
 */
export async function aviosPrevistosOS(
  sb: Sb, productoId: string, cantPorTalla: Map<string, number>, proceso = 'COSTURA',
): Promise<Map<string, number>> {
  const avios = new Map<string, number>();
  if (cantPorTalla.size === 0) return avios;
  const { data: receta } = await sb.from('recetas').select('id').eq('producto_id', productoId).eq('activa', true).maybeSingle();
  if (!receta) return avios;
  const flag = proceso === 'OJAL_BOTON' ? 'sale_a_ojal_boton' : 'sale_a_servicio';
  const { data } = await sb.from('recetas_lineas')
    .select('material_id, talla, cantidad, cantidad_almacen')
    .eq('receta_id', receta.id).eq(flag, true).in('talla', [...cantPorTalla.keys()]);
  for (const lr of (data ?? []) as { material_id: string; talla: string; cantidad: number; cantidad_almacen: number | null }[]) {
    const unidades = cantPorTalla.get(lr.talla) ?? 0;
    if (unidades <= 0) continue;
    const alTaller = Math.max(0, Number(lr.cantidad) - Number(lr.cantidad_almacen ?? 0));
    if (alTaller <= 0) continue;
    avios.set(lr.material_id, (avios.get(lr.material_id) ?? 0) + alTaller * unidades);
  }
  return avios;
}

type FilaTarifa = { precio_unitario: number; producto_id: string | null; proceso: string | null; talla: string | null; observacion: string | null; vigente_hasta: string | null };

/** La tarifa más específica: cada campo puesto tiene que coincidir; gana la que coincide en más. */
function mejorTarifa(rows: FilaTarifa[], pesos: { producto: number; proceso: number; talla: number }, q: { productoId: string | null; proceso: string | null; talla: string | null }) {
  const hoy = hoyLima();
  return rows
    .filter((r) => !r.vigente_hasta || r.vigente_hasta >= hoy)
    .map((r) => {
      let score = 0;
      if (r.producto_id !== null) { if (r.producto_id !== q.productoId) return null; score += pesos.producto; }
      if (r.proceso !== null) { if (r.proceso !== q.proceso) return null; score += pesos.proceso; }
      if (r.talla !== null) { if (r.talla !== q.talla) return null; score += pesos.talla; }
      return { row: r, score };
    })
    .filter((x): x is { row: FilaTarifa; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

/** Tarifa negociada con el taller (talleres_tarifas). */
export async function tarifaTaller(sb: Sb, tallerId: string, productoId: string | null, proceso: string | null, talla: string | null): Promise<TarifaTalla | null> {
  const { data } = await sb.from('talleres_tarifas')
    .select('precio_unitario, producto_id, proceso, talla, observacion, vigente_hasta')
    .eq('taller_id', tallerId)
    .or(`vigente_desde.is.null,vigente_desde.lte.${hoyLima()}`);
  const w = mejorTarifa((data ?? []) as FilaTarifa[], { producto: 4, proceso: 2, talla: 1 }, { productoId, proceso, talla });
  if (!w) return null;
  const f = [w.row.producto_id !== null && 'producto', w.row.proceso !== null && 'proceso', w.row.talla !== null && 'talla'].filter(Boolean);
  return { tarifa: Number(w.row.precio_unitario), observacion: w.row.observacion, fuente: f.length === 0 ? 'tarifa genérica del taller' : `match por ${f.join('+')} (score ${w.score})` };
}

/**
 * Tarifa central (tarifas_servicios), la que vale para todos los talleres.
 * Solo trae las filas del modelo y las genéricas: leer la tabla entera (792
 * filas al 13/10/2026) iba a toparse con el límite de 1.000 de la base y
 * perder tarifas sin avisar.
 */
export async function tarifaCentral(sb: Sb, proceso: string, productoId: string, talla: string): Promise<TarifaTalla | null> {
  const { data } = await sb.from('tarifas_servicios')
    .select('precio_unitario, proceso, producto_id, talla, observacion, vigente_desde, vigente_hasta')
    .or(`producto_id.is.null,producto_id.eq.${productoId}`)
    .limit(1000);
  // Vigencia acá y no con otro .or(): dos .or() en la misma consulta no se combinan con seguridad.
  const hoy = hoyLima();
  const vigentes = ((data ?? []) as (FilaTarifa & { vigente_desde: string | null })[]).filter((r) => !r.vigente_desde || r.vigente_desde <= hoy);
  const w = mejorTarifa(vigentes, { producto: 2, proceso: 4, talla: 1 }, { productoId, proceso, talla });
  if (!w) return null;
  const f = [w.row.proceso && 'proceso', w.row.producto_id && 'producto', w.row.talla && 'talla'].filter(Boolean);
  return { tarifa: Number(w.row.precio_unitario), observacion: w.row.observacion, fuente: f.length === 0 ? 'tarifa genérica' : `match por ${f.join('+')} (score ${w.score})` };
}

/** Tarifa de cada talla: la del taller si la negoció, si no la central. */
export async function tarifasPorTalla(
  sb: Sb, tallerId: string | null, productoId: string, proceso: string, cantidades: Record<string, number>,
): Promise<{ total: number; detalle: { talla: string; cantidad: number; tarifa: number; subtotal: number; fuente: string }[]; faltantes: string[] }> {
  const detalle: { talla: string; cantidad: number; tarifa: number; subtotal: number; fuente: string }[] = [];
  const faltantes: string[] = [];
  let total = 0;
  for (const [talla, cantidad] of Object.entries(cantidades)) {
    if (cantidad <= 0) continue;
    let t = tallerId ? await tarifaTaller(sb, tallerId, productoId, proceso, talla) : null;
    let fuente = t ? `override del taller · ${t.fuente}` : '';
    if (!t) {
      t = await tarifaCentral(sb, proceso, productoId, talla);
      if (t) fuente = `central · ${t.fuente}`;
    }
    if (!t) { faltantes.push(talla); continue; }
    const subtotal = Math.round(t.tarifa * cantidad * 100) / 100;
    total += subtotal;
    detalle.push({ talla, cantidad, tarifa: t.tarifa, subtotal, fuente });
  }
  return { total: Math.round(total * 100) / 100, detalle, faltantes };
}

/**
 * Precio por prenda de cada línea de una OS, para mostrarlo en el PDF y en la
 * vista previa. Confección: tarifario por talla. Otros servicios: el precio
 * por unidad de la OS (monto base ÷ unidades). Si lo cobrado no coincide con
 * el tarifario (precio acordado por gerencia), se devuelve la diferencia.
 */
export async function precioPorLinea(
  sb: Sb, tallerId: string | null, proceso: string, lineas: LineaPrevista[], montoBase: number,
): Promise<{ porLinea: { tarifa: number | null; subtotal: number | null }[]; ajuste: number; sinTarifa: string[] }> {
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  if (proceso !== 'COSTURA') {
    const pu = unidades > 0 ? montoBase / unidades : 0;
    return { porLinea: lineas.map((l) => ({ tarifa: +pu.toFixed(4), subtotal: Math.round(pu * l.cantidad * 100) / 100 })), ajuste: 0, sinTarifa: [] };
  }
  const tarifa = new Map<string, number>();
  const sinTarifa: string[] = [];
  for (const productoId of new Set(lineas.map((l) => l.producto_id))) {
    const cant: Record<string, number> = {};
    for (const l of lineas.filter((x) => x.producto_id === productoId)) cant[l.talla] = (cant[l.talla] ?? 0) + l.cantidad;
    const r = await tarifasPorTalla(sb, tallerId, productoId, proceso, cant);
    for (const d of r.detalle) tarifa.set(`${productoId}|${d.talla}`, d.tarifa);
    sinTarifa.push(...r.faltantes);
  }
  const porLinea = lineas.map((l) => {
    const t = tarifa.get(`${l.producto_id}|${l.talla}`);
    return t == null ? { tarifa: null, subtotal: null } : { tarifa: t, subtotal: Math.round(t * l.cantidad * 100) / 100 };
  });
  const suma = porLinea.reduce((s, x) => s + (x.subtotal ?? 0), 0);
  return { porLinea, ajuste: Math.round((montoBase - suma) * 100) / 100, sinTarifa };
}
