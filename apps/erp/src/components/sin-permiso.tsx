import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Lock, ArrowLeft } from 'lucide-react';
import type { Rol } from '@happy/db/enums';

/** Cómo se llama cada rol cuando hay que mostrárselo a una persona. */
const NOMBRE_ROL: Record<string, string> = {
  gerente: 'Gerencia',
  jefe_produccion: 'Jefatura de producción',
  operario: 'Operario',
  almacenero: 'Almacén',
  cajero: 'Caja / tienda',
  vendedor_b2b: 'Ventas mayoristas',
  contador: 'Contabilidad',
  cliente: 'Cliente',
};

/**
 * Lo que se ve al abrir una pantalla que no corresponde al rol.
 *
 * Dice tres cosas a propósito: que la pantalla existe, que el bloqueo es por el
 * rol y no una falla, y a quién pedirle el acceso. Un "no encontrado" o un
 * rebote al dashboard mandan a la persona a llamar a soporte.
 */
export function SinPermiso({ roles }: { roles: Rol[] }) {
  const propios = roles.filter((r) => r !== 'cliente');

  return (
    <div className="flex justify-center py-10">
      <Card className="max-w-lg">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-slate-100 p-2">
              <Lock className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-corp-900">
                Esta sección no es para tu rol
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                La pantalla existe y funciona, pero está reservada para otro puesto. No es una
                falla: es cómo quedaron repartidos los accesos.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">Tus accesos:</span>
                {propios.length === 0
                  ? <Badge variant="secondary">Sin rol asignado</Badge>
                  : propios.map((r) => (
                      <Badge key={r} variant="secondary">{NOMBRE_ROL[r] ?? r}</Badge>
                    ))}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Si necesitás entrar acá para tu trabajo, pedíselo a gerencia: se habilita desde
                Usuarios &amp; Roles en un minuto.
              </p>

              <Link
                href="/dashboard"
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Volver al inicio
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
