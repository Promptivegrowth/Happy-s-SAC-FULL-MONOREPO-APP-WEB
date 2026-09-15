'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { formatTallaChip } from '@happy/lib';
import { esCodigoImprimible } from '@happy/lib/barcode';
import { Printer, Loader2, X, ScanBarcode, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { generarTicketPrueba, type MuestraPrueba } from './ticket-prueba';
import { abrirPDF } from './comprobante-pdf';
import { construirTicketPrueba } from '@happy/lib/escpos/prueba';
import { encolarTicket, esperarImpresion } from './cola-impresion';
import { equipoParaImprimir } from './imprimir-ticket';
import type { EquipoImpresion } from './cola-impresion';

type VarianteMin = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  talla: string;
  productos: { nombre: string };
};

/** Cuántos productos se imprimen para probar la pistola. */
const MUESTRAS = 3;

/**
 * Modal de PRUEBA DE IMPRESIÓN. No registra nada: imprime un ticket de 80 mm
 * con una regla, un bloque negro, tildes y códigos de barras de productos
 * reales, para verificar impresora, corte y pistola en un solo papel.
 */
export function PruebaImpresionModal({
  variantes,
  caja,
  cajero,
  empresaNombre,
  stockPorVariante = {},
  almacenId,
  onClose,
}: {
  variantes: VarianteMin[];
  caja: string;
  cajero: string;
  empresaNombre: string;
  stockPorVariante?: Record<string, number>;
  /** Tienda de la caja: se prefiere su ticketera. */
  almacenId?: string | null;
  onClose: () => void;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);
  /**
   * La computadora con ticketera que va a imprimir.
   *
   * `undefined` mientras se busca, `null` cuando no hay ninguna instalada: en
   * ese caso el botón sigue sacando el PDF como antes.
   */
  const [equipo, setEquipo] = useState<EquipoImpresion | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    void equipoParaImprimir(almacenId).then((e) => { if (vivo) setEquipo(e); });
    return () => { vivo = false; };
  }, [almacenId]);
  /** Cambia la tanda de productos para no probar siempre con los mismos. */
  const [tanda, setTanda] = useState(0);

  const candidatas = useMemo(
    () =>
      variantes.filter((v) => {
        const codigo = (v.codigo_barras ?? '').trim() || v.sku.trim();
        return esCodigoImprimible(codigo);
      }),
    [variantes],
  );

  const muestras: MuestraPrueba[] = useMemo(() => {
    // Se prefieren prendas con stock: al escanearlas, el POS las agrega y el
    // cajero ve el precio y la talla, que es la prueba completa.
    const conStock = candidatas.filter((v) => (stockPorVariante[v.id] ?? 0) > 0);
    const base = conStock.length >= MUESTRAS ? conStock : candidatas;
    if (base.length === 0) return [];
    const salida: MuestraPrueba[] = [];
    for (let i = 0; i < Math.min(MUESTRAS, base.length); i++) {
      const v = base[(tanda * MUESTRAS + i) % base.length]!;
      const cb = (v.codigo_barras ?? '').trim();
      salida.push({
        codigo: cb || v.sku.trim(),
        nombre: v.productos.nombre,
        talla: formatTallaChip(v.talla),
        esSku: !cb,
      });
    }
    return salida;
  }, [candidatas, stockPorVariante, tanda]);

  async function imprimir() {
    setImprimiendo(true);
    try {
      // Hora de Perú: UTC-5 todo el año, sin horario de verano desde 1994.
      const lima = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const iso = lima.toISOString();
      const fechaHora = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;

      // Camino bueno: por la ticketera, que es lo que hay que calibrar.
      if (equipo) {
        const ticket = construirTicketPrueba({
          empresa: empresaNombre,
          equipo: equipo.nombre,
          caja,
          cajero,
          fechaHora,
          avanceCorteMm: equipo.avance_corte_mm ?? 15,
          muestras: muestras.map((m) => ({
            codigo: m.codigo, nombre: m.nombre, talla: m.talla, esSku: m.esSku,
          })),
        });

        const encolado = await encolarTicket(ticket.aBase64(), equipo.id, {
          descripcion: 'Ticket de prueba de impresión',
        });
        if (!encolado.ok) {
          toast.error(`No se pudo encolar: ${encolado.error}`);
          return;
        }

        const estado = await esperarImpresion(encolado.id, 15);
        if (estado === 'impreso') {
          toast.success(`Ticket de prueba impreso en ${equipo.nombre}`);
        } else if (estado === 'esperando') {
          toast.warning(
            `El ticket está en cola en ${equipo.nombre} y todavía no sale. Revisa que la ticketera tenga papel y esté encendida.`,
            { duration: 9000 },
          );
        } else {
          toast.error(`La ticketera de ${equipo.nombre} no pudo imprimir. Mira el detalle en el ERP, en Configuración → Impresión de tickets.`);
        }
        return;
      }

      // Sin agente instalado: el PDF de siempre, con el diálogo de Windows.
      const blob = generarTicketPrueba({ empresaNombre, caja, cajero, muestras, fechaHora });
      abrirPDF(blob, `prueba-impresion-${iso.slice(0, 10)}.pdf`, true);
      toast.success('Ticket de prueba enviado a imprimir');
    } catch (e) {
      toast.error(`No se pudo generar el ticket: ${(e as Error).message}`);
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-pos-no-focus>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-happy-600" />
            <h2 className="font-semibold text-corp-900">Probar impresora y pistola</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <p className="text-slate-600">
            Imprime un ticket de 80 mm que <b>no es comprobante</b>: no registra venta, no consume
            numeración y no se envía a SUNAT. Sirve para revisar todo de una vez y para calibrar
            dónde corta el papel.
          </p>

          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Qué tienes que mirar en el papel
            </p>
            <ul className="space-y-1.5 text-slate-700">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <b>La regla</b> tiene que entrar completa. Si el papel la corta, el tamaño del driver
                  no coincide con el rollo.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <b>El bloque negro</b> debe salir parejo. Si sale gris o con vetas, sube la densidad
                  en el driver.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <b>Las tildes y la ñ</b> deben leerse bien.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <b>El corte</b> debe caer sobre la línea del final.
                </span>
              </li>
              <li className="flex gap-2">
                <ScanBarcode className="mt-0.5 h-4 w-4 shrink-0 text-happy-600" />
                <span>
                  <b>Los códigos de barras</b>: escanéalos con la pistola en el buscador del POS. Cada
                  uno debe agregar la prenda y la talla que dice debajo.
                </span>
              </li>
            </ul>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Productos que van en el ticket
              </p>
              {candidatas.length > MUESTRAS && (
                <Button variant="ghost" size="sm" onClick={() => setTanda((t) => t + 1)} className="text-xs">
                  Cambiar productos
                </Button>
              )}
            </div>
            {muestras.length === 0 ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                No hay productos con código imprimible en este catálogo. El ticket va a servir igual
                para probar la impresora y el corte, pero no la pistola.
              </p>
            ) : (
              <div className="space-y-1.5">
                {muestras.map((m) => (
                  <div key={`${m.codigo}-${m.talla}`} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Badge variant="outline" className="font-mono">
                      {m.codigo}
                    </Badge>
                    <span className="flex-1 truncate text-slate-700">{m.nombre}</span>
                    <Badge variant="secondary">{m.talla}</Badge>
                    {m.esSku && (
                      <span className="text-[10px] text-amber-700" title="Esta talla no tiene código de barras cargado; se imprime su código interno, que el POS también lee">
                        interno
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Por dónde va a salir: es lo primero que hay que saber antes de
              interpretar el resultado de la prueba. */}
          {equipo === undefined ? (
            <p className="text-xs text-slate-500">Buscando la ticketera…</p>
          ) : equipo ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
              Sale por <b>{equipo.nombre}</b> con un avance de corte de{' '}
              <b>{equipo.avance_corte_mm ?? 15} mm</b>. Si el corte se come la última línea o deja
              papel en blanco, ajusta ese número en el ERP (Configuración → Impresión de tickets) y
              vuelve a imprimir esta prueba.
            </p>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              No hay ninguna computadora con el agente de impresión instalado, así que la prueba sale
              como PDF por el diálogo de Windows. Al imprimir elige <b>Tamaño real</b> o 100 %: con
              “ajustar a la página” las barras se deforman y la pistola falla.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="premium" onClick={imprimir} disabled={imprimiendo}>
            {imprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Imprimir ticket de prueba
          </Button>
        </div>
      </div>
    </div>
  );
}
