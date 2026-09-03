'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { FileStack, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarResumenDiarioBoletas, consultarResumenDiario } from '@/server/actions/sunat';

/**
 * Genera y envía a SUNAT el Resumen Diario de Boletas de una fecha, y consulta
 * el ticket para obtener el CDR. Las boletas se informan a SUNAT de forma
 * agrupada por día (no una por una).
 */
export function ResumenBoletasButton() {
  const hoyPeru = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState(hoyPeru);
  const [enviando, setEnviando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function enviar() {
    setEnviando(true); setMsg(null); setRowId(null);
    try {
      const r = await generarResumenDiarioBoletas(fecha);
      if (r.ok && r.data) {
        setRowId(r.data.rowId);
        setMsg(`Resumen ${r.data.resumenId} enviado (${r.data.cantidad} boletas). Ticket: ${r.data.ticket}. Consulta el estado en unos segundos.`);
        toast.success('Resumen enviado a SUNAT');
      } else {
        toast.error(r.error ?? 'No se pudo enviar el resumen');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function consultar() {
    if (!rowId) return;
    setConsultando(true);
    try {
      const r = await consultarResumenDiario(rowId);
      if (r.ok && r.data) {
        if (r.data.estado === 'ACEPTADO') { toast.success(`SUNAT: ${r.data.descripcion ?? 'Aceptado'}`); setMsg(`✅ ${r.data.descripcion ?? 'Resumen aceptado'}`); }
        else if (r.data.estado === 'EN_PROCESO') { toast.info('SUNAT aún está procesando. Reintenta en unos segundos.'); setMsg('SUNAT aún está procesando (ticket en cola). Reintenta en unos segundos.'); }
        else { toast.warning(`Estado: ${r.data.estado} · ${r.data.descripcion ?? r.data.codigo}`); setMsg(`⚠️ ${r.data.estado}: ${r.data.descripcion ?? r.data.codigo}`); }
      } else {
        toast.error(r.error ?? 'No se pudo consultar');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConsultando(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileStack className="h-4 w-4" /> Resumen de boletas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resumen Diario de Boletas (SUNAT)</DialogTitle>
            <DialogDescription>
              Informa a SUNAT las boletas de un día de forma agrupada. Es el mecanismo oficial para las boletas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Fecha de las boletas</Label>
              <Input type="date" value={fecha} max={hoyPeru} onChange={(e) => setFecha(e.target.value)} className="mt-1" />
            </div>
            <div className="flex gap-2">
              <Button onClick={enviar} disabled={enviando} className="flex-1">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileStack className="h-4 w-4" />}
                Enviar resumen
              </Button>
              <Button variant="outline" onClick={consultar} disabled={!rowId || consultando}>
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Consultar estado
              </Button>
            </div>
            {msg && <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">{msg}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
