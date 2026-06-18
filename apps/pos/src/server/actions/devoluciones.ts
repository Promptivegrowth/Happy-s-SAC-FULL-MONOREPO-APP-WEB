'use server';

/**
 * Devoluciones / cambios desde el POS.
 *
 * Flujo:
 *  1. Cajero busca venta por número de comprobante o número de venta
 *  2. Sistema devuelve líneas con cantidad disponible (vendida - ya devuelta)
 *  3. Cajero selecciona qué líneas y qué cantidades devolver
 *  4. Registra devolución + líneas + kardex ENTRADA_DEVOLUCION (si reingresa stock)
 *
 * Conexión con ERP:
 *  - La devolución queda en tabla `devoluciones` (visible desde ERP)
 *  - El stock se reincorpora vía `kardex_movimientos` ENTRADA_DEVOLUCION
 *  - Si es CAMBIO, no se reembolsa dinero (solo entra el producto devuelto)
 *  - Si es DEVOLUCION, se registra metodo_devolucion + monto_devuelto
 */

import { z } from 'zod';
import { createClient } from '@happy/db/server';
import { createServiceClient } from '@happy/db/service';

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function requireUserId(): Promise<string> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return user.id;
}

export type VentaDevolucionData = {
  venta_id: string;
  numero_venta: string;
  fecha: string;
  total: number;
  cliente_nombre: string;
  cliente_doc: string | null;
  almacen_id: string;
  almacen_nombre: string;
  comprobante: { tipo: string; numero_completo: string } | null;
  lineas: {
    venta_linea_id: string;
    variante_id: string;
    producto_nombre: string;
    sku: string;
    talla: string;
    cantidad_vendida: number;
    cantidad_ya_devuelta: number;
    cantidad_disponible: number;
    precio_unitario: number;
  }[];
};

// ============================================================================
// BUSCAR VENTA por número (venta o comprobante)
// ============================================================================
export async function buscarVentaParaDevolucion(query: string): Promise<VentaDevolucionData | null> {
  const q = query.trim().toUpperCase();
  if (q.length < 3) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = (await createClient()) as any;

  // 1) Buscar por número de comprobante (B001-00000123)
  let ventaId: string | null = null;
  const { data: comp } = await sb
    .from('comprobantes')
    .select('venta_id, tipo, numero_completo')
    .eq('numero_completo', q)
    .maybeSingle();
  if (comp?.venta_id) {
    ventaId = comp.venta_id as string;
  } else {
    // 2) Buscar por número de venta (NV-2026-000123 o similar)
    const { data: vNum } = await sb
      .from('ventas')
      .select('id')
      .eq('numero', q)
      .maybeSingle();
    if (vNum?.id) ventaId = vNum.id as string;
  }

  if (!ventaId) return null;
  return obtenerVentaDevolucionInterno(sb, ventaId);
}

