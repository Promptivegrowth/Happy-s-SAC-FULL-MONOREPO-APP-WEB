'use client';

/*
 * Representación impresa en A4 de un comprobante (boleta, factura, nota de
 * crédito o de venta), con el mismo diseño que el A4 de la caja: logo, recuadro
 * con RUC y número, cliente, detalle, totales y QR de SUNAT.
 *
 * Sirve para los comprobantes que nacen en el ERP y no pasan por la caja, como
 * los de los pedidos web: el cliente de la tienda online recibe este PDF.
 */

import { useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { datosComprobanteA4, type DatosComprobanteA4 } from '@/server/actions/comprobante-a4';

const NARANJA: [number, number, number] = [255, 77, 13];
const AZUL: [number, number, number] = [30, 58, 95];
const OSCURO: [number, number, number] = [15, 23, 42];
const SUAVE: [number, number, number] = [100, 116, 139];
const FONDO: [number, number, number] = [248, 250, 252];

const TITULO: Record<string, string> = {
  BOLETA: 'BOLETA DE VENTA ELECTRÓNICA', FACTURA: 'FACTURA ELECTRÓNICA',
  NOTA_CREDITO: 'NOTA DE CRÉDITO ELECTRÓNICA', NOTA_DEBITO: 'NOTA DE DÉBITO ELECTRÓNICA', NOTA_VENTA: 'NOTA DE VENTA',
};
const fmt = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function armarPdf(d: DatosComprobanteA4): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTable = (autoTableMod.default ?? autoTableMod) as unknown as (doc: any, o: any) => void;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const e = d.empresa;

  // Cabecera: empresa a la izquierda, recuadro con RUC y número a la derecha.
  const boxW = 210; const boxH = 100; const boxX = W - M - boxW;
  let yL = M;
  if (e?.logo_dataurl && e.logo_formato) {
    try { doc.addImage(e.logo_dataurl, e.logo_formato, M, yL, 100, 60); yL += 68; } catch { /* sin logo */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NARANJA);
  doc.text(e?.nombre_comercial || e?.razon_social || "HAPPY'S S.A.C.", M, yL); yL += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...OSCURO);
  if (e?.nombre_comercial) { doc.text(e.razon_social, M, yL); yL += 11; }
  doc.setTextColor(...SUAVE);
  if (e?.direccion_fiscal) { const l = doc.splitTextToSize(e.direccion_fiscal, boxX - M - 10) as string[]; doc.text(l, M, yL); yL += l.length * 11; }
  if (e?.telefono) { doc.text(`Tel. ${e.telefono}`, M, yL); yL += 11; }
  if (e?.email) { doc.text(e.email, M, yL); yL += 11; }

  doc.setDrawColor(...AZUL); doc.setLineWidth(1.5); doc.roundedRect(boxX, M, boxW, boxH, 4, 4); doc.setLineWidth(0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...AZUL);
  doc.text(`RUC ${e?.ruc ?? ''}`, boxX + boxW / 2, M + 22, { align: 'center' });
  doc.setFontSize(11); doc.text(doc.splitTextToSize(TITULO[d.tipo] ?? d.tipo, boxW - 16) as string[], boxX + boxW / 2, M + 46, { align: 'center' });
  doc.setFontSize(15); doc.setTextColor(...NARANJA); doc.text(d.numero, boxX + boxW / 2, M + 84, { align: 'center' });

  // Cliente
  let y = Math.max(yL, M + boxH) + 20;
  const altoCli = d.cliente.direccion || d.referencia ? 70 : 50;
  doc.setFillColor(...FONDO); doc.rect(M, y, W - 2 * M, altoCli, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...SUAVE);
  doc.text('CLIENTE', M + 10, y + 14); doc.text('DOCUMENTO', W / 2, y + 14); doc.text('FECHA DE EMISIÓN', W / 2 + 130, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...OSCURO);
  doc.text(doc.splitTextToSize(d.cliente.nombre, W / 2 - M - 20) as string[], M + 10, y + 30);
  doc.text(d.cliente.tipoDoc && d.cliente.numDoc ? `${d.cliente.tipoDoc} ${d.cliente.numDoc}` : '—', W / 2, y + 30);
  doc.text(new Date(d.fecha).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }), W / 2 + 130, y + 30);
  doc.setFontSize(8); doc.setTextColor(...SUAVE);
  let yc = y + 48;
  if (d.cliente.direccion) { doc.text(doc.splitTextToSize(`Dirección: ${d.cliente.direccion}`, W - 2 * M - 20) as string[], M + 10, yc); yc += 11; }
  if (d.referencia) doc.text(`Documento que modifica: ${d.referencia}${d.motivo ? ` · ${d.motivo}` : ''}`, M + 10, yc);
  y += altoCli + 18;

  // Detalle
  const conDescuento = d.lineas.some((l) => l.descuento > 0);
  autoTable(doc, {
    startY: y,
    head: [['#', 'Descripción', 'Cant.', 'P. Unit.', ...(conDescuento ? ['Desc.'] : []), 'Importe']],
    body: d.lineas.map((l, i) => [String(i + 1), l.descripcion, String(l.cantidad), `S/ ${fmt(l.precio)}`, ...(conDescuento ? [l.descuento ? `S/ ${fmt(l.descuento)}` : ''] : []), `S/ ${fmt(l.total)}`]),
    theme: 'grid',
    headStyles: { fillColor: AZUL, textColor: 255, fontSize: 9, fontStyle: 'bold', cellPadding: 6 },
    bodyStyles: { fontSize: 9, textColor: OSCURO, cellPadding: 5 },
    alternateRowStyles: { fillColor: FONDO },
    columnStyles: { 0: { halign: 'center', cellWidth: 25 }, 2: { halign: 'center', cellWidth: 45 }, 3: { halign: 'right', cellWidth: 70 }, 4: { halign: 'right', cellWidth: 70 }, 5: { halign: 'right', cellWidth: 75 } },
    margin: { left: M, right: M },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y + 100) + 18;

  // Totales
  const tX = W - M - 220; const tW = 220;
  doc.setFontSize(9); doc.setTextColor(...OSCURO); doc.setFont('helvetica', 'normal');
  if (d.tipo !== 'NOTA_VENTA') {
    doc.text('Op. gravada', tX + 10, y); doc.text(`S/ ${fmt(d.totales.base)}`, tX + tW - 10, y, { align: 'right' }); y += 14;
    doc.text('IGV (18%)', tX + 10, y); doc.text(`S/ ${fmt(d.totales.igv)}`, tX + tW - 10, y, { align: 'right' }); y += 18;
  }
  doc.setFillColor(...NARANJA); doc.rect(tX, y - 4, tW, 28, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
  doc.text('TOTAL', tX + 10, y + 14); doc.text(`S/ ${fmt(d.totales.total)}`, tX + tW - 10, y + 14, { align: 'right' });
  y += 44;

  // Pago y QR
  if (d.pagos.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...AZUL); doc.text('Forma de pago', M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...OSCURO);
    d.pagos.forEach((p, i) => doc.text(`• ${p}`, M, y + 14 + i * 12));
  }
  if (d.qrDataUrl) {
    doc.addImage(d.qrDataUrl, 'PNG', W - M - 90, y - 4, 90, 90);
    doc.setFontSize(7); doc.setTextColor(...SUAVE); doc.text('Verifica en SUNAT', W - M - 45, y + 94, { align: 'center' });
  }

  // Pie
  doc.setDrawColor(...SUAVE); doc.line(M, H - 60, W - M, H - 60);
  doc.setFontSize(7); doc.setTextColor(...SUAVE);
  doc.text(d.tipo === 'NOTA_VENTA'
    ? 'Documento interno — sin validez tributaria.'
    : `Representación impresa de la ${(TITULO[d.tipo] ?? '').toLowerCase()}. Consúltela en www.sunat.gob.pe`, M, H - 45);
  return doc.output('blob');
}

/** Botón "PDF" para descargar la representación impresa de un comprobante. */
export function DescargarComprobanteA4({ comprobanteId, label = 'PDF', variant = 'outline' }: {
  comprobanteId: string; label?: string; variant?: 'outline' | 'premium' | 'ghost';
}) {
  const [pending, start] = useTransition();
  return (
    <Button variant={variant} disabled={pending} onClick={() => start(async () => {
      const r = await datosComprobanteA4(comprobanteId);
      if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo armar el PDF'); return; }
      const blob = await armarPdf(r.data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${r.data.empresa?.ruc ?? 'comprobante'}-${r.data.numero}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    })}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {label}
    </Button>
  );
}
