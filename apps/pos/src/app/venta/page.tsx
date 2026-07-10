import { redirect } from 'next/navigation';
import { PosTerminal } from './pos-terminal';
import { createClient } from '@happy/db/server';
import { obtenerSesionActiva } from '@/server/actions/caja';

export const metadata = { title: 'Venta — POS' };
export const dynamic = 'force-dynamic';

type VarianteRow = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  talla: string;
  precio_publico: number | null;
  precio_mayorista_a: number | null;
  precio_industrial: number | null;
  productos: {
    id: string;
    nombre: string;
    codigo: string;
    imagen_principal_url: string | null;
    categoria_id: string | null;
    categorias: { id: string; nombre: string; activo: boolean } | null;
  } | null;
};

export default async function VentaPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  // Cargar perfil + caja default (para overlay de apertura cuando no hay sesión)
  const { data: perfil } = await sb
    .from('perfiles')
    .select('caja_default, nombre_completo')
    .eq('id', user.id)
    .single();

  let cajaDefault: {
    id: string;
    nombre: string;
    codigo: string;
    almacen_id: string;
    monto_apertura_default: number;
  } | null = null;
  if (perfil?.caja_default) {
    const { data: c } = await sb
      .from('cajas')
      .select('id, nombre, codigo, almacen_id, monto_apertura_default')
      .eq('id', perfil.caja_default)
      .single();
    if (c) {
      cajaDefault = {
        id: c.id,
        nombre: c.nombre,
        codigo: c.codigo,
        almacen_id: c.almacen_id,
        monto_apertura_default: Number(c.monto_apertura_default ?? 100),
      };
    }
  }

  // Sesión activa (si existe)
  const sesionData = await obtenerSesionActiva();

  // Datos de la empresa para mensajes (WhatsApp, etc.) + config escalones precio
  // Cast porque las columnas escalon_* son de migración 51 (aún no en types autogen).
  const { data: empresaRaw } = await (sb as unknown as {
    from: (t: string) => {
      select: (s: string) => { single: () => Promise<{ data: Record<string, unknown> | null }> };
    };
  })
    .from('empresa')
    .select('razon_social, nombre_comercial, escalon_mayorista_desde, escalon_industrial_desde, escalones_activos')
    .single();
  const empresa = empresaRaw as {
    razon_social: string | null;
    nombre_comercial: string | null;
    escalon_mayorista_desde: number | null;
    escalon_industrial_desde: number | null;
    escalones_activos: boolean | null;
  } | null;
  const empresaNombre = empresa?.nombre_comercial || empresa?.razon_social || 'HAPPY SAC';
  const configEscalones = {
    mayorista_desde: Number(empresa?.escalon_mayorista_desde ?? 3),
    industrial_desde: Number(empresa?.escalon_industrial_desde ?? 100),
    activos: empresa?.escalones_activos ?? true,
  };

  // Determinar el almacén ACTIVO (de la sesión POS o de la caja default).
  // El stock que se muestra en el catálogo es el de ESE almacén — no la suma
  // de todos. Esto evita que el cajero vea "20 unidades" globales y luego
  // el cobro le diga "sin stock" porque en su tienda específica hay 0.
  const almacenActivoId = sesionData?.sesion.almacen_id ?? cajaDefault?.almacen_id ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  // Catálogo (siempre se carga; el overlay de apertura sólo bloquea visualmente)
  const [{ data: variantesRaw }, { data: cajas }, { data: categoriasRaw }, stocksRes, { data: cuentasRaw }] =
    await Promise.all([
      sb
        .from('productos_variantes')
        .select(
          'id, sku, codigo_barras, talla, precio_publico, precio_mayorista_a, precio_industrial, productos!inner(id, nombre, codigo, imagen_principal_url, categoria_id, activo, categorias!productos_categoria_id_fkey(id, nombre, activo))',
        )
        .eq('activo', true)
        .eq('productos.activo', true)
        .limit(2000),
      sb.from('cajas').select('id, codigo, nombre, almacen_id').eq('activo', true),
      sb.from('categorias').select('id, nombre, activo').eq('activo', true).order('orden_web'),
      // Stock del almacén activo (si hay caja); si no, total global como fallback.
      almacenActivoId
        ? sb.from('stock_actual')
            .select('variante_id, cantidad')
            .eq('almacen_id', almacenActivoId)
            .not('variante_id', 'is', null)
        : sb.from('v_stock_variante_total').select('variante_id, stock_total'),
      // Cuentas bancarias marcadas visible_pos (mig 62). Cliente pasó su
      // lista: BCP HAPPYS, BCP JAVIER, INTERBANK HAPPYS, INTERBANK JAVIER,
      // BBVA. Editables en /configuracion/cuentas-bancarias del ERP.
      sbAny
        .from('cuentas_bancarias')
        .select('id, nombre_corto, banco, metodo_default')
        .eq('activo', true)
        .eq('visible_pos', true)
        .order('orden'),
    ]);
  // Normalizar las dos variantes de respuesta a un mismo formato
  type StockRow = { variante_id: string; cantidad?: number | string; stock_total?: number | string };
  const stocks = ((stocksRes.data ?? []) as StockRow[]).map((s) => ({
    variante_id: s.variante_id,
    stock_total: Math.max(0, Number(s.cantidad ?? s.stock_total ?? 0)),
  }));

  // Cascada: filtrar variantes cuya categoría esté apagada.
  const variantes = ((variantesRaw ?? []) as unknown as VarianteRow[]).filter((v) => {
    if (!v.productos) return false;
    if (v.productos.categoria_id == null) return true;
    return v.productos.categorias?.activo !== false;
  });

  const stockMap = new Map<string, number>();
  for (const s of stocks ?? []) {
    stockMap.set(s.variante_id as string, Number(s.stock_total ?? 0));
  }

  const cuentas = (cuentasRaw ?? []) as {
    id: string;
    nombre_corto: string;
    banco: string | null;
    metodo_default: string;
  }[];

  return (
    <PosTerminal
      variantes={variantes as unknown as Parameters<typeof PosTerminal>[0]['variantes']}
      cajas={(cajas ?? []) as unknown as Parameters<typeof PosTerminal>[0]['cajas']}
      categorias={(categoriasRaw ?? []) as unknown as Parameters<typeof PosTerminal>[0]['categorias']}
      stockPorVariante={Object.fromEntries(stockMap)}
      cajeroNombre={perfil?.nombre_completo ?? 'Cajero'}
      cajaDefault={cajaDefault}
      sesionInicial={sesionData}
      empresaNombre={empresaNombre}
      configEscalones={configEscalones}
      cuentasBancarias={cuentas}
    />
  );
}
