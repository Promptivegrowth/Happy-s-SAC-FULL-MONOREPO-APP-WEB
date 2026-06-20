'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { CreditCard, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { registrarPagoOC } from '@/server/actions/pagos-proveedores';
import { METODOS_PAGO_PROVEEDOR, type MetodoPago } from '@/server/actions/pagos-proveedores-helpers';

const METODO_LABEL: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TARJETA_DEBITO: 'Tarjeta de débito',
  TARJETA_CREDITO: 'Tarjeta de crédito',
  TRANSFERENCIA: 'Transferencia bancaria',
  DEPOSITO: 'Depósito en cuenta',
  CREDITO: 'Crédito (sin egreso)',
};

export function RegistrarPagoBtn({
  ocId,
  ocNumero,
  saldo,
  proveedor,
}: {
  ocId: string;
  ocNumero: string;
  saldo: number;
  proveedor: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState(saldo.toFixed(2));
  const [metodo, setMetodo] = useState<MetodoPago>('TRANSFERENCIA');
  const [refBancaria, setRefBancaria] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [observacion, setObservacion] = useState('');

  function pagar() {
    const m = Number(monto);
    if (!m || m <= 0) return toast.error('Monto inválido');
    if (m > saldo + 0.01) return toast.error(`Monto excede el saldo (S/ ${saldo.toFixed(2)})`);
    startTransition(async () => {
      const r = await registrarPagoOC({
        oc_id: ocId,
        fecha,
        monto: m,
        metodo,
        referencia_bancaria: refBancaria || null,
        comprobante_proveedor: comprobante || null,
        observacion: observacion || null,
      });
      if (!r.ok || !r.data) {
        toast.error(r.error ?? 'No se pudo registrar el pago');
        return;
      }
      toast.success(`Pago ${r.data.numero} registrado`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CreditCard className="h-3.5 w-3.5" /> Pagar
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Registrar pago</h3>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} disabled={isPending}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">OC</span><span className="font-mono font-medium">{ocNumero}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Proveedor</span><span className="font-medium">{proveedor}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-600">Saldo pendiente</span><span className="font-mono font-semibold text-rose-700">S/ {saldo.toFixed(2)}</span></div>
            </div>

            <div className="space-y-3">
              <Row label="Fecha">
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Row>
              <Row label="Monto *">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                />
                <div className="mt-1 flex gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setMonto(saldo.toFixed(2))}
                    className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 hover:bg-emerald-100"
                  >
                    Total (S/ {saldo.toFixed(2)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonto((saldo / 2).toFixed(2))}
                    className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 hover:bg-slate-200"
                  >
                    50%
                  </button>
                </div>
              </Row>
              <Row label="Método de pago *">
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {METODOS_PAGO_PROVEEDOR.map((m) => (
                    <option key={m} value={m}>{METODO_LABEL[m]}</option>
                  ))}
                </select>
              </Row>
              <Row label="Referencia bancaria">
                <Input
                  value={refBancaria}
                  onChange={(e) => setRefBancaria(e.target.value)}
                  placeholder="N° operación, transferencia, voucher…"
                />
              </Row>
              <Row label="N° factura/comprobante del proveedor">
                <Input
                  value={comprobante}
                  onChange={(e) => setComprobante(e.target.value)}
                  placeholder="Ej: F001-12345"
                />
              </Row>
              <Row label="Observación">
                <Textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  rows={2}
                  placeholder="Notas internas (opcional)"
                />
              </Row>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={pagar} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar pago
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
