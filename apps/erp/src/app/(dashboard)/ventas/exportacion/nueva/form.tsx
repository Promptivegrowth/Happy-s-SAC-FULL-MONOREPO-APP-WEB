'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Trash2, Search, RefreshCw, Info } from 'lucide-react';
import { registrarVentaExportacion } from '@/server/actions/ventas-exportacion';
import { obtenerTipoCambio, type TipoCambio } from '@/server/actions/tipo-cambio';

type Pais = {
  codigo_iso: string;
  codigo_sunat: string;
  nombre: string;
  moneda_sugerida: string;
  puerto_default: string | null;
  incoterm_default: string | null;
  acuerdo_comercial: string | null;
  certificado_origen_requerido: boolean;
  arancel_preferencial_pct: number;
  iva_pais_destino_pct: number | null;
  observaciones: string | null;
};
type Almacen = { id: string; codigo: string; nombre: string };
type Variante = {
  id: string;
  sku: string;
  talla: string;
  precio_publico: number | null;
  productos: { nombre: string; codigo: string } | null;
};
type Linea = { variante_id: string; cantidad: number; precio_unitario: number; descuento_monto: number };

const INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'] as const;

export function NuevaVentaExportForm({
  paises, almacenes, variantes, serie, parametros,
}: {
  paises: Pais[];
  almacenes: Almacen[];
  variantes: Variante[];
  serie: string;
  parametros: { drawback_pct: number; igv_pct: number; drawback_tope_uit: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Datos exportación
  const [almacenId, setAlmacenId] = useState(almacenes[0]?.id ?? '');
  const [paisIso, setPaisIso] = useState(paises[0]?.codigo_iso ?? '');
  const [incoterm, setIncoterm] = useState<typeof INCOTERMS[number]>('FOB');
  const [moneda, setMoneda] = useState<'USD'|'EUR'|'PEN'>('USD');
  const [tipoCambio, setTipoCambio] = useState<string>('3.80');
  const [tcInfo, setTcInfo] = useState<TipoCambio | null>(null);
  const [tcLoading, setTcLoading] = useState(false);
  const [puertoSalida, setPuertoSalida] = useState('');
  const [numeroDua, setNumeroDua] = useState('');

  // Cliente extranjero
  const [razonSocial, setRazonSocial] = useState('');
  const [docExtranjero, setDocExtranjero] = useState('');
  const [direccionExtranjero, setDireccionExtranjero] = useState('');

  // Líneas
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [buscarSku, setBuscarSku] = useState('');

  const paisActual = paises.find((p) => p.codigo_iso === paisIso);

  // Auto-cargar TC SBS al montar y cuando cambia la moneda
  useEffect(() => {
    if (moneda === 'PEN') { setTcInfo(null); setTipoCambio('1.0000'); return; }
    setTcLoading(true);
    obtenerTipoCambio(moneda).then((tc) => {
      setTcInfo(tc);
      // Usamos el promedio (compra + venta) / 2 — es lo que aduana valida.
      const promedio = ((tc.compra + tc.venta) / 2).toFixed(4);
      setTipoCambio(promedio);
    }).finally(() => setTcLoading(false));
  }, [moneda]);

  // Auto-fill al elegir país
  function elegirPais(iso: string) {
    setPaisIso(iso);
    const p = paises.find((x) => x.codigo_iso === iso);
    if (!p) return;
    setMoneda(p.moneda_sugerida as 'USD'|'EUR'|'PEN');
    if (p.incoterm_default) setIncoterm(p.incoterm_default as typeof INCOTERMS[number]);
    if (p.puerto_default && !puertoSalida) setPuertoSalida(p.puerto_default);
  }

  async function refrescarTipoCambio() {
    if (moneda === 'PEN') return;
    setTcLoading(true);
    const tc = await obtenerTipoCambio(moneda);
    setTcInfo(tc);
    setTipoCambio(((tc.compra + tc.venta) / 2).toFixed(4));
    setTcLoading(false);
  }

  const varFiltradas = useMemo(() => {
    if (!buscarSku) return [];
    const q = buscarSku.toLowerCase();
    return variantes
      .filter((v) => v.sku.toLowerCase().includes(q) || (v.productos?.nombre ?? '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [buscarSku, variantes]);

  function agregarLinea(v: Variante) {
    if (lineas.some((l) => l.variante_id === v.id)) return;
    const nueva: Linea = {
      variante_id: v.id, cantidad: 1,
      precio_unitario: Number(v.precio_publico ?? 0), descuento_monto: 0,
    };
    setLineas([...lineas, nueva]);
    setBuscarSku('');
  }

  function actualizarLinea(idx: number, patch: Partial<Linea>) {
    const nuevas = [...lineas];
    nuevas[idx] = { ...nuevas[idx], ...patch } as Linea;
    setLineas(nuevas);
  }

  function eliminarLinea(idx: number) {
    setLineas(lineas.filter((_, i) => i !== idx));
  }

  // Cálculos derivados
  const tcNum = Number(tipoCambio || 0);
  const subtotal = lineas.reduce((s, l) => s + (l.cantidad * l.precio_unitario - l.descuento_monto), 0);
  const totalPen = subtotal * tcNum;
  const drawbackEstimado = totalPen * parametros.drawback_pct / 100;
  const saldoFavorExportador = totalPen - totalPen / (1 + parametros.igv_pct / 100);
  const ivaDestinoImporte = paisActual?.iva_pais_destino_pct
    ? subtotal * paisActual.iva_pais_destino_pct / 100
    : null;

  const monedaSimbolo = moneda === 'USD' ? '$' : moneda === 'EUR' ? '€' : 'S/';

  function submit() {
    setErr(null);
    if (!razonSocial.trim()) { setErr('Falta razón social del cliente extranjero.'); return; }
    if (!docExtranjero.trim()) { setErr('Falta documento (pasaporte / TAX ID) del cliente.'); return; }
    if (!tcNum || tcNum <= 0) { setErr('Tipo de cambio inválido.'); return; }
    if (lineas.length === 0) { setErr('Agregá al menos un ítem.'); return; }

    start(async () => {
      const res = await registrarVentaExportacion({
        almacen_id: almacenId,
        pais_destino_iso: paisIso,
        incoterm,
        moneda,
        tipo_cambio: tcNum,
        puerto_salida: puertoSalida.trim() || null,
        codigo_operacion_sunat: '0200',
        numero_dua: numeroDua.trim() || null,
        razon_social: razonSocial.trim(),
        documento_extranjero: docExtranjero.trim(),
        direccion_extranjero: direccionExtranjero.trim() || null,
        tipo_documento_cliente: 'PASAPORTE',
        items: lineas.map((l) => ({
          variante_id: l.variante_id, cantidad: l.cantidad,
          precio_unitario: l.precio_unitario, descuento_monto: l.descuento_monto,
        })),
      });
      if (!res.ok) { setErr(res.error); return; }
      router.push('/ventas/exportacion');
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        Se emitirá con serie <code className="rounded bg-white px-1 font-mono">{serie}</code> —
        Código operación SUNAT <code className="rounded bg-white px-1 font-mono">0200</code> (Exportación de bienes)
      </Card>

      <Card className="p-4">
        <FormSection title="Datos del comprador extranjero">
          <FormGrid cols={2}>
            <FormRow label="Razón social / Nombre del importador" required>
              <Input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="ACME IMPORT S.A." />
            </FormRow>
            <FormRow label="Documento (Pasaporte / TAX ID)" required>
              <Input value={docExtranjero} onChange={(e) => setDocExtranjero(e.target.value)} placeholder="RUC extranjero, RUT, tax ID, pasaporte" />
            </FormRow>
            <FormRow label="Dirección en país destino">
              <Input value={direccionExtranjero} onChange={(e) => setDireccionExtranjero(e.target.value)} />
            </FormRow>
          </FormGrid>
        </FormSection>
      </Card>

      <Card className="p-4">
        <FormSection title="Datos de exportación">
          <FormGrid cols={3}>
            <FormRow label="Almacén origen" required>
              <select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className="h-10 w-full rounded-md border border-input px-3 text-sm">
                {almacenes.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
              </select>
            </FormRow>
            <FormRow label="País destino" required>
              <select value={paisIso} onChange={(e) => elegirPais(e.target.value)} className="h-10 w-full rounded-md border border-input px-3 text-sm">
                {paises.map((p) => <option key={p.codigo_iso} value={p.codigo_iso}>{p.nombre}</option>)}
              </select>
            </FormRow>
            <FormRow label="INCOTERM" required hint="Condiciones de entrega">
              <select value={incoterm} onChange={(e) => setIncoterm(e.target.value as never)} className="h-10 w-full rounded-md border border-input px-3 text-sm">
                {INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </FormRow>
            <FormRow label="Moneda" required>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value as never)} className="h-10 w-full rounded-md border border-input px-3 text-sm">
                <option value="USD">USD — Dólar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="PEN">PEN — Sol</option>
              </select>
            </FormRow>
            <FormRow label={`Tipo cambio ${moneda} → PEN`} required hint={tcInfo ? `${tcInfo.fuente} · ${tcInfo.fecha}` : 'SUNAT'}>
              <div className="flex gap-2">
                <Input type="number" step="0.0001" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} disabled={moneda === 'PEN'} />
                {moneda !== 'PEN' && (
                  <Button type="button" size="sm" variant="outline" onClick={refrescarTipoCambio} disabled={tcLoading} className="shrink-0">
                    <RefreshCw className={`h-3.5 w-3.5 ${tcLoading ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </FormRow>
            <FormRow label="Puerto/aeropuerto salida" hint="Auto por país">
              <Input value={puertoSalida} onChange={(e) => setPuertoSalida(e.target.value)} />
            </FormRow>
            <FormRow label="N° DUA (opcional)" hint="Declaración Única de Aduanas — si ya tenés">
              <Input value={numeroDua} onChange={(e) => setNumeroDua(e.target.value)} />
            </FormRow>
          </FormGrid>

          {paisActual && (
            <div className="mt-4 space-y-2 rounded-md border border-sky-200 bg-sky-50/70 p-3 text-xs">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-sky-300 bg-white text-sky-800">
                  SUNAT cat. 04: <span className="ml-1 font-mono">{paisActual.codigo_sunat}</span>
                </Badge>
                {paisActual.acuerdo_comercial && paisActual.acuerdo_comercial !== 'NINGUNO' && (
                  <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">
                    Acuerdo: {paisActual.acuerdo_comercial} · Arancel {paisActual.arancel_preferencial_pct}%
                  </Badge>
                )}
                {paisActual.certificado_origen_requerido && (
                  <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                    ⚠ Requiere Certificado de Origen
                  </Badge>
                )}
                {paisActual.iva_pais_destino_pct != null && (
                  <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                    IVA {paisActual.nombre}: {paisActual.iva_pais_destino_pct}% (paga importador)
                  </Badge>
                )}
              </div>
              {paisActual.observaciones && (
                <p className="flex gap-2 text-sky-900">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{paisActual.observaciones}</span>
                </p>
              )}
            </div>
          )}
        </FormSection>
      </Card>

      <Card className="p-4">
        <FormSection title="Productos a exportar">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Buscar por SKU o nombre..." className="pl-8" value={buscarSku} onChange={(e) => setBuscarSku(e.target.value)} />
              {varFiltradas.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg">
                  {varFiltradas.map((v) => (
                    <button key={v.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => agregarLinea(v)}>
                      <span>
                        <span className="font-mono text-xs text-slate-500">{v.sku}</span>{' '}
                        {v.productos?.nombre} · <span className="text-xs">talla {v.talla.replace('T','')}</span>
                      </span>
                      <Badge variant="outline">{monedaSimbolo}{Number(v.precio_publico ?? 0).toFixed(2)}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lineas.length === 0 && (
              <div className="rounded border border-dashed p-6 text-center text-sm text-slate-500">
                Aún no agregaste productos.
              </div>
            )}
            {lineas.map((l, idx) => {
              const v = variantes.find((x) => x.id === l.variante_id);
              return (
                <div key={l.variante_id} className="grid grid-cols-[1fr_80px_100px_100px_100px_40px] gap-2 rounded border p-2">
                  <div className="text-sm">
                    <p className="font-medium">{v?.productos?.nombre}</p>
                    <p className="font-mono text-xs text-slate-500">{v?.sku} · T{v?.talla.replace('T','')}</p>
                  </div>
                  <Input type="number" min={1} value={l.cantidad} onChange={(e) => actualizarLinea(idx, { cantidad: Math.max(1, Number(e.target.value)) })} />
                  <Input type="number" step="0.01" value={l.precio_unitario} onChange={(e) => actualizarLinea(idx, { precio_unitario: Number(e.target.value) })} />
                  <Input type="number" step="0.01" min={0} value={l.descuento_monto} onChange={(e) => actualizarLinea(idx, { descuento_monto: Number(e.target.value) })} placeholder="Desc." />
                  <div className="text-right text-sm font-semibold">
                    {(l.cantidad * l.precio_unitario - l.descuento_monto).toFixed(2)}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => eliminarLinea(idx)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                </div>
              );
            })}
          </div>
        </FormSection>
      </Card>

      {/* Panel de cálculos automáticos */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-corp-900">Cálculos automáticos</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Subtotal {moneda}</p>
            <p className="mt-1 font-display text-xl font-semibold text-corp-900">
              {monedaSimbolo} {subtotal.toFixed(2)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">IGV 0% — Art. 33 Ley IGV</p>
          </div>

          <div className="rounded-lg border bg-emerald-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700">Total equivalente</p>
            <p className="mt-1 font-display text-xl font-semibold text-emerald-800">
              S/ {totalPen.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-[10px] text-emerald-700">TC {tcNum.toFixed(4)}</p>
          </div>

          <div className="rounded-lg border border-happy-200 bg-happy-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-happy-700">Drawback estimado ({parametros.drawback_pct}%)</p>
            <p className="mt-1 font-display text-xl font-semibold text-happy-900">
              S/ {drawbackEstimado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-[10px] text-happy-700">D.S. 104-95-EF — solicitar a SUNAT</p>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-indigo-700">Saldo a favor exportador</p>
            <p className="mt-1 font-display text-xl font-semibold text-indigo-900">
              S/ {saldoFavorExportador.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-[10px] text-indigo-700">Art. 34 Ley IGV — cota superior</p>
          </div>
        </div>

        {ivaDestinoImporte != null && paisActual && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-medium">Info importador:</span> El comprador en {paisActual.nombre} pagará
            aproximadamente <strong>{monedaSimbolo}{ivaDestinoImporte.toFixed(2)}</strong> de IVA ({paisActual.iva_pais_destino_pct}%)
            al momento de importar. No lo facturamos nosotros.
          </div>
        )}

        {err && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700 whitespace-pre-line">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/ventas/exportacion')}>Cancelar</Button>
          <Button variant="premium" onClick={submit} disabled={pending || lineas.length === 0}>
            {pending ? 'Emitiendo...' : 'Emitir factura de exportación'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
