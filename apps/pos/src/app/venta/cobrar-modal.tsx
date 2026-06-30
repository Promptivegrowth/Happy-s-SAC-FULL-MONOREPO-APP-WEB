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

import { useState, useEffect, useRef } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import {
  FileText, Receipt, ScrollText, Loader2, Printer, FileType2, ChevronLeft, X, Building2, IdCard,
  Search, UserPlus, UserCheck, Phone, Mail, MapPin, Plus, Edit3, Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import type { TipoComprobantePOS, TipoDocumentoCliente, FormatoImpresion } from '@/server/actions/caja-helpers';
import { buscarClientesPOS, crearClienteRapidoPOS, actualizarClientePOS, type ClienteRow } from '@/server/actions/clientes';
import { obtenerSaldoCliente } from '@/server/actions/adelantos';
import { listarVendedoresPOS, type VendedorOpcion } from '@/server/actions/vendedores';

export type CobrarPayload = {
  tipo: TipoComprobantePOS;
  formato: FormatoImpresion;
  cliente: {
    /** UUID del cliente persistido si vino del buscador / acaba de ser creado. null = cliente anónimo */
    cliente_id: string | null;
    tipo_documento: TipoDocumentoCliente | null;
    numero_documento: string | null;
    razon_social: string | null;
    nombres: string | null;
    apellidos: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
  };
  /** Si el cliente tenía saldo a favor y aceptó aplicarlo, este monto se descuenta. */
  adelanto_aplicado?: { monto: number } | null;
  /** Vendedor que atendió esta venta (puede ser distinto al cajero logueado).
   *  Si null/undefined, se usa el cajero logueado en el server. */
  vendedor_usuario_id?: string | null;
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

  // Cliente — modo búsqueda vs creación manual
  type ClienteMode = 'buscar' | 'crear' | 'seleccionado' | 'anonimo';
  const [clienteMode, setClienteMode] = useState<ClienteMode>('buscar');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteRow | null>(null);

  // Saldo de adelantos del cliente (se carga al seleccionar) + flag de aplicación
  const [saldoAdelanto, setSaldoAdelanto] = useState(0);
  const [aplicarAdelanto, setAplicarAdelanto] = useState(true);  // por defecto: aplicar si hay saldo

  // Vendedor que atendió la venta (puede ser distinto al cajero)
  const [vendedores, setVendedores] = useState<VendedorOpcion[]>([]);
  const [vendedorId, setVendedorId] = useState<string>('');
  useEffect(() => {
    listarVendedoresPOS().then((vs) => {
      setVendedores(vs);
    }).catch(() => setVendedores([]));
  }, []);

  // Buscador
  const [busqueda, setBusqueda] = useState(defaultCliente?.documento ?? defaultCliente?.nombre ?? '');
  const [resultados, setResultados] = useState<ClienteRow[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [yaBusco, setYaBusco] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form manual (creación rápida o anónimo)
  const initialDoc = defaultCliente?.documento ?? '';
  const [tipoDoc, setTipoDoc] = useState<TipoDocumentoCliente | ''>(
    initialDoc.length === 11 ? 'RUC' : initialDoc.length === 8 ? 'DNI' : '',
  );
  const [numDoc, setNumDoc] = useState(initialDoc);
  const [razonSocial, setRazonSocial] = useState(defaultCliente?.nombre ?? '');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [editandoExistente, setEditandoExistente] = useState(false);
  const [consultandoSunat, setConsultandoSunat] = useState(false);

  // Consulta a SUNAT/RENIEC vía /api/sunat (Decolecta API en backend ERP/POS).
  // Autocompleta razón social/nombre y dirección si encuentra.
  async function consultarSunat() {
    if (!tipoDoc) {
      toast.error('Seleccioná tipo DNI o RUC');
      return;
    }
    if (tipoDoc !== 'DNI' && tipoDoc !== 'RUC') {
      toast.error('Solo DNI o RUC se pueden consultar');
      return;
    }
    const num = numDoc.trim();
    if (tipoDoc === 'DNI' && num.length !== 8) {
      toast.error('DNI debe tener 8 dígitos');
      return;
    }
    if (tipoDoc === 'RUC' && num.length !== 11) {
      toast.error('RUC debe tener 11 dígitos');
      return;
    }
    setConsultandoSunat(true);
    try {
      const r = await fetch(`/api/sunat/${tipoDoc.toLowerCase()}/${num}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        toast.error(err.error ?? 'No se encontró');
        return;
      }
      const data = await r.json();
      if (tipoDoc === 'DNI') {
        setRazonSocial(data.nombreCompleto ?? '');
        toast.success('Datos cargados de RENIEC');
      } else {
        setRazonSocial(data.razonSocial ?? '');
        if (data.direccion) setDireccion(data.direccion);
        const partes = [data.estado, data.condicion].filter(Boolean).join(' · ');
        toast.success(`Datos cargados de SUNAT${partes ? ' · ' + partes : ''}`);
      }
    } catch (e) {
      toast.error('Error consultando SUNAT: ' + (e as Error).message);
    } finally {
      setConsultandoSunat(false);
    }
  }

  const [confirming, setConfirming] = useState(false);

  // Debounce de búsqueda
  useEffect(() => {
    if (clienteMode !== 'buscar') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      setYaBusco(false);
      return;
    }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await buscarClientesPOS(q);
        setResultados(rows);
        setYaBusco(true);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [busqueda, clienteMode]);

  function seleccionarCliente(c: ClienteRow) {
    setClienteSeleccionado(c);
    setClienteMode('seleccionado');
    // Pre-cargar campos por si se necesitan en confirmación
    setTipoDoc(c.tipo_documento);
    setNumDoc(c.numero_documento);
    setRazonSocial(c.nombre_para_mostrar);
    setDireccion(c.direccion ?? '');
    setTelefono(c.telefono ?? '');
    setEmail(c.email ?? '');
    // Consultar saldo de adelantos del cliente (asíncrono, no bloqueante)
    obtenerSaldoCliente(c.id).then(setSaldoAdelanto).catch(() => setSaldoAdelanto(0));
  }

  function irACrearNuevo() {
    // Heurística: si la búsqueda son solo dígitos, precargar como documento
    const q = busqueda.trim();
    if (/^\d{8}$/.test(q)) {
      setTipoDoc('DNI');
      setNumDoc(q);
      setRazonSocial('');
    } else if (/^\d{11}$/.test(q)) {
      setTipoDoc('RUC');
      setNumDoc(q);
      setRazonSocial('');
    } else {
      if (!tipoDoc) setTipoDoc('DNI');
      setRazonSocial(q);
      setNumDoc('');
    }
    setDireccion('');
    setTelefono('');
    setEmail('');
    setClienteMode('crear');
  }

  function volverABuscar() {
    setClienteMode('buscar');
    setClienteSeleccionado(null);
    setSaldoAdelanto(0);
    setEditandoExistente(false);
  }

  function irAVentaAnonima() {
    setClienteMode('anonimo');
    setClienteSeleccionado(null);
    setTipoDoc('');
    setNumDoc('');
    setRazonSocial('');
    setDireccion('');
    setTelefono('');
    setEmail('');
  }

  async function guardarClienteRapido(): Promise<boolean> {
    if (!tipoDoc) {
      toast.error('Seleccioná el tipo de documento');
      return false;
    }
    if (!numDoc.trim()) {
      toast.error('El número de documento es obligatorio');
      return false;
    }
    if (tipoDoc === 'DNI' && numDoc.length !== 8) {
      toast.error('DNI debe tener 8 dígitos');
      return false;
    }
    if (tipoDoc === 'RUC' && numDoc.length !== 11) {
      toast.error('RUC debe tener 11 dígitos');
      return false;
    }
    if (!razonSocial.trim() || razonSocial.trim().length < 2) {
      toast.error('Ingresá el nombre del cliente');
      return false;
    }
    setGuardandoCliente(true);
    try {
      const r = await crearClienteRapidoPOS({
        tipo_documento: tipoDoc,
        numero_documento: numDoc.trim(),
        nombre_completo: razonSocial.trim(),
        telefono: telefono.trim() || '',
        email: email.trim() || '',
        direccion: direccion.trim() || '',
      });
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
      seleccionarCliente(r.cliente);
      toast.success('Cliente guardado');
      return true;
    } finally {
      setGuardandoCliente(false);
    }
  }

  async function guardarEdicionExistente(): Promise<boolean> {
    if (!clienteSeleccionado) return false;
    setGuardandoCliente(true);
    try {
      const r = await actualizarClientePOS(clienteSeleccionado.id, {
        nombre_completo: razonSocial.trim() || undefined,
        telefono: telefono.trim(),
        email: email.trim(),
        direccion: direccion.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
      // Refrescar el cliente seleccionado con los nuevos datos
      setClienteSeleccionado({
        ...clienteSeleccionado,
        nombre_para_mostrar: razonSocial.trim() || clienteSeleccionado.nombre_para_mostrar,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        direccion: direccion.trim() || null,
      });
      setEditandoExistente(false);
      toast.success('Cliente actualizado');
      return true;
    } finally {
      setGuardandoCliente(false);
    }
  }

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

  async function nextStepDesdeCliente() {
    // Si el cajero está en modo creación: guardar primero
    if (clienteMode === 'crear') {
      const ok = await guardarClienteRapido();
      if (!ok) return;
    }
    if (clienteMode === 'seleccionado' && editandoExistente) {
      const ok = await guardarEdicionExistente();
      if (!ok) return;
    }
    // Para FACTURA es OBLIGATORIO que haya cliente con RUC
    if (tipo === 'FACTURA') {
      const docOk = clienteSeleccionado
        ? clienteSeleccionado.tipo_documento === 'RUC'
        : tipoDoc === 'RUC' && numDoc.length === 11;
      const nombreOk = clienteSeleccionado
        ? !!clienteSeleccionado.nombre_para_mostrar
        : !!razonSocial.trim();
      if (!docOk) {
        toast.error('Para FACTURA el cliente debe tener RUC');
        return;
      }
      if (!nombreOk) {
        toast.error('Razón social obligatoria');
        return;
      }
    }
    // BOLETA acepta anónimo o con datos parciales. Si capturó número, validar formato.
    if (tipo === 'BOLETA' && clienteMode === 'anonimo') {
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
      // Construir payload del cliente desde la fuente correcta
      const fuente = clienteSeleccionado
        ? {
            id: clienteSeleccionado.id,
            tipo_documento: clienteSeleccionado.tipo_documento,
            numero_documento: clienteSeleccionado.numero_documento,
            razon_social: clienteSeleccionado.razon_social,
            nombres: clienteSeleccionado.nombres,
            apellido_paterno: clienteSeleccionado.apellido_paterno,
            apellido_materno: clienteSeleccionado.apellido_materno,
            direccion: clienteSeleccionado.direccion,
            telefono: clienteSeleccionado.telefono,
            email: clienteSeleccionado.email,
          }
        : null;

      let nombres: string | null = fuente?.nombres ?? null;
      let apellidos: string | null = [fuente?.apellido_paterno, fuente?.apellido_materno].filter(Boolean).join(' ') || null;
      let razon: string | null = fuente?.razon_social ?? null;

      if (!fuente) {
        // Modo anónimo o crear-pero-no-confirmado: split heurístico
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
      }

      // Adelanto a aplicar (si corresponde): solo si cliente seleccionado, tiene
      // saldo, el cajero aceptó (checkbox marcado), y el monto a descontar es > 0
      const adelantoMonto = aplicarAdelanto && saldoAdelanto > 0.01
        ? Math.min(saldoAdelanto, total)
        : 0;

      await onConfirmar({
        tipo,
        formato,
        cliente: {
          cliente_id: fuente?.id ?? null,
          tipo_documento: (fuente?.tipo_documento ?? tipoDoc) || null,
          numero_documento: (fuente?.numero_documento ?? numDoc.trim()) || null,
          razon_social: razon,
          nombres,
          apellidos,
          direccion: (fuente?.direccion ?? direccion.trim()) || null,
          telefono: (fuente?.telefono ?? telefono.trim()) || null,
          email: (fuente?.email ?? email.trim()) || null,
        },
        adelanto_aplicado: adelantoMonto > 0 ? { monto: adelantoMonto } : null,
        vendedor_usuario_id: vendedorId || null,
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
              {/* MODE: BUSCAR */}
              {clienteMode === 'buscar' && (
                <>
                  <div>
                    <Label className="text-xs">Buscar cliente por DNI / RUC / nombre</Label>
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Escribe al menos 2 caracteres…"
                        className="pl-9"
                        autoFocus
                      />
                      {buscando && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Resultados */}
                  {resultados.length > 0 && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
                      {resultados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => seleccionarCliente(c)}
                          className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-happy-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-corp-900">{c.nombre_para_mostrar}</p>
                            <p className="text-[11px] text-slate-500">
                              {c.tipo_documento} {c.numero_documento}
                              {c.telefono && <> · 📞 {c.telefono}</>}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px]">Seleccionar</Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  {yaBusco && resultados.length === 0 && !buscando && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-center">
                      <p className="text-sm text-slate-600">No se encontró ningún cliente con "{busqueda}"</p>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" onClick={irACrearNuevo} disabled={busqueda.trim().length < 2}>
                      <UserPlus className="h-4 w-4" /> Crear nuevo cliente
                    </Button>
                    {tipo !== 'FACTURA' && (
                      <Button variant="ghost" onClick={irAVentaAnonima}>
                        Continuar sin cliente registrado
                      </Button>
                    )}
                  </div>
                </>
              )}

              {/* MODE: SELECCIONADO */}
              {clienteMode === 'seleccionado' && clienteSeleccionado && !editandoExistente && (
                <Card className="border-emerald-300 bg-emerald-50/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-emerald-100 p-2">
                        <UserCheck className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-display text-base font-semibold text-corp-900">
                          {clienteSeleccionado.nombre_para_mostrar}
                        </p>
                        <p className="text-xs text-slate-600">
                          {clienteSeleccionado.tipo_documento} {clienteSeleccionado.numero_documento}
                        </p>
                        {clienteSeleccionado.telefono && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <Phone className="h-3 w-3" /> {clienteSeleccionado.telefono}
                          </p>
                        )}
                        {clienteSeleccionado.email && (
                          <p className="flex items-center gap-1 text-xs text-slate-500">
                            <Mail className="h-3 w-3" /> {clienteSeleccionado.email}
                          </p>
                        )}
                        {clienteSeleccionado.direccion && (
                          <p className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="h-3 w-3" /> {clienteSeleccionado.direccion}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditandoExistente(true)}>
                        <Edit3 className="h-3 w-3" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={volverABuscar}>
                        Cambiar
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Sugerencia: saldo a favor del cliente (adelantos) */}
              {clienteMode === 'seleccionado' && clienteSeleccionado && saldoAdelanto > 0.01 && (
                <Card className="border-violet-300 bg-violet-50/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="aplicar-adelanto"
                        checked={aplicarAdelanto}
                        onChange={(e) => setAplicarAdelanto(e.target.checked)}
                        className="h-4 w-4 rounded border-violet-400 text-violet-600"
                      />
                      <label htmlFor="aplicar-adelanto" className="cursor-pointer">
                        <p className="font-display text-sm font-semibold text-violet-700">
                          💰 Tiene S/ {saldoAdelanto.toFixed(2)} a favor
                        </p>
                        <p className="text-[11px] text-violet-600">
                          {aplicarAdelanto
                            ? `Se descontará ${formatPEN(Math.min(saldoAdelanto, total))} del total a cobrar.`
                            : 'Click para aplicar como descuento.'}
                        </p>
                      </label>
                    </div>
                    {aplicarAdelanto && (
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-violet-600">A cobrar</p>
                        <p className="font-display text-lg font-bold text-violet-700">
                          {formatPEN(Math.max(0, total - Math.min(saldoAdelanto, total)))}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* MODE: CREAR | EDITAR EXISTENTE — mismo form, distinto submit */}
              {(clienteMode === 'crear' || (clienteMode === 'seleccionado' && editandoExistente) || clienteMode === 'anonimo') && (
                <>
                  {clienteMode === 'crear' && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      <Plus className="mr-1 inline h-3 w-3" />
                      Cliente nuevo. Sólo documento y nombre son obligatorios — el resto se completa luego desde el ERP.
                    </div>
                  )}
                  {clienteMode === 'anonimo' && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                      Venta sin cliente registrado. Si el cliente da DNI, completalo abajo y aparecerá impreso en la boleta sin crear ficha.
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                    <div>
                      <Label className="text-xs">Tipo documento</Label>
                      <select
                        value={tipoDoc}
                        onChange={(e) => setTipoDoc(e.target.value as TipoDocumentoCliente | '')}
                        disabled={editandoExistente}
                        className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        {tipo === 'FACTURA' ? (
                          <option value="RUC">RUC</option>
                        ) : (
                          <>
                            {clienteMode === 'anonimo' && <option value="">— Sin documento —</option>}
                            <option value="DNI">DNI</option>
                            <option value="RUC">RUC</option>
                            <option value="CE">CE</option>
                            <option value="PASAPORTE">Pasaporte</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">
                        Número documento {(tipo === 'FACTURA' || clienteMode === 'crear') && <span className="text-red-500">*</span>}
                      </Label>
                      <div className="relative mt-1 flex gap-1">
                        <div className="relative flex-1">
                          <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            value={numDoc}
                            onChange={(e) => setNumDoc(e.target.value.replace(/\D/g, ''))}
                            maxLength={11}
                            disabled={editandoExistente}
                            placeholder={tipo === 'FACTURA' || tipoDoc === 'RUC' ? '11 dígitos' : tipoDoc === 'DNI' ? '8 dígitos' : 'Número'}
                            className="pl-9 disabled:bg-slate-50 disabled:text-slate-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (tipoDoc === 'DNI' || tipoDoc === 'RUC') && !editandoExistente) {
                                e.preventDefault();
                                void consultarSunat();
                              }
                            }}
                          />
                        </div>
                        {(tipoDoc === 'DNI' || tipoDoc === 'RUC') && !editandoExistente && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={consultarSunat}
                            disabled={consultandoSunat || !numDoc}
                            title={`Buscar en ${tipoDoc === 'DNI' ? 'RENIEC' : 'SUNAT'}`}
                            className="shrink-0 px-3"
                          >
                            {consultandoSunat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                      {(tipoDoc === 'DNI' || tipoDoc === 'RUC') && !editandoExistente && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          Enter para consultar {tipoDoc === 'DNI' ? 'RENIEC' : 'SUNAT'} y autocompletar nombre.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">
                      {tipoDoc === 'DNI' || tipoDoc === 'CE' || tipoDoc === 'PASAPORTE' ? 'Nombre completo' : 'Razón social / Nombre'}
                      {(tipo === 'FACTURA' || clienteMode === 'crear') && <span className="text-red-500">*</span>}
                    </Label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={razonSocial}
                        onChange={(e) => setRazonSocial(e.target.value)}
                        placeholder={tipo === 'FACTURA' ? 'EMPRESA S.A.C.' : 'Juan Pérez Gómez'}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Teléfono / WhatsApp</Label>
                      <div className="relative mt-1">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value.replace(/[^\d+]/g, ''))}
                          placeholder="987654321"
                          className="pl-9"
                          maxLength={15}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="cliente@email.com"
                          type="email"
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Dirección {tipo === 'FACTURA' && '(recomendada)'}</Label>
                    <div className="relative mt-1">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        placeholder="Av. Ejemplo 123, Lima"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {(clienteMode === 'crear' || editandoExistente) && (
                    <Button variant="outline" onClick={volverABuscar} size="sm">
                      ← Volver a buscar
                    </Button>
                  )}
                  {clienteMode === 'anonimo' && (
                    <Button variant="outline" onClick={volverABuscar} size="sm">
                      ← Volver a buscar cliente
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="mt-6 flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('tipo')} disabled={guardandoCliente}>
                <ChevronLeft className="h-4 w-4" /> Volver
              </Button>
              <Button
                variant="premium"
                onClick={nextStepDesdeCliente}
                disabled={
                  guardandoCliente ||
                  (clienteMode === 'buscar' && tipo === 'FACTURA') /* obliga seleccionar/crear para FACTURA */
                }
              >
                {guardandoCliente && <Loader2 className="h-4 w-4 animate-spin" />}
                {clienteMode === 'crear' ? 'Guardar y continuar' : editandoExistente ? 'Guardar y continuar' : 'Continuar'}
              </Button>
            </div>
          </>
        )}

        {/* STEP 3 — FORMATO */}
        {step === 'formato' && (
          <>
            {/* Selector de VENDEDOR (obligatorio) — atribuye la venta a quien atendió.
                Útil cuando varias vendedoras comparten una caja (comisiones). */}
            <div className="mt-5 rounded-lg border-2 border-happy-200 bg-happy-50/30 p-4">
              <Label className="text-xs font-semibold text-happy-700">
                Vendedor que atendió esta venta *
              </Label>
              <select
                value={vendedorId}
                onChange={(e) => setVendedorId(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm font-medium"
                required
              >
                <option value="">— Seleccioná tu nombre —</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-600">
                Aparece en el reporte de ventas para cálculo de comisiones. Si no lo seleccionás, queda como el cajero logueado.
              </p>
            </div>

            {/* Formato de impresión — compacto. Default ticketera 80mm.
                El cliente pidió que no haya un paso extra de selección — solo
                un link opcional para cambiar a A4 si el caso lo amerita
                (ej. factura corporativa). */}
            <div className="mt-4 flex items-center justify-between rounded-md border bg-slate-50/50 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-slate-700">
                <Printer className="h-3.5 w-3.5 text-emerald-600" />
                Se imprimirá en <strong>ticketera 80mm</strong> automáticamente
              </span>
              <button
                type="button"
                onClick={() => setFormato(formato === 'TICKET_80MM' ? 'A4' : 'TICKET_80MM')}
                className="text-[11px] text-slate-500 underline hover:text-corp-700"
              >
                {formato === 'TICKET_80MM' ? 'usar A4 esta vez' : '← volver a 80mm'}
              </button>
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
