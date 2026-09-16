'use server';

/**
 * Anulación de boletas.
 *
 * Una boleta mal emitida en el mostrador —el cliente pidió factura, se cargó
 * mal el monto, se cobró dos veces— hay que poder anularla, y SUNAT tiene que
 * enterarse.
 *
 * Las boletas NO se dan de baja de a una: se informan dentro del Resumen
 * Diario, marcadas con la condición "anular". Da igual si la boleta ya había
 * sido aceptada o si todavía no se había informado; el camino es el mismo
 * resumen, y lo manda el envío automático en su próxima corrida.
 *
 * Las FACTURAS no pasan por acá. Se van a SUNAT en el momento de emitirse y se
 * anulan con una Comunicación de Baja dentro de los 7 días, o con una nota de
 * crédito después. Eso todavía no está en el sistema: se hace desde el portal
 * de SUNAT. Es mejor decirlo que dejar un botón que anule solo por dentro y le
 * haga creer a alguien que SUNAT se enteró.
 */

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const schema = z.object({
  comprobanteId: z.string().uuid(),
  motivo: z.string().trim().min(5, 'Explica en pocas palabras por qué se anula'),
});

export type ResultadoAnulacion = {
  numero: string;
  unidadesDevueltas: number;
  /** La caja del turno ya estaba cerrada: la plata se devuelve aparte. */
  cajaCerrada: boolean;
};

export async function anularBoleta(
  entrada: z.infer<typeof schema>,
): Promise<ActionResult<ResultadoAnulacion>> {
  const r = await runAction(async () => {
    const { comprobanteId, motivo } = schema.parse(entrada);
    const { sb, userId } = await requireUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: comp, error: errComp } = await sbAny
      .from('comprobantes')
      .select('id, tipo, estado, numero_completo, serie, numero, venta_id, fecha_emision')
      .eq('id', comprobanteId)
      .maybeSingle();
    if (errComp) throw new Error(errComp.message);
    if (!comp) throw new Error('El comprobante no existe');

    if (comp.tipo !== 'BOLETA') {
      throw new Error(
        `Desde acá solo se anulan boletas. Una ${String(comp.tipo).toLowerCase()} ya está en ` +
          'SUNAT desde que se emitió: se da de baja desde el portal de SUNAT (Clave SOL), ' +
          'dentro de los 7 días, o con una nota de crédito si ya pasó el plazo.',
      );
    }
    if (comp.estado === 'ANULADO') throw new Error('Esta boleta ya estaba anulada');

    const numero = comp.numero_completo ?? `${comp.serie}-${comp.numero}`;

    /*
     * La venta se anula junto con el comprobante.
     *
     * El cuadre de caja suma las ventas COMPLETADAS, así que dejarla como está
     * significaría que la caja sigue esperando una plata que se devolvió.
     */
    let unidadesDevueltas = 0;
    let cajaCerrada = false;

    if (comp.venta_id) {
      const { data: venta } = await sbAny
        .from('ventas')
        .select('id, numero, estado, almacen_id, caja_sesion_id')
        .eq('id', comp.venta_id)
        .maybeSingle();

      if (venta && venta.estado !== 'ANULADA') {
        const { data: lineas } = await sbAny
          .from('ventas_lineas')
          .select('variante_id, cantidad')
          .eq('venta_id', venta.id);

        /*
         * La mercadería vuelve al almacén.
         *
         * Se registra como movimiento de entrada, no se edita el stock a mano:
         * el kardex tiene que poder explicar de dónde salió cada unidad, y una
         * anulación es exactamente el tipo de cosa que después alguien viene a
         * preguntar.
         */
        const movs = ((lineas ?? []) as Array<{ variante_id: string; cantidad: number }>).map((l) => ({
          tipo: 'ENTRADA_AJUSTE' as const,
          almacen_id: venta.almacen_id,
          variante_id: l.variante_id,
          cantidad: l.cantidad,
          referencia_tipo: 'ANULACION',
          referencia_id: venta.id,
          usuario_id: userId,
          observacion: `Anulación de ${numero} — ${motivo}`,
        }));
        if (movs.length > 0) {
          const { error: errKardex } = await sbAny.from('kardex_movimientos').insert(movs);
          // Si el stock no vuelve, no se anula nada: quedaría un comprobante
          // anulado con la mercadería descontada, que es peor que no anular.
          if (errKardex) throw new Error(`No se pudo devolver el stock: ${errKardex.message}`);
          unidadesDevueltas = movs.reduce((a, m) => a + Number(m.cantidad ?? 0), 0);
        }

        const { error: errVenta } = await sbAny
          .from('ventas')
          .update({ estado: 'ANULADA' })
          .eq('id', venta.id);
        if (errVenta) throw new Error(errVenta.message);

        if (venta.caja_sesion_id) {
          const { data: sesion } = await sbAny
            .from('cajas_sesiones')
            .select('cerrada_en')
            .eq('id', venta.caja_sesion_id)
            .maybeSingle();
          cajaCerrada = Boolean(sesion?.cerrada_en);
        }
      }
    }

    const { error: errAnular } = await sbAny
      .from('comprobantes')
      .update({
        estado: 'ANULADO',
        anulado_en: new Date().toISOString(),
        anulado_por: userId,
        motivo_anulacion: motivo,
        // Nula a propósito: la baja todavía no viajó a SUNAT. La manda el
        // envío automático, dentro del resumen diario.
        anulacion_informada_en: null,
      })
      .eq('id', comprobanteId)
      .neq('estado', 'ANULADO');
    if (errAnular) throw new Error(errAnular.message);

    await bumpPaths('/comprobantes', `/comprobantes/${comprobanteId}`, '/pos', '/inventario');
    return { numero, unidadesDevueltas, cajaCerrada };
  });
  return r;
}
