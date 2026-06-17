'use client';

/**
 * Modal de COBRO — encadena:
 *   1) elegir tipo de comprobante (BOLETA / FACTURA / DOCUMENTO INTERNO)
 *   2) capturar/confirmar datos del cliente (DNI/RUC + nombre + dirección)
 *   3) elegir formato de impresión (TICKET 80mm / A4)
 *
 * El bloque de métodos de pago se mantiene en el panel derecho del terminal —
 * acá sólo validamos que `pagado >= total` antes de confirmar.
 *
 * Al confirmar: dispara `onConfirmar(payload)` con todo lo necesario para que
 * el terminal llame a `registrarVenta` + `emitirComprobante` y genere el PDF.
 */

import { useState } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import {
  FileText, Receipt, ScrollText, Loader2, Printer, FileType2, ChevronLeft, X, Building2, IdCard,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import type { TipoComprobantePOS, TipoDocumentoCliente, FormatoImpresion } from '@/server/actions/caja-helpers';

export type CobrarPayload = {
  tipo: TipoComprobantePOS;
  formato: FormatoImpresion;
  cliente: {
    tipo_documento: TipoDocumentoCliente | null;
    numero_documento: string | null;
    razon_social: string | null;
    nombres: string | null;
    apellidos: string | null;
    direccion: string | null;
  };
};

export function CobrarModal({
  total,
  pagado,
  defaultCliente,
  onCancel,
  onConfirmar,
}: {
  total: number;
  pagado: number;
  defaultCliente?: { nombre?: string; documento?: string };
  onCancel: () => void;
  onConfirmar: (payload: CobrarPayload) => Promise<void>;
}) {
  const [step, setStep] = useState<'tipo' | 'cliente' | 'formato'>('tipo');
  const [tipo, setTipo] = useState<TipoComprobantePOS>('BOLETA');
  const [formato, setFormato] = useState<FormatoImpresion>('TICKET_80MM');

  // Cliente
  const initialDoc = defaultCliente?.documento ?? '';
  const [tipoDoc, setTipoDoc] = useState<TipoDocumentoCliente | ''>(
    initialDoc.length === 11 ? 'RUC' : initialDoc.length === 8 ? 'DNI' : '',
  );
  const [numDoc, setNumDoc] = useState(initialDoc);
  const [razonSocial, setRazonSocial] = useState(defaultCliente?.nombre ?? '');
  const [direccion, setDireccion] = useState('');

  const [confirming, setConfirming] = useState(false);

  const faltante = total - pagado;
  const pagoOk = faltante <= 0.01;

  function nextStepDesdeTipo() {
    if (!pagoOk) {
      toast.error(`Falta cobrar ${formatPEN(Math.max(0, faltante))}`);
      return;
    }
    if (tipo === 'NOTA_VENTA') {
      // Nota de venta: no requerimos datos cliente, vamos al formato
      setFormato('TICKET_80MM');
      setStep('formato');
    } else {
      // Default formato según tipo
      setFormato(tipo === 'FACTURA' ? 'A4' : 'TICKET_80MM');
      setStep('cliente');
    }
  }

  function nextStepDesdeCliente() {
    if (tipo === 'FACTURA') {
      if (tipoDoc !== 'RUC') {
        toast.error('Para FACTURA el cliente debe tener RUC');
        return;
      }
      if (!numDoc || numDoc.length !== 11) {
        toast.error('RUC debe tener 11 dígitos');
        return;
      }
      if (!razonSocial.trim()) {
        toast.error('Razón social obligatoria');
        return;
      }
    } else if (tipo === 'BOLETA') {
      // En boleta, DNI es opcional pero recomendado; si pone documento debe ser válido
      if (numDoc && tipoDoc === 'DNI' && numDoc.length !== 8) {
        toast.error('DNI debe tener 8 dígitos');
        return;
      }
      if (numDoc && tipoDoc === 'RUC' && numDoc.length !== 11) {
        toast.error('RUC debe tener 11 dígitos');
        return;
      }
    }
    setStep('formato');
  }

  async function confirmar() {
    setConfirming(true);
    try {
      // Split razón social → nombres/apellidos para DNI (heurística simple)
      let nombres: string | null = null;
      let apellidos: string | null = null;
      let razon: string | null = null;
      if (tipoDoc === 'DNI' && razonSocial.trim()) {
        const parts = razonSocial.trim().split(/\s+/);
        if (parts.length >= 2) {
          nombres = parts.slice(0, parts.length === 2 ? 1 : 2).join(' ');
          apellidos = parts.slice(parts.length === 2 ? 1 : 2).join(' ');
        } else {
          nombres = parts[0] ?? null;
        }
      } else {
        razon = razonSocial.trim() || null;
      }

      await onConfirmar({
        tipo,
        formato,
        cliente: {
          tipo_documento: tipoDoc || null,
          numero_documento: numDoc.trim() || null,
          razon_social: razon,
          nombres,
          apellidos,
          direccion: direccion.trim() || null,
        },
      });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-corp-900/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-corp-900">
              {step === 'tipo' && 'Tipo de comprobante'}
              {step === 'cliente' && 'Datos del cliente'}
              {step === 'formato' && 'Formato de impresión'}
            </h2>
            <p className="text-xs text-slate-500">
              Total a cobrar:{' '}
              <span className="font-mono font-semibold text-corp-900">{formatPEN(total)}</span>
              {!pagoOk && (
                <span className="ml-2 text-red-600">
                  · Falta {formatPEN(faltante)}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={confirming}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper */}
        <ol className="mt-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          <StepDot active={step === 'tipo'} done={step !== 'tipo'} label="Tipo" />
          <span className="h-px flex-1 bg-slate-200" />
          {tipo !== 'NOTA_VENTA' && (
            <>
              <StepDot active={step === 'cliente'} done={step === 'formato'} label="Cliente" />
              <span className="h-px flex-1 bg-slate-200" />
            </>
          )}
          <StepDot active={step === 'formato'} done={false} label="Impresión" />
        </ol>

        {/* STEP 1 — TIPO */}
        {step === 'tipo' && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <TipoCard
                icon={<Receipt className="h-6 w-6" />}
                title="Boleta"
                desc="Venta al consumidor final"
                selected={tipo === 'BOLETA'}
                onClick={() => setTipo('BOLETA')}
              />
              <TipoCard
                icon={<FileText className="h-6 w-6" />}
                title="Factura"
                desc="Empresa con RUC"
                selected={tipo === 'FACTURA'}
                onClick={() => setTipo('FACTURA')}
              />
              <TipoCard
                icon={<ScrollText className="h-6 w-6" />}
                title="Documento interno"
                desc="Sólo control, sin SUNAT"
                selected={tipo === 'NOTA_VENTA'}
                onClick={() => setTipo('NOTA_VENTA')}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>Cancelar</Button>
              <Button variant="premium" onClick={nextStepDesdeTipo} disabled={!pagoOk}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* STEP 2 — CLIENTE */}
        {step === 'cliente' && (
          <>
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <div>
                  <Label className="text-xs">Tipo documento</Label>
                  <select
                    value={tipoDoc}
                    onChange={(e) => setTipoDoc(e.target.value as TipoDocumentoCliente | '')}
                    className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"
                  >
                    {tipo === 'FACTURA' ? (
                      <option value="RUC">RUC</option>
                    ) : (
                      <>
                        <option value="">— Sin documento —</option>
                        <option value="DNI">DNI</option>
                        <option value="RUC">RUC</option>
                        <option value="CE">CE</option>
                        <option value="PASAPORTE">Pasaporte</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Número documento {tipo === 'FACTURA' && <span className="text-red-500">*</span>}</Label>
                  <div className="relative mt-1">
                    <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={numDoc}
                      onChange={(e) => setNumDoc(e.target.value.replace(/\D/g, ''))}
                      maxLength={11}
                      placeholder={tipo === 'FACTURA' ? '11 dígitos (RUC)' : '8 dígitos (DNI)'}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">
                  {tipoDoc === 'DNI' ? 'Nombre completo' : 'Razón social / Nombre'}
                  {tipo === 'FACTURA' && <span className="text-red-500">*</span>}
                </Label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    placeholder={tipo === 'FACTURA' ? 'EMPRESA S.A.C.' : 'Cliente Final'}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Dirección {tipo === 'FACTURA' && '(recomendada)'}</Label>
                <Input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Av. Ejemplo 123, Lima"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('tipo')}>
                <ChevronLeft className="h-4 w-4" /> Volver
              </Button>
              <Button variant="premium" onClick={nextStepDesdeCliente}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* STEP 3 — FORMATO */}
        {step === 'formato' && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <FormatoCard
                icon={<Printer className="h-6 w-6" />}
                title="Ticketera 80mm"
                desc="Papel térmico, formato compacto"
                selected={formato === 'TICKET_80MM'}
                onClick={() => setFormato('TICKET_80MM')}
              />
              <FormatoCard
                icon={<FileType2 className="h-6 w-6" />}
                title="A4"
                desc="Hoja completa con logo y datos"
                selected={formato === 'A4'}
                onClick={() => setFormato('A4')}
              />
            </div>

            <div className="mt-6 flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => setStep(tipo === 'NOTA_VENTA' ? 'tipo' : 'cliente')}
                disabled={confirming}
              >
                <ChevronLeft className="h-4 w-4" /> Volver
              </Button>
              <Button variant="premium" size="lg" onClick={confirmar} disabled={confirming}>
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                Cobrar {formatPEN(total)}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 ${active ? 'text-happy-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-happy-500' : done ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {label}
    </span>
  );
}

function TipoCard({
  icon, title, desc, selected, onClick,
}: { icon: React.ReactNode; title: string; desc: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-5 text-center transition ${
        selected
          ? 'border-happy-500 bg-happy-50 text-happy-700 shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-happy-300 hover:bg-happy-50/40'
      }`}
    >
      <span className={selected ? 'text-happy-600' : 'text-slate-400'}>{icon}</span>
      <span className="font-display text-base font-semibold">{title}</span>
      <span className="text-[11px] text-slate-500">{desc}</span>
    </button>
  );
}

function FormatoCard({
  icon, title, desc, selected, onClick,
}: { icon: React.ReactNode; title: string; desc: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
        selected
          ? 'border-happy-500 bg-happy-50 text-happy-700 shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-happy-300 hover:bg-happy-50/40'
      }`}
    >
      <span className={selected ? 'text-happy-600' : 'text-slate-400'}>{icon}</span>
      <div>
        <p className="font-display text-base font-semibold">{title}</p>
        <p className="text-[11px] text-slate-500">{desc}</p>
      </div>
    </button>
  );
}
