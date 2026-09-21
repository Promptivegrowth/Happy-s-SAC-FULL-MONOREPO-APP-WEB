/**
 * Cotiza un pedido web con los precios de la base, no con los del navegador.
 *
 * El carrito vive en localStorage CON los precios guardados, y el checkout los
 * manda al crear el pedido. Mientras el pago se coordinaba por WhatsApp eso no
 * hacía daño: una persona miraba el monto antes de cobrar. Con tarjeta no hay
 * nadie mirando — quien sepa abrir la consola del navegador puede mandar
 * `precio: 1` y llevarse un disfraz de S/ 200 por un sol.
 *
 * Así que el servidor vuelve a calcular todo: precio unitario por variante,
 * escalón según la cantidad total, y costo de envío. Lo que mandó el navegador
 * solo sirve para comparar y avisar si los precios cambiaron mientras el
 * carrito estaba abierto.
 */

import { createServiceClient } from '@happy/db/service';
import {
  costoEnvio,
  type DestinoEnvio,
  escalonPorTotalItems,
  precioEfectivoLinea,
  type EscalonAplicado,
} from '@/lib/precios';

export type ItemPedido = { varianteId: string; cantidad: number };

export type LineaCotizada = {
  varianteId: string;
  cantidad: number;
  precioUnitario: number;
  subTotal: number;
  sku: string;
  nombre: string;
  talla: string;
};

export type Cotizacion = {
  lineas: LineaCotizada[];
  escalon: EscalonAplicado;
  totalItems: number;
  subTotal: number;
  envio: number;
  total: number;
};

type FilaVariante = {
  id: string;
  sku: string | null;
  talla: string | null;
  precio_publico: number | null;
  precio_mayorista_a: number | null;
  precio_mayorista_b: number | null;
  precio_industrial: number | null;
  productos: { nombre: string | null } | null;
};

export class ErrorCotizacion extends Error {}

/**
 * Precio del escalón de venta al público, por si hay que mostrarlo.
 * Mismo criterio que `obtenerPreciosVariantes`: fábrica cae en
 * `precio_industrial` y usa `precio_mayorista_b` de respaldo para productos
 * viejos que no lo tienen cargado.
 */
function preciosDe(v: FilaVariante) {
  const industrial = Number(v.precio_industrial ?? 0);
  return {
    precio: Number(v.precio_publico ?? 0),
    precioMayorista: Number(v.precio_mayorista_a ?? 0),
    precioFabrica: industrial > 0 ? industrial : Number(v.precio_mayorista_b ?? 0),
  };
}

export async function cotizarPedido(
  items: ItemPedido[],
  metodoEntrega: 'DELIVERY' | 'RECOJO_TIENDA',
  destino: DestinoEnvio | null = null,
): Promise<Cotizacion> {
  // Un mismo SKU puede venir repetido si el carrito quedó raro; se suma.
  const porVariante = new Map<string, number>();
  for (const i of items) {
    porVariante.set(i.varianteId, (porVariante.get(i.varianteId) ?? 0) + i.cantidad);
  }
  const ids = [...porVariante.keys()];
  if (ids.length === 0) throw new ErrorCotizacion('El pedido no tiene productos');

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('productos_variantes')
    .select(
      'id, sku, talla, precio_publico, precio_mayorista_a, precio_mayorista_b, ' +
        'precio_industrial, productos(nombre)',
    )
    .in('id', ids);

  // Sin el error no se puede distinguir "no hay precios" de "no se pudo
  // consultar", y cobrar sobre un total mal calculado es peor que no cobrar.
  if (error) throw new ErrorCotizacion(`No se pudieron leer los precios: ${error.message}`);

  const filas = new Map<string, FilaVariante>(
    ((data ?? []) as unknown as FilaVariante[]).map((v) => [v.id, v]),
  );
  const faltantes = ids.filter((id) => !filas.has(id));
  if (faltantes.length > 0) {
    throw new ErrorCotizacion(
      `${faltantes.length} producto(s) del carrito ya no existen en el catálogo`,
    );
  }

  const totalItems = [...porVariante.values()].reduce((a, c) => a + c, 0);
  const escalon = escalonPorTotalItems(totalItems);

  const lineas: LineaCotizada[] = [];
  for (const [varianteId, cantidad] of porVariante) {
    const v = filas.get(varianteId) as FilaVariante;
    const precioUnitario = precioEfectivoLinea(preciosDe(v), escalon);
    // Un precio en cero significa que la variante no tiene precio cargado en
    // el ERP. Regalarla es peor que no venderla, así que se corta acá.
    if (!(precioUnitario > 0)) {
      throw new ErrorCotizacion(
        `El producto ${v.productos?.nombre ?? v.sku ?? varianteId} no tiene precio cargado. ` +
          'Escríbenos por WhatsApp y lo cotizamos.',
      );
    }
    lineas.push({
      varianteId,
      cantidad,
      precioUnitario,
      subTotal: Number((precioUnitario * cantidad).toFixed(2)),
      sku: v.sku ?? '',
      nombre: v.productos?.nombre ?? '',
      talla: v.talla ?? '',
    });
  }

  const subTotal = Number(lineas.reduce((a, l) => a + l.subTotal, 0).toFixed(2));
  /*
   * Sin destino no se cobra envío: se cobra la mercadería y el flete se
   * coordina aparte. Es lo mismo que ve el comprador en pantalla, y tiene que
   * serlo — si acá se sumara algo que allá no se mostró, se le cobraría de más
   * sin avisarle.
   */
  const envio = costoEnvio(metodoEntrega, subTotal, destino) ?? 0;
  return {
    lineas,
    escalon,
    totalItems,
    subTotal,
    envio,
    total: Number((subTotal + envio).toFixed(2)),
  };
}
