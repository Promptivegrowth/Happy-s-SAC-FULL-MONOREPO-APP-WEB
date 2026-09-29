import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/server/session';
import { hayCredencialesGRE } from '@/server/gre-core';
import { createServiceClient } from '@happy/db/service';
import { fechaLima } from '@happy/lib/format';
import { formatTallaChip } from '@happy/lib';
import { GuiaForm, type GuiaInicial, type AlmacenOpt, type TransportistaOpt } from './guia-form';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Nueva guía de remisión' };
export const dynamic = 'force-dynamic';
// Emitir espera la respuesta de SUNAT unos segundos.
export const maxDuration = 60;

const TIPO_DOC: Record<string, '1' | '6' | '4' | '7'> = { DNI: '1', RUC: '6', CE: '4', PASAPORTE: '7' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

/**
 * De dónde sale la guía.
 *
 * Lo normal es emitirla desde la boleta o factura de la venta que se despacha:
 * así viene con el cliente, los productos y el documento relacionado ya
 * cargados, y solo falta el transporte. También se puede partir de una venta
 * (nota de venta, que no es comprobante SUNAT) o copiar una guía anterior, que
 * es lo que se hace cuando SUNAT rechazó una y hay que emitirla corregida.
 */
async function precargar(sb: Sb, q: { comprobante?: string; venta?: string; copiar?: string }): Promise<{ inicial: GuiaInicial; aviso: string | null }> {
  const inicial: GuiaInicial = { items: [] };
  let aviso: string | null = null;

  if (q.copiar) {
    const { data: g } = await sb.from('guias_remision').select('*').eq('id', q.copiar).maybeSingle();
    if (g) {
      const { data: items } = await sb.from('guias_remision_items').select('variante_id, codigo, descripcion, cantidad').eq('guia_id', g.id).order('id');
      Object.assign(inicial, {
        venta_id: g.venta_id, comprobante_id: g.comprobante_id, cliente_id: g.cliente_id,
        almacen_partida_id: g.almacen_partida_id,
        destinatario_tipo_doc: g.destinatario_tipo_doc, destinatario_num_doc: g.destinatario_num_doc, destinatario_nombre: g.destinatario_nombre,
        motivo: g.motivo_traslado, motivo_descripcion: g.motivo_descripcion ?? '',
        modalidad: g.modalidad === 'PUBLICO' ? '01' : '02',
        peso_bruto_kg: g.peso_bruto_kg != null ? String(g.peso_bruto_kg) : '', num_bultos: g.num_bultos != null ? String(g.num_bultos) : '',
        transportista_ruc: g.transportista_ruc ?? '', transportista_razon_social: g.transportista_razon_social ?? '', transportista_mtc: g.transportista_mtc ?? '',
        placa: g.placa_vehiculo ?? '', conductor_dni: g.conductor_dni ?? '', conductor_nombres: g.conductor_nombre ?? '',
        conductor_apellidos: g.conductor_apellidos ?? '', conductor_licencia: g.conductor_licencia ?? '', vehiculo_m1l: g.vehiculo_m1l,
        partida_direccion: g.direccion_partida, partida_ubigeo: g.ubigeo_partida, partida_cod_establecimiento: g.cod_establecimiento_partida ?? '',
        llegada_direccion: g.direccion_llegada, llegada_ubigeo: g.ubigeo_llegada, llegada_cod_establecimiento: g.cod_establecimiento_llegada ?? '',
        observacion: g.observacion ?? '',
        items: (items ?? []).map((i: { variante_id: string | null; codigo: string | null; descripcion: string; cantidad: number }) => ({
          variante_id: i.variante_id, codigo: i.codigo ?? '', descripcion: i.descripcion, cantidad: Number(i.cantidad),
        })),
      } satisfies Partial<GuiaInicial>);
      aviso = `Copia de la guía ${g.numero_completo}. Revisa y corrige antes de emitir: se emitirá con un número nuevo.`;
    }
    return { inicial, aviso };
  }

  let comprobanteId = q.comprobante ?? null;
  let ventaId = q.venta ?? null;
  if (!comprobanteId && ventaId) {
    const { data: v } = await sb.from('ventas').select('comprobante_id').eq('id', ventaId).maybeSingle();
    comprobanteId = v?.comprobante_id ?? null;
  }

  if (comprobanteId) {
    const { data: c } = await sb.from('comprobantes')
      .select('id, tipo, numero_completo, venta_id, cliente_id, tipo_documento_cliente, numero_documento_cliente, razon_social_cliente, direccion_cliente, ubigeo_cliente')
      .eq('id', comprobanteId).maybeSingle();
    if (c) {
      ventaId = ventaId ?? c.venta_id;
      const { data: lineas } = await sb.from('comprobantes_lineas')
        .select('variante_id, codigo, descripcion, cantidad').eq('comprobante_id', c.id);
      const doc = TIPO_DOC[c.tipo_documento_cliente ?? ''];
      Object.assign(inicial, {
        comprobante_id: c.tipo === 'FACTURA' || c.tipo === 'BOLETA' ? c.id : null,
        cliente_id: c.cliente_id,
        destinatario_tipo_doc: doc ?? '1',
        destinatario_num_doc: doc && !/^0+$/.test(c.numero_documento_cliente ?? '') ? (c.numero_documento_cliente ?? '') : '',
        destinatario_nombre: /^cliente(s)? varios$/i.test(c.razon_social_cliente ?? '') ? '' : (c.razon_social_cliente ?? ''),
        llegada_direccion: c.direccion_cliente ?? '',
        llegada_ubigeo: c.ubigeo_cliente ?? '',
        items: (lineas ?? []).map((l: { variante_id: string | null; codigo: string | null; descripcion: string; cantidad: number }) => ({
          variante_id: l.variante_id, codigo: l.codigo ?? '', descripcion: l.descripcion, cantidad: Number(l.cantidad),
        })),
      } satisfies Partial<GuiaInicial>);
      inicial.documento = `${c.tipo === 'FACTURA' ? 'Factura' : c.tipo === 'BOLETA' ? 'Boleta' : 'Nota de venta'} ${c.numero_completo}`;

      const { data: previas } = await sb.from('guias_remision').select('numero_completo, estado')
        .eq('comprobante_id', c.id).neq('estado', 'RECHAZADO');
      if ((previas ?? []).length > 0) {
        aviso = `Ojo: esta venta ya tiene la guía ${(previas as { numero_completo: string }[]).map((p) => p.numero_completo).join(', ')}. Emite otra solo si es un envío distinto.`;
      }
    }
  }

  if (ventaId) {
    const { data: v } = await sb.from('ventas')
      .select('id, almacen_id, cliente_id, tipo_documento_cliente, documento_cliente, nombre_cliente_rapido').eq('id', ventaId).maybeSingle();
    if (v) {
      inicial.venta_id = v.id;
      inicial.almacen_partida_id = v.almacen_id;
      inicial.cliente_id = inicial.cliente_id ?? v.cliente_id;
      // Nota de venta: no hay comprobante del que sacar cliente y productos.
      if (inicial.items.length === 0) {
        const { data: lineas } = await sb.from('ventas_lineas')
          .select('variante_id, cantidad, variante:variante_id(sku, talla, producto:producto_id(nombre))').eq('venta_id', v.id);
        inicial.items = (lineas ?? []).map((l: { variante_id: string; cantidad: number; variante: { sku: string | null; talla: string | null; producto: { nombre: string } | null } | null }) => ({
          variante_id: l.variante_id,
          codigo: l.variante?.sku ?? '',
          descripcion: `${l.variante?.producto?.nombre ?? 'PRODUCTO'}${l.variante?.talla ? ` TALLA ${formatTallaChip(l.variante.talla)}` : ''}`.toUpperCase(),
          cantidad: Number(l.cantidad),
        }));
        const doc = TIPO_DOC[v.tipo_documento_cliente ?? ''];
        if (!inicial.destinatario_num_doc && doc && v.documento_cliente) {
          inicial.destinatario_tipo_doc = doc;
          inicial.destinatario_num_doc = v.documento_cliente;
        }
        if (!inicial.destinatario_nombre && v.nombre_cliente_rapido) inicial.destinatario_nombre = v.nombre_cliente_rapido;
      }
    }
  }

  // Dirección registrada del cliente, si la venta no traía una.
  if (inicial.cliente_id && !inicial.llegada_direccion) {
    const { data: cli } = await sb.from('clientes').select('direccion, ubigeo').eq('id', inicial.cliente_id).maybeSingle();
    if (cli?.direccion) inicial.llegada_direccion = cli.direccion;
    if (cli?.ubigeo) inicial.llegada_ubigeo = cli.ubigeo;
  }
  return { inicial, aviso };
}

export default async function NuevaGuiaPage({ searchParams }: { searchParams: Promise<{ comprobante?: string; venta?: string; copiar?: string }> }) {
  const q = await searchParams;
  const sesion = await getSession();
  const sb = (await createClient()) as unknown as Sb;

  const [{ inicial, aviso }, { data: empresa }, { data: alms }, { data: prev }] = await Promise.all([
    precargar(sb, q),
    sb.from('empresa').select('ruc, razon_social, direccion_fiscal, ubigeo').single(),
    sb.from('almacenes').select('id, codigo, nombre, direccion, ubigeo, codigo_establecimiento_sunat').eq('activo', true).order('nombre'),
    sb.from('guias_remision').select('transportista_ruc, transportista_razon_social, transportista_mtc')
      .eq('modalidad', 'PUBLICO').not('transportista_ruc', 'is', null).order('fecha_emision', { ascending: false }).limit(100),
  ]);

  if (!inicial.almacen_partida_id && sesion.almacen_default) inicial.almacen_partida_id = sesion.almacen_default;

  const credenciales = await hayCredencialesGRE(createServiceClient()).catch(() => false);
  const avisos = [
    credenciales ? null : 'Todavía no se pueden emitir guías: faltan las credenciales de la API de SUNAT (Configuración → SUNAT). Puedes revisar el formulario, pero no emitir.',
    aviso,
  ].filter(Boolean).join(' ') || null;

  // Las agencias que ya se usaron, sin repetir, para elegirlas con un toque.
  const vistos = new Set<string>();
  const transportistas: TransportistaOpt[] = [];
  for (const t of (prev ?? []) as Array<{ transportista_ruc: string; transportista_razon_social: string | null; transportista_mtc: string | null }>) {
    if (vistos.has(t.transportista_ruc)) continue;
    vistos.add(t.transportista_ruc);
    transportistas.push({ ruc: t.transportista_ruc, razonSocial: t.transportista_razon_social ?? '', mtc: t.transportista_mtc ?? '' });
  }

  return (
    <PageShell
      title="Nueva guía de remisión"
      description="Guía de Remisión Remitente electrónica. Se envía a SUNAT al emitirla."
      actions={<Button asChild variant="ghost"><Link href="/guias"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
    >
      <GuiaForm
        inicial={inicial}
        aviso={avisos}
        hoy={fechaLima()}
        empresa={{ ruc: empresa?.ruc ?? '', razonSocial: empresa?.razon_social ?? '', direccionFiscal: empresa?.direccion_fiscal ?? '', ubigeoFiscal: empresa?.ubigeo ?? '' }}
        almacenes={(alms ?? []) as AlmacenOpt[]}
        transportistas={transportistas}
      />
    </PageShell>
  );
}
