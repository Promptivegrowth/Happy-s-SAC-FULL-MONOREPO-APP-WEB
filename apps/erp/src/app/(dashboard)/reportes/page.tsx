import Link from 'next/link';
import {
  TrendingUp,
  Sparkles,
  PiggyBank,
  UserCog,
  ClipboardList,
  Wallet,
  Banknote,
  Boxes,
  History,
  Factory,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { Badge } from '@happy/ui/badge';

export const metadata = { title: 'Reportes' };

type Categoria = 'Ventas' | 'Producción' | 'Inventario' | 'Finanzas';

type ReporteCard = {
  href: string;
  titulo: string;
  descripcion: string;
  icono: LucideIcon;
  categoria: Categoria;
  badge?: 'Nuevo' | 'Pro';
};

const REPORTES: ReporteCard[] = [
  {
    href: '/reportes/ventas',
    titulo: 'Ventas',
    descripcion: 'Por período, canal, tienda y vendedor. Comparativa vs período anterior.',
    icono: TrendingUp,
    categoria: 'Ventas',
    badge: 'Nuevo',
  },
  {
    href: '/reportes/ventas-por-vendedor',
    titulo: 'Ventas por vendedor',
    descripcion: 'Ranking de vendedores con cantidad, total y ticket promedio. Útil para comisiones.',
    icono: TrendingUp,
    categoria: 'Ventas',
    badge: 'Nuevo',
  },
  {
    href: '/reportes/productos-temporada',
    titulo: 'Productos por temporada',
    descripcion: 'Top vendidos en Halloween, Navidad, Fiestas Patrias y categorías custom.',
    icono: Sparkles,
    categoria: 'Ventas',
    badge: 'Nuevo',
  },
  {
    href: '/reportes/rentabilidad',
    titulo: 'Rentabilidad por modelo',
    descripcion: 'Precio − costo (materiales + MO). Margen unitario y porcentaje.',
    icono: PiggyBank,
    categoria: 'Finanzas',
    badge: 'Pro',
  },
  {
    href: '/reportes/productividad',
    titulo: 'Productividad operarios & talleres',
    descripcion: 'Minutos producidos, eficiencia real vs estándar, % fallas, pagos a talleres.',
    icono: UserCog,
    categoria: 'Producción',
    badge: 'Pro',
  },
  {
    href: '/reportes/ots',
    titulo: 'Órdenes de Trabajo',
    descripcion: 'Abiertas, cerradas y atrasadas. Días en proceso vs fecha objetivo.',
    icono: ClipboardList,
    categoria: 'Producción',
  },
  {
    href: '/reportes/produccion-periodo',
    titulo: 'Producción por período',
    descripcion: 'Cierre mensual: OTs cerradas, unidades terminadas, costos reales y horas invertidas.',
    icono: Factory,
    categoria: 'Producción',
    badge: 'Nuevo',
  },
  {
    href: '/reportes/costeo-comparativo',
    titulo: 'Cotización vs Costo Real',
    descripcion: 'Comparativo por OT: costo teórico (receta + tarifas) vs real (kardex + talleres). Detecta desviaciones.',
    icono: Scale,
    categoria: 'Producción',
    badge: 'Nuevo',
  },
  {
    href: '/reportes/caja',
    titulo: 'Flujo de caja',
    descripcion: 'Ingresos POS/WEB/B2B vs egresos talleres + proveedores. Saldo por día.',
    icono: Banknote,
    categoria: 'Finanzas',
    badge: 'Nuevo',
  },
  {
    href: '/reportes/pagos-talleres',
    titulo: 'Pagos a talleres',
    descripcion: 'Detalle de pagos por taller, medio y período.',
    icono: Wallet,
    categoria: 'Finanzas',
  },
  {
    href: '/reportes/inventario/stock-valorizado',
    titulo: 'Stock valorizado',
    descripcion: 'Snapshot del stock con valuación monetaria por almacén y tipo (variantes + materiales).',
    icono: Boxes,
    categoria: 'Inventario',
    badge: 'Nuevo',
  },
  {
    href: '/reportes/inventario/movimientos',
    titulo: 'Movimientos de inventario',
    descripcion: 'Resumen agregado del kardex por tipo de movimiento. Entradas vs salidas, valor neto.',
    icono: History,
    categoria: 'Inventario',
    badge: 'Nuevo',
  },
];

const CATEGORIAS: { nombre: Categoria; color: string }[] = [
  { nombre: 'Ventas', color: 'bg-happy-100 text-happy-700' },
  { nombre: 'Producción', color: 'bg-indigo-100 text-indigo-700' },
  { nombre: 'Inventario', color: 'bg-amber-100 text-amber-700' },
  { nombre: 'Finanzas', color: 'bg-emerald-100 text-emerald-700' },
];

export default function Page() {
  return (
    <PageShell
      title="Hub de Reportes"
      description="Reportes ejecutivos con export Excel · PDF · CSV brandeados HAPPY SAC."
    >
      {CATEGORIAS.map((cat) => {
        const items = REPORTES.filter((r) => r.categoria === cat.nombre);
        if (items.length === 0) return null;
        return (
          <section key={cat.nombre} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cat.color}`}>
                {cat.nombre}
              </span>
              <span className="text-xs text-slate-400">{items.length} reporte{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => {
                const Icon = r.icono;
                return (
                  <Link
                    key={r.href}
                    href={r.href}
                    className="group relative flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-happy-300 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-happy-100 text-happy-600 transition group-hover:bg-happy-500 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-sm font-semibold text-corp-900 group-hover:text-happy-600">
                          {r.titulo}
                        </h3>
                        {r.badge && (
                          <Badge
                            variant={r.badge === 'Pro' ? 'default' : 'secondary'}
                            className="h-4 px-1.5 text-[9px]"
                          >
                            {r.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{r.descripcion}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </PageShell>
  );
}