export async function obtenerVentaDevolucion(ventaId: string): Promise<VentaDevolucionData | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = (await createClient()) as any;
  return obtenerVentaDevolucionInterno(sb, ventaId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function obtenerVentaDevolucionInterno(sb: any, ventaId: string): Promise<VentaDevolucionData | null> {
  const { data: venta } = await sb
    .from('ventas')
    .select(
      'id, numero, fecha, total, estado, almacen_id, nombre_cliente_rapido, documento_cliente, ' +
        'almacen:almacen_id(nombre), cliente:cliente_id(razon_social, nombres, apellido_paterno, apellido_materno)',
    )
    .eq('id', ventaId)
    .single();
  if (!venta) return null;
  if (venta.estado === 'ANULADA') return null;

  // Líneas de la venta
  const { data: lineas } = await sb
    .from('ventas_lineas')
    .select('id, variante_id, cantidad, precio_unitario, variantes:variante_id(sku, talla, productos:producto_id(nombre))')
    .eq('venta_id', ventaId);

  type LineaRaw = {
    id: string;
    variante_id: string;
    cantidad: number;
    precio_unitario: string | number;
    variantes: { sku: string; talla: string; productos: { nombre: string } | null } | null;
  };
  const lineasArr = (lineas ?? []) as LineaRaw[];

  // Cantidades ya devueltas por línea (sumar de devoluciones_lineas)
  const lineaIds = lineasArr.map((l) => l.id);
  const yaDevueltoMap = new Map<string, number>();
  if (lineaIds.length > 0) {
    // Solo contar devoluciones NO anuladas (la tabla no tiene estado, todas cuentan)
    const { data: devLineas } = await sb
      .from('devoluciones_lineas')
      .select('venta_linea_id, cantidad')
      .in('venta_linea_id', lineaIds);
    for (const dl of (devLineas ?? []) as { venta_linea_id: string; cantidad: number }[]) {
      const acc = yaDevueltoMap.get(dl.venta_linea_id) ?? 0;
      yaDevueltoMap.set(dl.venta_linea_id, acc + Number(dl.cantidad));
    }
  }

  // Comprobante asociado (el más reciente)
  const { data: comp } = await sb
    .from('comprobantes')
    .select('tipo, numero_completo')
    .eq('venta_id', ventaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const cliNombre =
    venta.cliente?.razon_social ||
    [venta.cliente?.nombres, venta.cliente?.apellido_paterno, venta.cliente?.apellido_materno].filter(Boolean).join(' ').trim() ||
    venta.nombre_cliente_rapido ||
    'CLIENTE VARIOS';

  return {
    venta_id: venta.id as string,
    numero_venta: venta.numero as string,
    fecha: venta.fecha as string,
    total: Number(venta.total ?? 0),
    cliente_nombre: cliNombre,
    cliente_doc: (venta.documento_cliente as string | null) ?? null,
    almacen_id: venta.almacen_id as string,
    almacen_nombre: (venta.almacen?.nombre as string) ?? '—',
    comprobante: comp ? { tipo: comp.tipo as string, numero_completo: comp.numero_completo as string } : null,
    lineas: lineasArr.map((l) => {
      const vendida = Number(l.cantidad);
      const yaDev = yaDevueltoMap.get(l.id) ?? 0;
      return {
        venta_linea_id: l.id,
        variante_id: l.variante_id,
        producto_nombre: l.variantes?.productos?.nombre ?? '—',
        sku: l.variantes?.sku ?? '—',
        talla: l.variantes?.talla ?? '—',
        cantidad_vendida: vendida,
        cantidad_ya_devuelta: yaDev,
        cantidad_disponible: Math.max(0, vendida - yaDev),
        precio_unitario: Number(l.precio_unitario ?? 0),
      };
    }),
  };
}

// ============================================================================
// REGISTRAR DEVOLUCIÓN
// ============================================================================
const lineaInputSchema = z.object({
  venta_linea_id: z.string().uuid(),
  variante_id: z.string().uuid(),
  cantidad: z.number().int().min(1),
  precio_unitario: z.number().min(0),
  reingresa_stock: z.boolean().default(true),
});

const devolucionSchema = z.object({
  venta_id: z.string().uuid(),
  almacen_id: z.string().uuid(),
  tipo: z.enum(['DEVOLUCION', 'CAMBIO']),
  motivo: z.string().min(1).max(500),
  observacion: z.string().nullable().optional().or(z.literal('')),
  metodo_devolucion: z.enum([
    'EFECTIVO', 'YAPE', 'PLIN', 'TARJETA_DEBITO', 'TARJETA_CREDITO',
    'TRANSFERENCIA', 'DEPOSITO', 'CREDITO',
  ]).nullable().optional(),
  monto_devuelto: z.number().min(0).default(0),
  lineas: z.array(lineaInputSchema).min(1),
});

export async function registrarDevolucion(
  input: z.input<typeof devolucionSchema>,
): Promise<ActionResult<{ id: string; numero: string }>> {
  try {
    const userId = await requireUserId();
    const data = devolucionSchema.parse(input);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceClient() as any;

    // 1) Generar número correlativo DEV-YYYY-NNNNNN
    let numero: string;
    try {
      const { data: corr } = await sb.rpc('next_correlativo', { p_clave: 'DEVOLUCION', p_padding: 6 });
      numero = typeof corr === 'string' ? corr : `DEV-${Date.now()}`;
    } catch {
      numero = `DEV-${Date.now()}`;
    }

    // 2) Validar que las cantidades no excedan lo disponible
    const venta = await obtenerVentaDevolucionInterno(sb, data.venta_id);
    if (!venta) throw new Error('Venta no encontrada');

    const disponiblePorLinea = new Map<string, number>();
    for (const l of venta.lineas) disponiblePorLinea.set(l.venta_linea_id, l.cantidad_disponible);

    for (const l of data.lineas) {
      const disp = disponiblePorLinea.get(l.venta_linea_id) ?? 0;
      if (l.cantidad > disp) {
        throw new Error(`Cantidad ${l.cantidad} excede lo disponible (${disp}) en una de las líneas`);
      }
    }

    // 3) Insertar cabecera
    const cabecera = {
      numero,
      venta_id: data.venta_id,
      fecha: new Date().toISOString(),
      almacen_id: data.almacen_id,
      atendido_por: userId,
      motivo: data.motivo,
      tipo: data.tipo,
      monto_devuelto: data.tipo === 'DEVOLUCION' ? data.monto_devuelto : 0,
      metodo_devolucion: data.tipo === 'DEVOLUCION' ? data.metodo_devolucion : null,
      observacion: data.observacion === '' ? null : (data.observacion ?? null),
    };
    const { data: devIns, error: errCab } = await sb
      .from('devoluciones')
      .insert(cabecera)
      .select('id, numero')
      .single();
    if (errCab) throw new Error(`Devolución: ${errCab.message}`);
    const devId = devIns.id as string;

    // 4) Insertar líneas
    const lineasInsert = data.lineas.map((l) => ({
      devolucion_id: devId,
      venta_linea_id: l.venta_linea_id,
      variante_id: l.variante_id,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      reingresa_stock: l.reingresa_stock,
    }));
    const { error: errLin } = await sb.from('devoluciones_lineas').insert(lineasInsert);
    if (errLin) {
      // Rollback cabecera
      await sb.from('devoluciones').delete().eq('id', devId);
      throw new Error(`Líneas: ${errLin.message}`);
    }

    // 5) Generar kardex ENTRADA_DEVOLUCION por cada línea que reingresa stock
    const movimientosKardex = data.lineas
      .filter((l) => l.reingresa_stock)
      .map((l) => ({
        fecha: new Date().toISOString(),
        tipo: 'ENTRADA_DEVOLUCION',
        almacen_id: data.almacen_id,
        variante_id: l.variante_id,
        cantidad: l.cantidad,
        costo_unitario: l.precio_unitario,
        costo_total: l.precio_unitario * l.cantidad,
        referencia_tipo: 'DEVOLUCION',
        referencia_id: devId,
        referencia_numero: numero,
        observacion: `Devolución ${numero} de venta ${venta.numero_venta}`,
      }));
    if (movimientosKardex.length > 0) {
      const { error: errKx } = await sb.from('kardex_movimientos').insert(movimientosKardex);
      if (errKx) {
        // Rollback total
        await sb.from('devoluciones_lineas').delete().eq('devolucion_id', devId);
        await sb.from('devoluciones').delete().eq('id', devId);
        throw new Error(`Kardex: ${errKx.message}`);
      }
    }

    return { ok: true, data: { id: devId, numero: devIns.numero as string } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ============================================================================
// LISTAR DEVOLUCIONES DE LA SESIÓN (para historial cajero)
// ============================================================================
export type DevolucionRow = {
  id: string;
  numero: string;
  fecha: string;
  venta_numero: string | null;
  cliente_nombre: string;
  tipo: 'DEVOLUCION' | 'CAMBIO';
  monto: number;
  metodo: string | null;
};

export async function listarDevolucionesSesion(): Promise<DevolucionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = (await createClient()) as any;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  // Devoluciones del día hechas por el cajero (proxy de "sesión")
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const { data: devs } = await sb
    .from('devoluciones')
    .select(
      'id, numero, fecha, tipo, monto_devuelto, metodo_devolucion, ' +
        'venta:venta_id(numero, nombre_cliente_rapido, cliente:cliente_id(razon_social, nombres, apellido_paterno))',
    )
    .eq('atendido_por', user.id)
    .gte('fecha', inicioDia.toISOString())
    .order('fecha', { ascending: false });

  type DR = {
    id: string;
    numero: string;
    fecha: string;
    tipo: 'DEVOLUCION' | 'CAMBIO';
    monto_devuelto: string | number | null;
    metodo_devolucion: string | null;
    venta: {
      numero: string;
      nombre_cliente_rapido: string | null;
      cliente: { razon_social: string | null; nombres: string | null; apellido_paterno: string | null } | null;
    } | null;
  };

  return ((devs ?? []) as DR[]).map((d) => {
    const cliNombre =
      d.venta?.cliente?.razon_social ||
      [d.venta?.cliente?.nombres, d.venta?.cliente?.apellido_paterno].filter(Boolean).join(' ').trim() ||
      d.venta?.nombre_cliente_rapido ||
      'CLIENTE VARIOS';
    return {
      id: d.id,
      numero: d.numero,
      fecha: d.fecha,
      venta_numero: d.venta?.numero ?? null,
      cliente_nombre: cliNombre,
      tipo: d.tipo,
      monto: Number(d.monto_devuelto ?? 0),
      metodo: d.metodo_devolucion,
    };
  });
}

// ============================================================================
// DATOS PARA PDF DE COMPROBANTE DE DEVOLUCIÓN
// ============================================================================
export type DevolucionPDFData = {
  numero: string;
  fecha: string;
  tipo: 'DEVOLUCION' | 'CAMBIO';
  motivo: string;
  observacion: string | null;
  monto_devuelto: number;
  metodo_devolucion: string | null;
  atendido_por_nombre: string;
  almacen_nombre: string;
  venta: {
    numero: string;
    fecha: string;
    comprobante: { tipo: string; numero_completo: string } | null;
  };
  cliente: {
    nombre: string;
    documento: string | null;
    tipo_documento: string | null;
  };
  lineas: {
    producto_nombre: string;
    sku: string;
    talla: string;
    cantidad: number;
    precio_unitario: number;
    sub_total: number;
  }[];
  empresa: {
    razon_social: string;
    nombre_comercial: string | null;
    ruc: string;
    direccion_fiscal: string | null;
    telefono: string | null;
    email: string | null;
  } | null;
  logo_dataurl: string | null;
};

export async function cargarDatosDevolucionPDF(devolucionId: string): Promise<DevolucionPDFData | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = (await createClient()) as any;

  const { data: dev } = await sb
    .from('devoluciones')
    .select(
      'id, numero, fecha, tipo, motivo, observacion, monto_devuelto, metodo_devolucion, atendido_por, almacen_id, venta_id, ' +
        'almacen:almacen_id(nombre)',
    )
    .eq('id', devolucionId)
    .single();
  if (!dev) return null;

  const [{ data: lineasRaw }, { data: venta }, { data: empresa }, { data: perfil }] = await Promise.all([
    sb
      .from('devoluciones_lineas')
      .select('cantidad, precio_unitario, variantes:variante_id(sku, talla, productos:producto_id(nombre))')
      .eq('devolucion_id', devolucionId),
    sb
      .from('ventas')
      .select(
        'numero, fecha, nombre_cliente_rapido, documento_cliente, tipo_documento_cliente, comprobante_id, ' +
          'cliente:cliente_id(razon_social, nombres, apellido_paterno, apellido_materno, tipo_documento, numero_documento)',
      )
      .eq('id', dev.venta_id)
      .single(),
    sb.from('empresa').select('razon_social, nombre_comercial, ruc, direccion_fiscal, telefono, email, logo_url').single(),
    sb.from('perfiles').select('nombre_completo').eq('id', dev.atendido_por).maybeSingle(),
  ]);

  // Comprobante de la venta (más reciente)
  let comprobante: { tipo: string; numero_completo: string } | null = null;
  if (venta?.comprobante_id) {
    const { data: c } = await sb
      .from('comprobantes')
      .select('tipo, numero_completo')
      .eq('id', venta.comprobante_id)
      .maybeSingle();
    if (c) comprobante = { tipo: c.tipo as string, numero_completo: c.numero_completo as string };
  } else {
    const { data: c } = await sb
      .from('comprobantes')
      .select('tipo, numero_completo')
      .eq('venta_id', dev.venta_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (c) comprobante = { tipo: c.tipo as string, numero_completo: c.numero_completo as string };
  }

  // Logo como dataURL para incrustar en el PDF
  let logo_dataurl: string | null = null;
  const emp = empresa as { logo_url: string | null } | null;
  if (emp?.logo_url) {
    try {
      const resp = await fetch(emp.logo_url, { cache: 'no-store' });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const ext = (emp.logo_url.split('.').pop() ?? 'png').toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        logo_dataurl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch { /* opcional */ }
  }

  type LR = {
    cantidad: number;
    precio_unitario: string | number;
    variantes: { sku: string; talla: string; productos: { nombre: string } | null } | null;
  };
  const lineas = ((lineasRaw ?? []) as LR[]).map((l) => {
    const pu = Number(l.precio_unitario ?? 0);
    return {
      producto_nombre: l.variantes?.productos?.nombre ?? '—',
      sku: l.variantes?.sku ?? '—',
      talla: l.variantes?.talla ?? '—',
      cantidad: Number(l.cantidad),
      precio_unitario: pu,
      sub_total: pu * Number(l.cantidad),
    };
  });

  const cliNombre =
    venta?.cliente?.razon_social ||
    [venta?.cliente?.nombres, venta?.cliente?.apellido_paterno, venta?.cliente?.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    venta?.nombre_cliente_rapido ||
    'CLIENTE VARIOS';

  return {
    numero: dev.numero as string,
    fecha: dev.fecha as string,
    tipo: dev.tipo as 'DEVOLUCION' | 'CAMBIO',
    motivo: (dev.motivo as string) ?? '',
    observacion: (dev.observacion as string | null) ?? null,
    monto_devuelto: Number(dev.monto_devuelto ?? 0),
    metodo_devolucion: (dev.metodo_devolucion as string | null) ?? null,
    atendido_por_nombre: (perfil?.nombre_completo as string | null) ?? 'Cajero',
    almacen_nombre: (dev.almacen?.nombre as string) ?? '—',
    venta: {
      numero: venta?.numero as string,
      fecha: venta?.fecha as string,
      comprobante,
    },
    cliente: {
      nombre: cliNombre,
      documento: (venta?.cliente?.numero_documento ?? venta?.documento_cliente ?? null) as string | null,
      tipo_documento: (venta?.cliente?.tipo_documento ?? venta?.tipo_documento_cliente ?? null) as string | null,
    },
    lineas,
    empresa: empresa as DevolucionPDFData['empresa'],
    logo_dataurl,
  };
}
