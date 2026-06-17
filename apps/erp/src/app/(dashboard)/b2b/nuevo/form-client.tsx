'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Loader2, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { crearPedidoB2B, type ClienteB2BItem } from '@/server/actions/b2b';
import {
  CONDICIONES_PAGO,
  LISTAS_PRECIO,
  type CondicionPago,
  type ListaPrecio,
} from '@/server/actions/b2b-helpers';

export function NuevoPedidoB2BForm({ clientes }: { clientes: ClienteB2BItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clienteId, setClienteId] = useState('');
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteOpen, setClienteOpen] = useState(false);
  const [listaPrecio, setListaPrecio] = useState<ListaPrecio>('MAYORISTA_A');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [condicionPago, setCondicionPago] = useState<string>('CONTADO');
  const [observacion, setObservacion] = useState('');

  const clienteSeleccionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clienteId, clientes],
  );

  const clientesFiltrados = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes.slice(0, 12);
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const qn = norm(q);
    return clientes
      .filter(
        (c) =>
          norm(c.razon_social).includes(qn) ||
          norm(c.documento).includes(qn) ||
          (c.email && norm(c.email).includes(qn)),
      )
      .slice(0, 25);
  }, [clienteQuery, clientes]);

  function pickCliente(c: ClienteB2BItem) {
    setClienteId(c.id);
    setClienteOpen(false);
    setClienteQuery('');
    // Sugerir lista de precio si el cliente tiene una preferida.
    if (c.lista_precio) setListaPrecio(c.lista_precio);
  }

  function enviar() {
    if (!clienteId) return toast.error('Selecciona un cliente');
    start(async () => {
      const r = await crearPedidoB2B({
        cliente_id: clienteId,
        lista_precio: listaPrecio,
        fecha_entrega_estimada: fechaEntrega || undefined,
        condicion_pago: (condicionPago as CondicionPago | '') || undefined,
        observacion: observacion || undefined,
      });
      if (r.ok && r.data) {
        toast.success(`Pedido ${r.data.numero} creado en borrador`);
        router.push(`/b2b/${r.data.id}`);
      } else {
        toast.error(r.error ?? 'No se pudo crear el pedido');
      }
    });
  }

  return (
    <div className="space-y-6">
      <FormSection
        title="Cliente"
        description="Selecciona el cliente al que se le emite el pedido."
      >
        <FormRow label="Cliente" required>
          {clienteSeleccionado ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-corp-900">
                  {clienteSeleccionado.razon_social}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {clienteSeleccionado.documento} · {clienteSeleccionado.tipo_cliente}
                  {clienteSeleccionado.email && ` · ${clienteSeleccionado.email}`}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[11px]"
                onClick={() => setClienteId('')}
                disabled={pending}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                value={clienteQuery}
                onChange={(e) => {
                  setClienteQuery(e.target.value);
                  setClienteOpen(true);
                }}
                onFocus={() => setClienteOpen(true)}
                onBlur={() => setTimeout(() => setClienteOpen(false), 150)}
                disabled={pending}
                className="h-9 pl-7"
                placeholder="Buscar por razón social, documento o email…"
              />
              {clienteOpen && clientesFiltrados.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border bg-white shadow-lg">
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCliente(c)}
                      className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-1.5 text-left text-xs last:border-0 hover:bg-happy-50"
                    >
                      <span className="font-medium text-corp-900">{c.razon_social}</span>
                      <span className="text-[10px] text-slate-500">
                        {c.documento} · {c.tipo_cliente}
                        {c.lista_precio && ` · prefiere ${c.lista_precio}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </FormRow>
      </FormSection>

      <FormSection
        title="Términos comerciales"
        description="Lista de precio y condiciones aplicables a este pedido."
      >
        <FormGrid cols={2}>
          <FormRow label="Lista de precio" required>
            <select
              value={listaPrecio}
              onChange={(e) => setListaPrecio(e.target.value as ListaPrecio)}
              disabled={pending}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              {LISTAS_PRECIO.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Condición de pago">
            <select
              value={condicionPago}
              onChange={(e) => setCondicionPago(e.target.value)}
              disabled={pending}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">—</option>
              {CONDICIONES_PAGO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Fecha entrega estimada">
            <Input
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              disabled={pending}
            />
          </FormRow>
          <FormRow label="Observación">
            <Textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              disabled={pending}
              placeholder="Notas internas o instrucciones especiales"
              rows={2}
            />
          </FormRow>
        </FormGrid>
      </FormSection>

      <div className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-soft">
        <p className="text-xs text-slate-500">
          Se creará en estado <span className="font-semibold text-slate-700">BORRADOR</span>. Después
          podrás agregar líneas en el detalle.
        </p>
        <Button onClick={enviar} disabled={pending || !clienteId} variant="premium">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Crear pedido
        </Button>
      </div>
    </div>
  );
}
