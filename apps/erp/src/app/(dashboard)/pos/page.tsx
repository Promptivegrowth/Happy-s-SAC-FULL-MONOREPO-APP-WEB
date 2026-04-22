import { PageShell } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Store, ExternalLink } from 'lucide-react';

export const metadata = { title: 'POS' };
export default function Page() {
  return (
    <PageShell title="Punto de Venta" description="El POS corre en su propia app (apps/pos) optimizada para tablets con pistola de código de barras.">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-happy-500" /> POS HAPPY</CardTitle>
          <CardDescription>La app POS es una PWA independiente con soporte offline, pistola USB/Bluetooth, impresora térmica y cajón de dinero.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">Características principales:</p>
          <ul className="space-y-1 text-sm">
            {[
              'Apertura y cierre de caja con cuadre por método de pago',
              'Venta rápida con pistola de código de barras',
              'Pagos múltiples: efectivo + Yape + tarjeta en una sola venta',
              'Emisión de boleta/factura electrónica en el acto',
              'Devoluciones con nota de crédito automática',
              'Funciona offline y sincroniza cuando hay conexión',
            ].map((f) => <li key={f} className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-happy-500" />{f}</li>)}
          </ul>
          <div className="flex gap-2 pt-2">
            <Button asChild variant="premium">
              <a href={process.env.NEXT_PUBLIC_POS_URL ?? 'http://localhost:3002'} target="_blank" rel="noopener noreferrer">
                Abrir POS <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
