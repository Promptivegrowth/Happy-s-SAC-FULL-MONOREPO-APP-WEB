'use server';

/**
 * CENTRO DE COSTOS POR ÁREA → VALOR MINUTO
 * (pedido cliente 2026-09-10: "indicar dónde realizar el registro de los costos
 *  y pagos por centro de costo para actualizar y sistematizar el cálculo del
 *  valor minuto").
 *
 * Cada área de producción funciona como un centro de costo mensual:
 *
 *   costos del mes (planilla, alquiler, luz, depreciación…)
 *   ────────────────────────────────────────────────────── = valor minuto
 *   minutos productivos del mes (jornada × operarios × ocupación)
 *
 * Los minutos salen de la JORNADA ESTÁNDAR ya configurada (lunes a viernes de
 * 08:00 a 18:00 con refrigerio, sábados de 08:00 a 13:00) multiplicada por los
 * operarios activos del área y por el % de ocupación del mes. Cada área puede,
 * si lo prefiere, fijar los minutos a mano.
 *
 * Al aplicar el valor calculado se actualiza `areas_produccion.valor_minuto` y
 * se deja el registro en `areas_valor_minuto_historial`, que es lo que ya
 * muestra el ícono del reloj en la pantalla de Áreas.
 */

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const CATEGORIAS = [
  'MANO_OBRA', 'ALQUILER', 'SERVICIOS', 'DEPRECIACION',
  'MANTENIMIENTO', 'INSUMOS', 'OTROS',
] as const;

const periodoSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Período inválido (usa AAAA-MM)');

const costoSchema = z.object({
  area_id: z.string().uuid(),
  periodo: periodoSchema,
  categoria: z.enum(CATEGORIAS),
  concepto: z.string().min(2, 'Describe el concepto').max(120),
  monto: z.coerce.number().min(0, 'El monto no puede ser negativo'),
  observacion: z.string().max(300).optional().or(z.literal('')),
});

export async function guardarCostoArea(
  input: z.input<typeof costoSchema> & { id?: string },
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = costoSchema.parse(input);
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const fila = {
      area_id: data.area_id,
      periodo: data.periodo,
      categoria: data.categoria,
      concepto: data.concepto.trim(),
      monto: data.monto,
      observacion: data.observacion?.trim() || null,
    };

    if (input.id) {
      const { error } = await sbAny.from('areas_costos_mensuales').update(fila).eq('id', input.id);
      if (error) throw new Error(error.message);
      return { id: input.id };
    }
    const { data: row, error } = await sbAny
      .from('areas_costos_mensuales')
      .insert({ ...fila, registrado_por: userId })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths(`/configuracion/areas/${input.area_id}/costos`, '/configuracion/areas');
  return r;
}

export async function eliminarCostoArea(id: string, areaId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('areas_costos_mensuales').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/configuracion/areas/${areaId}/costos`);
  return r;
}

const parametrosSchema = z.object({
  area_id: z.string().uuid(),
  periodo: periodoSchema,
  ocupacion_pct: z.coerce.number().min(1, 'Mínimo 1%').max(100, 'Máximo 100%'),
  minutos_override: z.coerce.number().positive().optional().or(z.literal('')).or(z.nan()),
  notas: z.string().max(300).optional().or(z.literal('')),
});

export async function guardarParametrosCosteo(
  input: z.input<typeof parametrosSchema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parametrosSchema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const minutos =
      typeof data.minutos_override === 'number' && !Number.isNaN(data.minutos_override)
        ? data.minutos_override
        : null;
    const { error } = await sbAny.from('areas_costos_parametros').upsert({
      area_id: data.area_id,
      periodo: data.periodo,
      ocupacion_pct: data.ocupacion_pct,
      minutos_override: minutos,
      notas: data.notas?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/configuracion/areas/${input.area_id}/costos`);
  return r;
}

/**
 * Trae la PLANILLA del área: suma el sueldo base de los operarios activos
 * asignados a esa área y la deja como una línea de costo de MANO_OBRA del mes.
 * Es el atajo para no tipear el costo de personal todos los meses.
 */
