'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@happy/ui/dialog';
import { Label } from '@happy/ui/label';
import {
  ClipboardCheck, Download, Upload, Loader2, FileSpreadsheet, FileText,
  AlertTriangle, CheckCircle2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportarPlantillaConteo } from '@/server/actions/stock-conteo-excel';
import { importarConteoExcel, type ResultadoConteo } from '@/server/actions/stock-conteo-import';
import { cargarEmpresaPDF } from '@/server/empresa-pdf-helper';
import { generarConteoPdf } from './conteo-pdf';

type Almacen = { id: string; nombre: string; codigo: string; tipo?: string };

/**
 * CONTEO FÍSICO POR EXCEL (solo gerencia).
 *  Paso 1 — Exporta la plantilla con todos los productos/materiales y su stock.
 *  Paso 2 — La reimporta con la columna "STOCK CONTADO" llena.
 * Si hay errores se cancela TODO y se listan; si va bien, se descarga el PDF
 * de resumen con lo actualizado en cada almacén.
 */
export function ConteoExcelButton({ almacenes }: { almacenes: Almacen[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [almacenId, setAlmacenId] = useState('');
  const [soloConStock, setSoloConStock] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoConteo | null>(null);

  function reset() {
    setArchivo(null); setResultado(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function descargarPlantilla() {
    setExportando(true);
    try {
      const r = await exportarPlantillaConteo({
        almacen_id: almacenId || undefined,
        solo_con_stock: soloConStock,
      });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      const a = document.createElement('a');
      a.href = url; a.download = r.filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Plantilla descargada · ${r.filas.toLocaleString('es-PE')} ítems`);
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  }

  async function importar() {
    if (!archivo) return toast.error('Selecciona el archivo Excel que llenaste');
    setImportando(true); setResultado(null);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res((fr.result as string).split(',')[1] ?? '');
        fr.onerror = () => rej(new Error('No se pudo leer el archivo'));
        fr.readAsDataURL(archivo);
      });

      const r = await importarConteoExcel(base64);
      if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo procesar el archivo'); return; }
      const data = r.data;
      setResultado(data);

      // PDF (resumen o reporte de errores) — se descarga solo.
      try {
        const empresa = await cargarEmpresaPDF();
        await generarConteoPdf(data, empresa);
      } catch { /* el PDF es complementario; el resultado ya se muestra en pantalla */ }

      if (data.aplicado) {
        toast.success(`Conteo aplicado · ${data.totalActualizados} ítem(s) actualizados`);
        router.refresh();
      } else {
        toast.error(`No se aplicó nada: ${data.errores.length} error(es) por corregir`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)} title="Exportar productos a Excel, contar y reimportar para fijar el stock">
        <ClipboardCheck className="h-4 w-4" /> Conteo por Excel
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conteo físico de inventario por Excel</DialogTitle>
            <DialogDescription>
              Exporta todos los productos y materiales con su stock, cuenta en físico y vuelve a importar
              el archivo para <strong>fijar el stock real</strong>. Solo gerencia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cómo funciona */}
            <div className="rounded-lg border border-happy-200 bg-happy-50/60 p-3 text-xs text-corp-800">
              <p className="mb-1.5 font-semibold text-corp-900">Cómo funciona</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-white px-2 py-1 ring-1 ring-happy-200">1. Descargas el Excel</span>
                <ArrowRight className="h-3 w-3 text-happy-600" />
                <span className="rounded-full bg-white px-2 py-1 ring-1 ring-happy-200">2. Llenas &quot;STOCK CONTADO&quot;</span>
                <ArrowRight className="h-3 w-3 text-happy-600" />
                <span className="rounded-full bg-white px-2 py-1 ring-1 ring-happy-200">3. Lo vuelves a subir</span>
                <ArrowRight className="h-3 w-3 text-happy-600" />
                <span className="rounded-full bg-white px-2 py-1 ring-1 ring-happy-200">4. Se ajusta el stock + PDF</span>
              </div>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
                <li>El archivo trae <strong>una hoja por almacén</strong> (incluye el almacén de materiales).</li>
                <li>Solo puedes escribir en la columna <strong>STOCK CONTADO</strong>; el resto está bloqueado.</li>
                <li>Si dejas una fila <strong>en blanco no se toca</strong>. Si escribes <strong>0</strong>, el stock queda en cero.</li>
                <li>Si el archivo tiene errores, <strong>no se actualiza nada</strong> y te decimos qué corregir.</li>
              </ul>
            </div>

            {/* PASO 1 */}
            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-corp-900">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-happy-600 text-[11px] font-bold text-white">1</span>
                Exportar la plantilla
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Almacén</Label>
                  <select
                    value={almacenId}
                    onChange={(e) => setAlmacenId(e.target.value)}
                    disabled={exportando}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Todos los almacenes</option>
                    {almacenes.map((a) => (
                      <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} className="h-4 w-4" />
                    Solo ítems con stock (archivo más corto)
                  </label>
                </div>
              </div>
              <Button onClick={descargarPlantilla} disabled={exportando} className="mt-3 gap-2">
                {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Descargar plantilla Excel
              </Button>
            </div>

            {/* PASO 2 */}
            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-corp-900">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-happy-600 text-[11px] font-bold text-white">2</span>
                Importar el archivo contado
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setResultado(null); }}
                disabled={importando}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-happy-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-happy-700"
              />
              <Button onClick={importar} disabled={importando || !archivo} variant="premium" className="mt-3 gap-2">
                {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Validar e importar
              </Button>
              <p className="mt-1.5 text-[10px] text-slate-500">
                Primero se valida todo el archivo. Solo si está correcto se actualiza el stock.
              </p>
            </div>

            {/* RESULTADO */}
            {resultado && !resultado.aplicado && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                  <AlertTriangle className="h-4 w-4" />
                  No se actualizó nada · {resultado.errores.length} error(es) por corregir
                </p>
                <p className="mt-0.5 text-[11px] text-rose-700">
                  Corrige estos puntos en el Excel y vuelve a importarlo. Se descargó un PDF con el detalle.
                </p>
                <div className="mt-2 max-h-56 overflow-y-auto rounded border border-rose-200 bg-white">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-rose-100 text-rose-900">
                      <tr>
                        <th className="px-2 py-1 text-left">Hoja</th>
                        <th className="px-2 py-1 text-left">Fila</th>
                        <th className="px-2 py-1 text-left">Ítem</th>
                        <th className="px-2 py-1 text-left">Qué corregir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.errores.map((e, i) => (
                        <tr key={i} className="border-t border-rose-100">
                          <td className="px-2 py-1">{e.hoja}</td>
                          <td className="px-2 py-1 font-mono">{e.fila}</td>
                          <td className="px-2 py-1">{e.item}</td>
                          <td className="px-2 py-1 text-rose-700">{e.mensaje}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {resultado?.aplicado && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Conteo aplicado · {resultado.totalActualizados} ítem(s) actualizados
                  {resultado.totalSinCambio > 0 && <span className="font-normal text-emerald-700">· {resultado.totalSinCambio} sin cambio</span>}
                </p>
                {resultado.advertencias.map((a, i) => (
                  <p key={i} className="mt-1 text-[11px] text-amber-700">⚠ {a}</p>
                ))}
                <div className="mt-2 space-y-1.5">
                  {resultado.resumen.map((alm) => (
                    <div key={alm.codigo} className="rounded border border-emerald-200 bg-white px-2 py-1.5 text-[11px]">
                      <span className="font-semibold text-corp-900">{alm.codigo} · {alm.almacen}</span>
                      <span className="ml-2 text-slate-600">
                        {alm.items.length} actualizados · <span className="text-emerald-700">{alm.entradas} entradas</span> ·{' '}
                        <span className="text-rose-700">{alm.salidas} salidas</span> · {alm.sinCambio} sin cambio
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline" size="sm" className="mt-2 gap-2"
                  onClick={async () => {
                    try { await generarConteoPdf(resultado, await cargarEmpresaPDF()); }
                    catch (e) { toast.error((e as Error).message); }
                  }}
                >
                  <FileText className="h-3.5 w-3.5" /> Volver a descargar el PDF
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
