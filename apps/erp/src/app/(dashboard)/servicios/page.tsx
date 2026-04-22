import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Órdenes de Servicio' };
export default function Page() {
  return (
    <PageShell title="Órdenes de Servicio (Talleres)" description="Envío al taller con avíos, recálculo de pagos y campos de observación.">
      <ComingSoon
        title="Órdenes de Servicio a Talleres Externos"
        description="Cuando el corte se envía al taller, se genera una OS con los avíos calculados desde el BOM, el pago acordado, ajuste de campaña y movilidad."
        features={[
          'Generar OS desde una orden de corte (una o varias OSs por taller)',
          'Avíos enviados auto-calculados desde la receta (con la columna SI_SALE_A_SERVICIO)',
          'Pago = tarifa unitaria × cantidad + adicional movilidad + adicional campaña',
          'Campo de observaciones, cuidados, consideraciones especiales',
          'Firma digital de "recibido conforme" del taller (subir imagen)',
          'Recepción: cantidad fallada, devolución de avíos sobrantes',
          'Vinculación con kardex (SALIDA_TALLER_SERVICIO / ENTRADA_DEVOLUCION_TALLER)',
        ]}
      />
    </PageShell>
  );
}
