'use client';

/**
 * Modal "Lupita de stock" — muestra el stock de una variante en TODOS los
 * almacenes activos. Se abre desde el catálogo del POS al hacer click en
 * el ícono de lupa al lado de cada talla.
 */

import { useEffect, useState } from 'react';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Loader2, MapPin, Package, Store, Warehouse, X } from 'lucide-react';
import { obtenerStockPorAlmacen, type StockPorAlmacenItem } from '@/server/actions/stock-multi-almacen';

export function StockAlmacenesModal({
  varianteId,
  onClose,
}: {
  varianteId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [variante, setVariante] = useState<{ sku: string; talla: string; producto_nombre: string; producto_codigo: string | null } | null>(null);
  const [almacenes, setAlmacenes] = useState<StockPorAlmacenItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    obtenerStockPorAlmacen(varianteId)
      .then((r) => {
        setVariante(r.variante);
        setAlmacenes(r.almacenes);
        setTotal(r.total);
      })
      .finally(() => setLoading(false));
  }, [varianteId]);

  function iconoTipo(tipo: string) {
    if (tipo === 'TIENDA') return <Store className="h-4 w-4 text-sky-600" />;
    if (tipo === 'PRODUCTO_TERMINADO') return <Package className="h-4 w-4 text-emerald-600" />;
    if (tipo === 'MATERIA_PRIMA') return <Warehouse className="h-4 w-4 text-amber-600" />;
    return <Package className="h-4 w-4 text-slate-500" />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-corp-900">
              <MapPin className="h-4 w-4 text-happy-600" />
              Stock en todos los almacenes
            </h2>
            {variante && (
              <p className="text-xs text-slate-500">
                {variante.producto_nombre} · Talla {variante.talla.replace('T', '')}
                <span className="ml-1 font-mono text-slate-400">({variante.sku})</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Total */}
            <div className="mt-4 rounded-lg bg-happy-50 border border-happy-200 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-happy-700">Total entre almacenes</p>
              <p className="font-display text-3xl font-semibold text-happy-700">{total}</p>
              <p className="text-[10px] text-slate-500">unidades disponibles</p>
            </div>

            {/* Lista por almacén */}
            <div className="mt-4 space-y-1.5">
              {almacenes.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">Sin almacenes activos.</p>
              ) : (
                almacenes.map((a) => (
                  <div
                    key={a.almacen_id}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                      a.es_actual ? 'border-happy-300 bg-happy-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {iconoTipo(a.almacen_tipo)}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">
                        {a.almacen_nombre}
                        {a.es_actual && (
                          <Badge className="ml-2 bg-happy-100 text-happy-700 text-[9px]">Aquí</Badge>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">{a.almacen_codigo}</div>
                    </div>
                    <span
                      className={`font-mono text-lg font-semibold ${
                        a.cantidad > 5 ? 'text-emerald-700' :
                        a.cantidad > 0 ? 'text-amber-700' :
                        'text-slate-300'
                      }`}
                    >
                      {a.cantidad}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </Card>
    </div>
  );
}