export async function traerPlanillaDelArea(
  areaId: string,
  periodo: string,
): Promise<ActionResult<{ operarios: number; total: number }>> {
  const r = await runAction(async () => {
    periodoSchema.parse(periodo);
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: opsRaw } = await sbAny
      .from('operarios')
      .select('id, codigo, tipo_contrato, sueldo_base')
      .eq('area_id', areaId)
      .eq('activo', true);
    type Op = { id: string; codigo: string | null; tipo_contrato: string | null; sueldo_base: number | string | null };
    const ops = (opsRaw ?? []) as Op[];
    const total = ops.reduce((s, o) => s + Number(o.sueldo_base ?? 0), 0);

    /*
     * Cuando no hay nada que sumar, el motivo importa.
     *
     * El mensaje anterior decía "cárgalo en Operarios" para cualquier caso, y
     * mandaba a un lugar donde a veces no hay nada que cargar: un operario de
     * destajo u honorarios no tiene sueldo mensual, y la ficha —con razón— ni
     * siquiera le muestra el campo. El cliente lo reportó así: "el mensaje
     * dice cargar sueldo base en operarios, pero en operario no hay campo"
     * (16/09/2026).
     *
     * Ahora se distingue: sin operarios, con operarios sin sueldo cargado, o
     * con operarios que por su forma de pago no llevan sueldo.
     */
    if (total <= 0) {
      if (ops.length === 0) {
        throw new Error(
          'Esta área no tiene operarios activos asignados. Asígnalos en Operarios, o escribe el costo de planilla a mano.',
        );
      }

      const mensuales = ops.filter((o) => o.tipo_contrato === 'PLANILLA' || o.tipo_contrato === 'MIXTO');
      if (mensuales.length === 0) {
        const formas = [...new Set(ops.map((o) => (o.tipo_contrato ?? 'sin contrato').toLowerCase()))].join(', ');
        throw new Error(
          `Los ${ops.length} operarios de esta área son de ${formas}: no cobran un sueldo mensual, así que no hay planilla que traer. ` +
          'Escribe a mano lo que le cuesta el área al mes, o cambia su tipo de contrato si alguno sí está en planilla.',
        );
      }

      const sinSueldo = mensuales
        .filter((o) => Number(o.sueldo_base ?? 0) <= 0)
        .map((o) => o.codigo ?? '?')
        .join(', ');
      throw new Error(
        `Falta el sueldo base de: ${sinSueldo}. Cárgalo en Operarios —en la ficha de cada uno, sección Contrato— o escribe el costo de planilla a mano.`,
      );
    }

    // Reemplaza la línea de planilla del mes si ya existe, para no duplicarla.
    await sbAny
      .from('areas_costos_mensuales')
      .delete()
      .eq('area_id', areaId)
      .eq('periodo', periodo)
      .eq('categoria', 'MANO_OBRA')
      .eq('concepto', 'Planilla del área (sueldos base)');

    const { error } = await sbAny.from('areas_costos_mensuales').insert({
      area_id: areaId,
      periodo,
      categoria: 'MANO_OBRA',
      concepto: 'Planilla del área (sueldos base)',
      monto: Math.round(total * 100) / 100,
      observacion: `Traído automáticamente de ${ops.length} operario(s) activo(s) del área`,
      registrado_por: userId,
    });
    if (error) throw new Error(error.message);
    return { operarios: ops.length, total: Math.round(total * 100) / 100 };
  });
  if (r.ok) await bumpPaths(`/configuracion/areas/${areaId}/costos`);
  return r;
}

/**
 * Aplica el valor minuto calculado al área y lo deja registrado en el histórico
 * con la nota de cómo se obtuvo.
 */
export async function aplicarValorMinuto(
  areaId: string,
  periodo: string,
  valorMinuto: number,
  nota: string,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    periodoSchema.parse(periodo);
    if (!(valorMinuto > 0)) throw new Error('El valor minuto calculado debe ser mayor a 0.');
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const valor = Math.round(valorMinuto * 1000) / 1000;
    const { error } = await sbAny
      .from('areas_produccion')
      .update({ valor_minuto: valor })
      .eq('id', areaId);
    if (error) throw new Error(error.message);

    // Histórico: el mismo que muestra el ícono del reloj en Áreas.
    await sbAny.from('areas_valor_minuto_historial').insert({
      area_id: areaId,
      periodo,
      valor_minuto: valor,
      notas: nota.slice(0, 300),
      creado_por: userId,
    });
    return null;
  });
  if (r.ok) await bumpPaths(`/configuracion/areas/${areaId}/costos`, '/configuracion/areas', '/reportes');
  return r;
}
