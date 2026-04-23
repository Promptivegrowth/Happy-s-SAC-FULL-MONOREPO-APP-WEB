'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Search, Trash2, Plus, Minus, ScanBarcode, X, Smartphone, CreditCard, Banknote, Building2, MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import { buildPedidoWaMessage, buildWhatsappUrl } from '@happy/lib/whatsapp';
import { registrarVenta } from '@/server/actions/venta';

type Variante = {
  id: string; sku: string; codigo_barras: string | null; talla: string;
  precio_publico: number | null;
  productos: { id: string; nombre: string; codigo: string; imagen_principal_url: string | null };
};
type Caja = { id: string; codigo: string; nombre: string; almacen_id: string };
type LineaCarrito = { variante: Variante; cantidad: number };
type MetodoCarrito = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'TRANSFERENCIA' | 'WHATSAPP_PENDIENTE';
type PagoLinea = { metodo: MetodoCarrito; monto: number };

export function PosTerminal({ variantes, cajas }: { variantes: Variante[]; cajas: Caja[] }) {
  const [search, setSearch] = useState('');
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [cajaId, setCajaId] = useState<string>(cajas[0]?.id ?? '');
  const [pagos, setPagos] = useState<PagoLinea[]>([]);
  const [tipoCliente, setTipoCliente] = useState<'rapido' | 'completo'>('rapido');
  const [nombreCliente, setNombreCliente] = useState('');
  const [docCliente, setDocCliente] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus en input para pistola de barras
  useEffect(() => {
    inputRef.current?.focus();
    const handler = () => inputRef.current?.focus();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const total = useMemo(() => carrito.reduce((a, l) => a + l.cantidad * Number(l.variante.precio_publico ?? 0), 0), [carrito]);
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  const vuelto = pagado - total;

  function agregarPorBarcode(input: string) {
    const barcode = input.trim();
    if (!barcode) return;
    const v = variantes.find((x) => x.codigo_barras === barcode || x.sku === barcode);
    if (!v) {
      toast.error(`Producto no encontrado: ${barcode}`);
      return;
    }
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.variante.id === v.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx]!, cantidad: copy[idx]!.cantidad + 1 };
        return copy;
      }
      return [...prev, { variante: v, cantidad: 1 }];
    });
    setSearch('');
  }

  function setQty(varianteId: string, qty: number) {
    setCarrito((prev) => prev.map((l) => l.variante.id === varianteId ? { ...l, cantidad: Math.max(1, qty) } : l));
  }

  function eliminar(varianteId: string) {
    setCarrito((prev) => prev.filter((l) => l.variante.id !== varianteId));
  }

  function agregarPago(metodo: MetodoCarrito, monto: number) {
    if (monto <= 0) return;
    setPagos((p) => [...p, { metodo, monto }]);
  }

  function quitarPago(idx: number) {
    setPagos((p) => p.filter((_, i) => i !== idx));
  }

  const [tipoComp, setTipoComp] = useState<'NOTA_VENTA' | 'BOLETA' | 'FACTURA'>('BOLETA');
  const [cobrando, setCobrando] = useState(false);

  async function cobrar() {
    if (carrito.length === 0) return toast.error('Carrito vacío');
    if (pagado < total) return toast.error(`Falta cobrar ${formatPEN(total - pagado)}`);
    const cajaActual = cajas.find((c) => c.id === cajaId);
    if (!cajaActual) return toast.error('Selecciona una caja');

    setCobrando(true);
    try {
      const r = await registrarVenta({
        caja_id: cajaId,
        almacen_id: cajaActual.almacen_id,
        cliente_id: null,
        documento_cliente: docCliente || null,
        tipo_documento_cliente: tipoCliente === 'completo' && docCliente
          ? ((docCliente.length === 11 ? 'RUC' : 'DNI') as 'DNI' | 'RUC')
          : null,
        nombre_cliente_rapido: nombreCliente || null,
        tipo_comprobante: tipoComp,
        items: carrito.map((l) => ({
          variante_id: l.variante.id,
          cantidad: l.cantidad,
          precio_unitario: Number(l.variante.precio_publico ?? 0),
          descuento_monto: 0,
        })),
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
      });
      if (r.ok) {
        toast.success(`✅ ${r.numero}${r.comprobante ? ` · ${r.comprobante.serie}-${String(r.comprobante.numero).padStart(8, '0')}` : ''} · ${formatPEN(total)}`);
        setCarrito([]);
        setPagos([]);
        setNombreCliente('');
        setDocCliente('');
      } else {
        toast.error(r.error);
      }
    } finally {
      setCobrando(false);
    }
  }

  function pedirPorWhatsapp() {
    if (carrito.length === 0) return;
    const msg = buildPedidoWaMessage({
      cliente: { nombre: nombreCliente, documento: docCliente },
      items: carrito.map((l) => ({
        sku: l.variante.sku, nombre: l.variante.productos.nombre, talla: l.variante.talla,
        cantidad: l.cantidad, precioUnit: Number(l.variante.precio_publico ?? 0),
      })),
      canal: 'POS',
    });
    window.open(buildWhatsappUrl(msg), '_blank');
  }

  const sugerencias = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return variantes
      .filter((v) => v.sku.toLowerCase().includes(q)
        || v.codigo_barras?.toLowerCase().includes(q)
        || v.productos.nombre.toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, variantes]);

  return (
    <div className="grid h-screen grid-cols-1 lg:grid-cols-[1fr_420px]">
      {/* IZQUIERDA — Búsqueda + carrito */}
      <section className="flex h-screen flex-col bg-white">
        <header className="border-b p-4">
          <div className="mb-3 flex items-center gap-2">
            <select value={cajaId} onChange={(e) => setCajaId(e.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <Badge variant="success" className="gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Caja abierta</Badge>
            <a href="/cierre" className="ml-auto text-xs text-slate-500 hover:text-happy-600">Cerrar caja →</a>
          </div>
          <div className="relative">
            <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-happy-500" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarPorBarcode(search)}
              placeholder="Escanea código de barras o busca por SKU/nombre…"
              className="h-12 pl-11 text-base"
              autoFocus
            />
          </div>
          {sugerencias.length > 0 && (
            <div className="mt-2 max-h-60 overflow-auto rounded-md border bg-white shadow-sm">
              {sugerencias.map((v) => (
                <button
                  key={v.id}
                  onClick={() => agregarPorBarcode(v.sku)}
                  className="flex w-full items-center gap-3 border-b p-2 text-left text-sm hover:bg-slate-50 last:border-0"
                >
                  <div className="font-mono text-xs text-slate-400">{v.sku}</div>
                  <div className="flex-1">{v.productos.nombre}</div>
                  <Badge variant="outline" className="text-[10px]">{v.talla.replace('T','')}</Badge>
                  <div className="font-semibold text-happy-600">{formatPEN(Number(v.precio_publico ?? 0))}</div>
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto p-4">
          {carrito.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              <div className="text-center">
                <ScanBarcode className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p>Escanea o busca un producto para empezar</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {carrito.map((l) => (
                <li key={l.variante.id}>
                  <Card className="flex items-center gap-3 p-3">
                    <div className="flex-1">
                      <p className="font-medium">{l.variante.productos.nombre}</p>
                      <p className="text-xs text-slate-500">SKU {l.variante.sku} · Talla {l.variante.talla.replace('T','')} · {formatPEN(Number(l.variante.precio_publico ?? 0))} c/u</p>
                    </div>
                    <div className="flex items-center rounded-md border">
                      <button onClick={() => setQty(l.variante.id, l.cantidad - 1)} className="px-3 py-2 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                      <span className="min-w-10 text-center font-semibold">{l.cantidad}</span>
                      <button onClick={() => setQty(l.variante.id, l.cantidad + 1)} className="px-3 py-2 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
                    </div>
                    <div className="w-24 text-right font-display text-base font-semibold">
                      {formatPEN(l.cantidad * Number(l.variante.precio_publico ?? 0))}
                    </div>
                    <button onClick={() => eliminar(l.variante.id)} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* DERECHA — Cliente + Pago */}
      <aside className="flex h-screen flex-col border-l bg-slate-50">
        <div className="border-b bg-white p-4">
          <div className="mb-3 flex gap-2 text-xs">
            <button onClick={() => setTipoCliente('rapido')} className={`flex-1 rounded-md px-3 py-2 ${tipoCliente === 'rapido' ? 'bg-happy-100 font-medium text-happy-700' : 'text-slate-500'}`}>Cliente rápido</button>
            <button onClick={() => setTipoCliente('completo')} className={`flex-1 rounded-md px-3 py-2 ${tipoCliente === 'completo' ? 'bg-happy-100 font-medium text-happy-700' : 'text-slate-500'}`}>Con DNI/RUC</button>
          </div>
          {tipoCliente === 'rapido' ? (
            <Input value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Nombre (opcional)" />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input value={docCliente} onChange={(e) => setDocCliente(e.target.value)} placeholder="DNI/RUC" />
              <Input value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Razón social/Nombre" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Métodos de pago</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { m: 'EFECTIVO', label: 'Efectivo', icon: <Banknote className="h-4 w-4" />, color: 'bg-emerald-50 text-emerald-700' },
              { m: 'YAPE', label: 'Yape', icon: <Smartphone className="h-4 w-4" />, color: 'bg-purple-50 text-purple-700' },
              { m: 'PLIN', label: 'Plin', icon: <Smartphone className="h-4 w-4" />, color: 'bg-blue-50 text-blue-700' },
              { m: 'TARJETA_CREDITO', label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" />, color: 'bg-slate-100 text-slate-700' },
              { m: 'TRANSFERENCIA', label: 'Transfer.', icon: <Building2 className="h-4 w-4" />, color: 'bg-slate-100 text-slate-700' },
            ] as const).map((p) => (
              <button
                key={p.m}
                onClick={() => agregarPago(p.m as MetodoCarrito, Math.max(0, total - pagado))}
                className={`flex items-center justify-center gap-2 rounded-lg border p-3 font-medium transition hover:scale-[1.02] ${p.color}`}
              >
                {p.icon}{p.label}
              </button>
            ))}
          </div>

          {pagos.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pagos aplicados</p>
              <div className="space-y-1">
                {pagos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
                    <span>{p.metodo.replace('_',' ')}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatPEN(p.monto)}</span>
                      <button onClick={() => quitarPago(i)}><X className="h-3 w-3 text-slate-400" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-white p-4">
          <div className="mb-3 space-y-1 text-sm">
            <Row label="Subtotal" value={formatPEN(total / 1.18)} />
            <Row label="IGV" value={formatPEN(total - total / 1.18)} />
            <Row label="Total" value={formatPEN(total)} bold />
            {pagado > 0 && <Row label="Pagado" value={formatPEN(pagado)} className="text-emerald-700" />}
            {pagado > total && <Row label="Vuelto" value={formatPEN(vuelto)} className="text-amber-700" bold />}
            {pagado < total && pagado > 0 && <Row label="Falta" value={formatPEN(total - pagado)} className="text-red-600" bold />}
          </div>
          <div className="mb-2 flex gap-1 text-xs">
            {(['NOTA_VENTA', 'BOLETA', 'FACTURA'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoComp(t)}
                className={`flex-1 rounded-md border px-2 py-1.5 transition ${tipoComp === t ? 'border-happy-500 bg-happy-50 font-medium text-happy-700' : 'hover:bg-slate-50'}`}
              >
                {t === 'NOTA_VENTA' ? 'Nota Venta' : t === 'BOLETA' ? 'Boleta' : 'Factura'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={pedirPorWhatsapp} variant="outline" size="lg" disabled={carrito.length === 0 || cobrando}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button onClick={cobrar} variant="premium" size="lg" disabled={pagado < total || cobrando}>
              {cobrando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {cobrando ? 'Cobrando…' : 'Cobrar'}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, bold, className = '' }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between ${className}`}>
      <span className={bold ? 'font-semibold' : 'text-slate-500'}>{label}</span>
      <span className={bold ? 'font-display text-lg font-semibold' : 'font-medium'}>{value}</span>
    </div>
  );
}
