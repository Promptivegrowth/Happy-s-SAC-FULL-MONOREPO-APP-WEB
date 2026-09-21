import {
  LayoutDashboard, Package, Layers3, FileText, Shirt, Users, Truck, Factory,
  Warehouse, ShoppingCart, Boxes, Receipt, ClipboardList, Scale,
  AlertTriangle, MessageSquareWarning, BarChart3, Settings, UserCog, Globe,
  Tags, Scissors, Wrench, Coins, Hammer, Store, QrCode, Plane, Barcode, Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /*
   * Quién ve cada entrada NO se declara acá.
   *
   * Antes sí, y era el problema: de cuarenta y cinco entradas sólo nueve lo
   * declaraban, así que las otras treinta y seis se le mostraban a cualquiera.
   * Y aunque una estuviera escondida, la dirección escrita a mano entraba
   * igual. Ahora el menú y el control de acceso salen los dos de `permisos.ts`,
   * que va por ruta: agregar una entrada acá no puede abrirle la puerta a nadie.
   */
  badge?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: 'General',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { label: 'Productos / Disfraces', href: '/productos', icon: Shirt },
      { label: 'Etiquetas de barras', href: '/productos/etiquetas', icon: Barcode },
      { label: 'Categorías', href: '/categorias', icon: Tags },
      { label: 'Materiales', href: '/materiales', icon: Boxes },
      { label: 'Recetas (BOM)', href: '/recetas', icon: FileText },
      { label: 'Publicación Web', href: '/web-catalogo', icon: Globe },
      { label: 'Campañas', href: '/campanias', icon: Sparkles },
    ],
  },
  {
    label: 'Personas',
    items: [
      { label: 'Clientes', href: '/clientes', icon: Users },
      { label: 'Proveedores', href: '/proveedores', icon: Truck },
      { label: 'Talleres', href: '/talleres', icon: Hammer },
      { label: 'Operarios', href: '/operarios', icon: UserCog },
    ],
  },
  {
    label: 'Producción',
    items: [
      { label: 'Plan Maestro', href: '/plan-maestro', icon: ClipboardList },
      { label: 'Órdenes de Trabajo', href: '/ot', icon: Factory },
      { label: 'Corte', href: '/corte', icon: Scissors },
      { label: 'Órdenes de Servicio', href: '/servicios', icon: Wrench },
      { label: 'Control de Calidad', href: '/calidad', icon: Scale },
      { label: 'Trazabilidad', href: '/trazabilidad', icon: QrCode },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { label: 'Kardex', href: '/kardex', icon: Warehouse },
      { label: 'Stock actual', href: '/inventario', icon: Package },
      { label: 'Traslados', href: '/traslados', icon: Layers3 },
      { label: 'Alertas stock bajo', href: '/inventario/alertas', icon: AlertTriangle },
    ],
  },
  {
    label: 'Compras',
    items: [
      { label: 'Órdenes de Compra', href: '/oc', icon: ShoppingCart },
      { label: 'Recepciones', href: '/recepciones', icon: Boxes },
      { label: 'Importaciones', href: '/compras/importaciones', icon: Truck },
      { label: 'Cuentas por pagar', href: '/compras/cxp', icon: Coins },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { label: 'Ventas (todas)', href: '/ventas', icon: Receipt },
      { label: 'POS (simulador)', href: '/pos', icon: Store },
      { label: 'Ventas de exportación', href: '/ventas/exportacion', icon: Plane },
      { label: 'Pedidos Web', href: '/pedidos-web', icon: Globe },
      { label: 'Pedidos B2B', href: '/b2b', icon: Users },
      { label: 'Comprobantes SUNAT', href: '/comprobantes', icon: FileText },
    ],
  },
  {
    label: 'Administración',
    items: [
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
      { label: 'Reclamos INDECOPI', href: '/reclamos', icon: MessageSquareWarning },
      { label: 'Usuarios & Roles', href: '/usuarios', icon: UserCog },
      { label: 'Configuración', href: '/configuracion', icon: Settings },
    ],
  },
];
