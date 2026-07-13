'use client';

/**
 * Modal para gestionar ADELANTOS de cliente.
 *
 * Flujo principal: el cajero busca al cliente, ve su saldo y puede:
 *   - Registrar un nuevo adelanto (ENTRADA)
 *   - Devolver saldo al cliente (DEVOLUCION)
 *   - Ver historial de movimientos
 *
 * Si el cliente tiene saldo, al cobrar una venta normal el POS sugiere
 * automáticamente aplicarlo (eso se hace desde cobrar-modal).
 */

import { useEffect, useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import {
  ArrowDown, ArrowUp, CircleDollarSign, Loader2, Plus, Search, X, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import {
  obtenerSaldoCliente,
  listarMovimientosCliente,
  registrarEntradaAdelanto,
  registrarDevolucionAdelanto,
  type AdelantoMovimiento,
} from '@/server/actions/adelantos';
import { buscarClientesPOS, crearClienteRapidoPOS, type ClienteRow } from '@/server/actions/clientes';

type ClienteResult = ClienteRow;

export function AdelantosModal({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ClienteResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cliente, setCliente] = useState<ClienteResult | null>(null);
  const [saldo, setSaldo] = useState(0);
  const [movs, setMovs] = useState<AdelantoMovimiento[]>([]);

  // Form de nuevo movimiento
  const [tipo, setTipo] = useState<'ENTRADA' | 'DEVOLUCION'>('ENTRADA');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'TRANSFERENCIA'>('EFECTIVO');
  const [obs, setObs] = useState('');

  // Form de "crear cliente nuevo" — se abre inline cuando no hay coincidencias
  // (2026-07-12) el cliente reporto que no habia como registrar un cliente
  // que no existia todavia.
  const [crearOpen, setCrearOpen] = useState(false);
  const [nuevoTipoDoc, setNuevoTipoDoc] = useState<'DNI' | 'RUC' | 'CE' | 'PASAPORTE'>('DNI');
  const [nuevoDoc, setNuevoDoc] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTel, setNuevoTel] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);

  // Búsqueda con debounce
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      buscarClientesPOS(q).then((r) => {
        setResults(r as ClienteResult[]);
        setSearching(false);
      }).catch(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function seleccionar(c: ClienteResult) {
    setCliente(c);
    setResults([]);
    setQ('');
    const [s, m] = await Promise.all([
      obtenerSaldoCliente(c.id),
      listarMovimientosCliente(c.id),
    ]);
    setSaldo(s);
    setMovs(m);
  }

  function registrar() {
    if (!cliente) return toast.error('Seleccioná cliente primero');
    const m = Number(monto);
    if (!m || m <= 0) return toast.error('Monto inválido');
    if (tipo === 'DEVOLUCION' && m > saldo + 0.01) {
      return toast.error(`Saldo insuficiente (S/ ${saldo.toFixed(2)})`);
    }

    start(async () => {
      const fn = tipo === 'ENTRADA' ? registrarEntradaAdelanto : registrarDevolucionAdelanto;
      const r = await fn({
        cliente_id: cliente.id,
        monto: m,
        metodo_pago: metodo,
        observacion: obs.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo registrar');
        return;
      }
      toast.success(
        tipo === 'ENTRADA'
          ? `Adelanto registrado · S/ ${m.toFixed(2)}`
          : `Devolución registrada · S/ ${m.toFixed(2)}`,
      );
      setMonto('');
      setObs('');
      // Refrescar saldo + historial
      const [newSaldo, newMovs] = await Promise.all([
        obtenerSaldoCliente(cliente.id),
        listarMovimientosCliente(cliente.id),
      ]);
      setSaldo(newSaldo);
      setMovs(newMovs);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-corp-900/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-corp-900">
              <Wallet className="h-5 w-5 text-violet-600" />
              Adelantos de cliente
            </h2>
            <p className="text-xs text-slate-500">
              El cliente deja dinero sin definir productos. El saldo se aplica automáticamente en su próxima venta.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Buscador de cliente */}
        {!cliente ? (
          <div className="mt-5">
            <Label className="text-xs">Buscar cliente por nombre, DNI o RUC</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Escribí al menos 2 caracteres…"
                className="pl-9"
                autoFocus
              />
            </div>
            {searching && (
              <p className="mt-2 text-xs text-slate-400">Buscando…</p>
            )}
            {results.length > 0 && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-white shadow-sm">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => seleccionar(c)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-violet-50 border-b last:border-b-0"
                  >
                    <div className="font-medium text-slate-900">{c.nombre_para_mostrar}</div>
                    <div className="text-xs text-slate-500">
                      {c.tipo_documento} {c.numero_documento}{c.telefono ? ` · ${c.telefono}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {q.length >= 2 && !searching && results.length === 0 && !crearOpen && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">
                  Sin coincidencias con &quot;<span className="font-mono">{q}</span>&quot;.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Pre-cargar el input: si son solo dígitos usar como DNI/RUC,
                    // si tiene letras usar como nombre. Longitud 11 = RUC, 8 = DNI.
                    const soloDigitos = q.trim().replace(/\D/g, '');
                    const esNumeroPuro = /^\d+$/.test(q.trim());
                    if (esNumeroPuro) {
                      setNuevoDoc(soloDigitos);
                      setNuevoTipoDoc(soloDigitos.length === 11 ? 'RUC' : 'DNI');
                      setNuevoNombre('');
                    } else {
                      setNuevoDoc('');
                      setNuevoNombre(q.trim());
                    }
                    setCrearOpen(true);
                  }}
                >
                  + Registrar cliente nuevo
                </Button>
              </div>
            )}
            {crearOpen && (
              <div className="mt-3 space-y-2 rounded-md border border-violet-300 bg-violet-50/40 p-3">
                <p className="text-xs font-semibold text-violet-800">Nuevo cliente</p>
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <select
                    value={nuevoTipoDoc}
                    onChange={(e) => setNuevoTipoDoc(e.target.value as 'DNI' | 'RUC' | 'CE' | 'PASAPORTE')}
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"
                    disabled={creandoCliente}
                  >
                    <option value="DNI">DNI</option>
                    <option value="RUC">RUC</option>
                    <option value="CE">CE</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </select>
                  <Input
                    value={nuevoDoc}
                    onChange={(e) => setNuevoDoc(e.target.value.trim())}
                    placeholder="Número de documento"
                    disabled={creandoCliente}
                    className="font-mono text-xs"
                  />
                </div>
                <Input
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder={nuevoTipoDoc === 'RUC' ? 'Razón social' : 'Nombre completo'}
                  disabled={creandoCliente}
                  className="text-xs"
                />
                <Input
                  value={nuevoTel}
                  onChange={(e) => setNuevoTel(e.target.value.replace(/[^\d+]/g, ''))}
                  placeholder="Teléfono (opcional)"
                  disabled={creandoCliente}
                  className="font-mono text-xs"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setCrearOpen(false); setNuevoDoc(''); setNuevoNombre(''); setNuevoTel(''); }}
                    disabled={creandoCliente}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="premium"
                    disabled={
                      creandoCliente
                      || nuevoDoc.trim().length < 4
                      || nuevoNombre.trim().length < 2
                    }
                    onClick={async () => {
                      setCreandoCliente(true);
                      try {
                        const r = await crearClienteRapidoPOS({
                          tipo_documento: nuevoTipoDoc,
                          numero_documento: nuevoDoc.trim(),
                          nombre_completo: nuevoNombre.trim(),
                          telefono: nuevoTel.trim(),
                        });
                        if (r.ok) {
                          toast.success(`Cliente creado · ${r.cliente.nombre_para_mostrar}`);
                          setCrearOpen(false);
                          setNuevoDoc(''); setNuevoNombre(''); setNuevoTel('');
                          setQ('');
                          await seleccionar(r.cliente as ClienteResult);
                        } else {
                          toast.error(r.error);
                        }
                      } finally {
                        setCreandoCliente(false);
                      }
                    }}
                  >
                    {creandoCliente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Crear y seleccionar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tarjeta del cliente seleccionado */}
            <div className="mt-5 flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50/50 p-3">
              <div>
                <div className="font-medium text-corp-900">{cliente.nombre_para_mostrar}</div>
                <div className="text-xs text-slate-500">
                  {cliente.tipo_documento} {cliente.numero_documento}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setCliente(null); setMovs([]); setSaldo(0); }}>
                Cambiar
              </Button>
            </div>

            {/* Saldo */}
            <div className={`mt-4 rounded-lg border-2 p-4 ${saldo > 0.01 ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-slate-500">Saldo disponible</span>
                <CircleDollarSign className={`h-5 w-5 ${saldo > 0.01 ? 'text-emerald-600' : 'text-slate-400'}`} />
              </div>
              <p className={`font-display text-3xl font-semibold ${saldo > 0.01 ? 'text-emerald-700' : 'text-slate-400'}`}>
                {formatPEN(saldo)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {saldo > 0.01
                  ? 'Se aplicará automáticamente al cobrar la próxima venta de este cliente.'
                  : 'Sin saldo. Registrá una entrada abajo.'}
              </p>
            </div>

            {/* Form de movimiento */}
            <div className="mt-4 rounded-lg border bg-white p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Registrar movimiento
              </h3>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipo('ENTRADA')}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition ${
                    tipo === 'ENTRADA'
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <ArrowDown className="h-4 w-4" />
                  Recibir adelanto
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('DEVOLUCION')}
                  disabled={saldo < 0.01}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    tipo === 'DEVOLUCION'
                      ? 'border-rose-400 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <ArrowUp className="h-4 w-4" />
                  Devolver saldo
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Monto (S/) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Método *</Label>
                  <select
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value as typeof metodo)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="YAPE">Yape</option>
                    <option value="PLIN">Plin</option>
                    <option value="TARJETA_DEBITO">Tarjeta débito</option>
                    <option value="TARJETA_CREDITO">Tarjeta crédito</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <Label className="text-xs">Observación (opcional)</Label>
                <Input
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ej: adelanto por pedido escolar…"
                  className="mt-1"
                />
              </div>

              <Button onClick={registrar} disabled={pending} className="mt-4 w-full" variant="premium">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Registrar {tipo === 'ENTRADA' ? 'adelanto' : 'devolución'}
              </Button>
            </div>

            {/* Historial */}
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Historial ({movs.length})
              </h3>
              {movs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500">
                  Sin movimientos aún.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Fecha</th>
                        <th className="px-2 py-1.5 text-left">N°</th>
                        <th className="px-2 py-1.5 text-left">Tipo</th>
                        <th className="px-2 py-1.5 text-left">Método/Venta</th>
                        <th className="px-2 py-1.5 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movs.map((m) => {
                        const f = new Date(m.fecha).toLocaleString('es-PE', {
                          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                        });
                        const sign = m.tipo === 'ENTRADA' ? '+' : '-';
                        const color = m.tipo === 'ENTRADA' ? 'text-emerald-700' :
                                      m.tipo === 'DEVOLUCION' ? 'text-rose-700' :
                                      'text-violet-700';
                        return (
                          <tr key={m.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">{f}</td>
                            <td className="px-2 py-1.5 font-mono text-[11px]">{m.numero}</td>
                            <td className="px-2 py-1.5">
                              <Badge variant="secondary" className="text-[10px]">{m.tipo}</Badge>
                            </td>
                            <td className="px-2 py-1.5 text-slate-600">
                              {m.metodo_pago ?? (m.venta_id ? 'aplicado a venta' : '—')}
                            </td>
                            <td className={`px-2 py-1.5 text-right font-mono font-semibold ${color}`}>
                              {sign}{formatPEN(m.monto)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  );
}
