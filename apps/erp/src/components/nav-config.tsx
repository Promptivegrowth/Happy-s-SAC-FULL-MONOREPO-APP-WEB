import {
  LayoutDashboard, Package, Layers3, FileText, Shirt, Users, Truck, Factory,
  Warehouse, ShoppingCart, Boxes, Receipt, ClipboardList, Scale,
  AlertTriangle, MessageSquareWarning, BarChart3, Settings, UserCog, Globe,
  Tags, Scissors, Wrench, Coins, Hammer, Store, QrCode,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Rol } from '@happy/db/enums';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Rol[];      // si está vacío, todos los roles staff
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
      { label: 'Categorías', href: '/categorias', icon: Tags },
      { label: 'Materiales', href: '/materiales', icon: Boxes },
      { label: 'Recetas (BOM)', href: '/recetas', icon: FileText },
      { label: 'Publicación Web', href: '/web-catalogo', icon: Globe },
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
      { label: 'Plan Maestro', href: '/plan-maestro', icon: ClipboardList, roles: ['gerente','jefe_produccion'] },
      { label: 'Órdenes de Trabajo', href: '/ot', icon: Factory, roles: ['gerente','jefe_produccion','operario'] },
      { label: 'Corte', href: '/corte', icon: Scissors, roles: ['gerente','jefe_produccion','operario'] },
      { label: 'Órdenes de Servicio', href: '/servicios', icon: Wrench, roles: ['gerente','jefe_produccion'] },
      { label: 'Control de Calidad', href: '/calidad', icon: Scale, roles: ['gerente','jefe_produccion','almacenero'] },
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
      { label: 'Recepciones', href: '/compras', icon: Boxes },
      { label: 'Importaciones', href: '/compras/importaciones', icon: Truck },
      { label: 'Cuentas por pagar', href: '/compras/cxp', icon: Coins },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { label: 'Ventas (todas)', href: '/ventas', icon: Receipt },
      { label: 'POS (simulador)', href: '/pos', icon: Store, roles: ['gerente','cajero'] },
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
      { label: 'Usuarios & Roles', href: '/usuarios', icon: UserCog, roles: ['gerente'] },
      { label: 'Configuración', href: '/configuracion', icon: Settings, roles: ['gerente'] },
    ],
  },
];
