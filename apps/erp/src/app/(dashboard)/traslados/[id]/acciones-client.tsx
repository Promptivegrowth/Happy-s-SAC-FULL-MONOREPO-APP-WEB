'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Ban, Loader2, PackageCheck, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  despacharTraslado,
  recibirTraslado,
  anularTraslado,
  type EstadoTraslado,
} from '@/server/actions/traslados';

type LineaMin = {
  id: string;
  nombre: string;
  detalle: string | null;
  cantidad: number;
};

export function AccionesTraslado({
  id,
  codigo,
  estado,
  lineas,
}: {
  id: string;
  codigo: string;
  estado: EstadoTraslado;
  lineas: LineaMin[];
}) {
  if (estado === 'BORRADOR') {
    return (
      <>
        <DespacharButton id={id} codigo={codigo} />
        <AnularButton id={id} codigo={codigo} />
      </>
    );
  }
  if (estado === 'DESPACHADO') {
    return <RecibirButton id={id} codigo={codigo} lineas={lineas} />;
  }
  return null;
}

function DespacharButton({ id, codigo }: { id: string; codigo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function onClick() {
    if (
      !confirm(
        `Despachar el traslado ${codigo}. Se generarán SALIDA_TRASLADO en el almacén origen y el stock se moverá. ¿Continuar?`,
      )
    ) {
      return;
    }
    start(async () => {
      const r = await despacharTraslado(id);
      if (r.ok) {
        toast.success(`Traslado ${codigo} despachado`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo despachar');
      }
    });
  }
  return (
    <Button variant="premium" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      Despachar
    </Button>
  );
}

function AnularButton({ id, codigo }: { id: string; codigo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function onClick() {
    if (!confirm(`Anular el traslado ${codigo}. Solo se permite desde BORRADOR.`)) return;
    start(async () => {
      const r = await anularTraslado(id);
      if (r.ok) {
        toast.success(`Traslado ${codigo} anulado`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo anular');
      }
    });
  }
  return (
    <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
      Anular
    </Button>
  );
}

function RecibirButton({
  id,
  codigo,
  lineas,
}: {
  id: string;
  codigo: string;
  lineas: LineaMin[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [recibidas, setRecibidas] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const l of lineas) m[l.id] = String(l.cantidad);
    return m;
  });

  function actualizar(lineaId: string, valor: string) {
    setRecibidas((prev) => ({ ...prev, [lineaId]: valor }));
  }

  function recibirTodo() {
    const m: Record<string, string> = {};
    for (const l of lineas) m[l.id] = String(l.cantidad);
    setRecibidas(m);
  }

  function enviar() {
    // Validación local
    for (const l of lineas) {
      const v = Number(recibidas[l.id] ?? 0);
      if (Number.isNaN(v) || v < 0) {
        return toast.error(`Cantidad inválida en "${l.nombre}"`);
      }
      if (v > l.cantidad + 0.0001) {
        return toast.error(
          `Cantidad recibida (${v}) excede lo despachado (${l.cantidad}) en "${l.nombre}"`,
        );
      }
    }
    const payload = {
      lineas_recibidas: lineas.map((l) => ({
        linea_id: l.id,
        cantidad_recibida: Number(recibidas[l.id] ?? 0),
      })),
    };
    start(async () => {
      const r = await recibirTraslado(id, payload);
      if (r.ok) {
        toast.success(`Traslado ${codigo} recibido`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo recibir');
      }
    });
  }

  return (
    <>
      <Button variant="premium" size="sm" onClick={() => setOpen(true)}>
        <PackageCheck className="h-4 w-4" />
        Recibir
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Recibir traslado {codigo}</DialogTitle>
            <DialogDescription>
              Confirma o ajusta lo que llegó al almacén destino. Si una cantidad es menor a lo
              despachado, la diferencia queda como faltante (registra una merma manual si
              corresponde).
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead className="text-right">Despachado</TableHead>
                  <TableHead className="w-32 text-right">Recibido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="text-sm font-medium text-corp-900">{l.nombre}</div>
                      {l.detalle && (
                        <div className="text-[10px] text-slate-500">{l.detalle}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {l.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        max={l.cantidad}
                        value={recibidas[l.id] ?? ''}
                        onChange={(e) => actualizar(l.id, e.target.value)}
                        disabled={pending}
                        className="h-8 text-right"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={recibirTodo} disabled={pending}>
              Recibir todo
            </Button>
            <Button type="button" variant="premium" onClick={enviar} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4" />
              )}
              Confirmar recepción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
