/**
 * Seed de datos base HAPPY SAC.
 * Ejecución: pnpm tsx supabase/seed/01-datos-base.ts
 */

import { log, sb, upsert } from './_env';

async function main() {
  log('==> Cargando datos base');

  // 1. Empresa
  await upsert('empresa', [{
    ruc: '20609213770', // TODO: reemplazar con RUC real de HAPPY SAC
    razon_social: 'HAPPY SAC',
    nombre_comercial: 'DISFRACES HAPPYS',
    direccion_fiscal: 'Lima, Perú',
    email: 'ventas@disfraceshappys.com',
    telefono: '51916856842',
    moneda_base: 'PEN',
    zona_horaria: 'America/Lima',
    igv_porcentaje: 18,
  }], 'ruc');

  // 2. Unidades de medida
  const unidades = [
    { codigo: 'm',       nombre: 'Metro',      simbolo: 'm',    tipo: 'LONGITUD', sunat_codigo: 'MTR' },
    { codigo: 'kg',      nombre: 'Kilogramo',  simbolo: 'kg',   tipo: 'PESO',     sunat_codigo: 'KGM' },
    { codigo: 'unid',    nombre: 'Unidad',     simbolo: 'u',    tipo: 'UNIDAD',   sunat_codigo: 'NIU' },
    { codigo: 'pieza',   nombre: 'Pieza',      simbolo: 'pz',   tipo: 'UNIDAD',   sunat_codigo: 'NIU' },
    { codigo: 'rollo',   nombre: 'Rollo',      simbolo: 'ro',   tipo: 'CONJUNTO', sunat_codigo: 'NIU' },
    { codigo: 'millar',  nombre: 'Millar',     simbolo: 'mil',  tipo: 'CONJUNTO', sunat_codigo: 'MLL' },
    { codigo: 'mazo',    nombre: 'Mazo',       simbolo: 'maz',  tipo: 'CONJUNTO', sunat_codigo: 'NIU' },
    { codigo: 'madeja',  nombre: 'Madeja',     simbolo: 'md',   tipo: 'CONJUNTO', sunat_codigo: 'NIU' },
    { codigo: 'cono',    nombre: 'Cono',       simbolo: 'cn',   tipo: 'CONJUNTO', sunat_codigo: 'NIU' },
    { codigo: 'disco',   nombre: 'Disco',      simbolo: 'ds',   tipo: 'CONJUNTO', sunat_codigo: 'NIU' },
    { codigo: 'hilo',    nombre: 'Hilo',       simbolo: 'hl',   tipo: 'CONJUNTO', sunat_codigo: 'NIU' },
    { codigo: 'litro',   nombre: 'Litro',      simbolo: 'L',    tipo: 'VOLUMEN',  sunat_codigo: 'LTR' },
  ];
  await upsert('unidades_medida', unidades, 'codigo');

  // 3. Áreas de producción (con valores-minuto desde Excel VALOR MIN POR AREA)
  const areas = [
    { codigo: 'CORTE',       nombre: 'Corte',     valor_minuto: 0.21096 },
    { codigo: 'DECORADO',    nombre: 'Decorado',  valor_minuto: 0.11280 },
    { codigo: 'ESTAMPADO',   nombre: 'Estampado', valor_minuto: 0.15210 },
    { codigo: 'BORDADO',     nombre: 'Bordado',   valor_minuto: 0.23447 },
    { codigo: 'SUBLIMADO',   nombre: 'Sublimado', valor_minuto: 0.37341 },
    { codigo: 'PLISADO',     nombre: 'Plisado',   valor_minuto: 0.13280 },
    { codigo: 'ACABADO',     nombre: 'Acabado',   valor_minuto: 0.15189 },
    { codigo: 'PLANCHADO',   nombre: 'Planchado', valor_minuto: 0.13280 },
  ];
  await upsert('areas_produccion', areas, 'codigo');

  // 4. Almacenes (3: Santa Bárbara central, Huallaga tienda, La Quinta tienda)
  const almacenes = [
    {
      codigo: 'ALM-SB', nombre: 'Almacén Santa Bárbara',
      tipo: 'PRODUCTO_TERMINADO', direccion: 'Santa Bárbara, Lima',
      es_tienda: false, permite_ventas: false, permite_produccion: true, permite_compras: true,
      color_etiqueta: '#6c2bd9',
    },
    {
      codigo: 'TDA-HU', nombre: 'Tienda Huallaga',
      tipo: 'TIENDA', direccion: 'Jr. Huallaga, Lima',
      es_tienda: true, permite_ventas: true, permite_compras: false, permite_produccion: false,
      color_etiqueta: '#ff4d0d',
    },
    {
      codigo: 'TDA-LQ', nombre: 'Tienda La Quinta',
      tipo: 'TIENDA', direccion: 'La Quinta, Lima',
      es_tienda: true, permite_ventas: true, permite_compras: false, permite_produccion: false,
      color_etiqueta: '#14b8a6',
    },
    {
      codigo: 'ALM-MP', nombre: 'Almacén Materia Prima',
      tipo: 'MATERIA_PRIMA', direccion: 'Santa Bárbara, Lima',
      es_tienda: false, permite_ventas: false, permite_compras: true, permite_produccion: true,
      color_etiqueta: '#0ea5e9',
    },
    {
      codigo: 'ALM-MR', nombre: 'Almacén de Merma',
      tipo: 'MERMA', direccion: 'Santa Bárbara, Lima',
      es_tienda: false, permite_ventas: false, permite_compras: false, permite_produccion: false,
      color_etiqueta: '#64748b',
    },
  ];
  await upsert('almacenes', almacenes, 'codigo');

  // 5. Cajas (1 por tienda)
  const { data: almRows } = await sb.from('almacenes').select('id, codigo');
  const tdaHu = almRows?.find((a) => a.codigo === 'TDA-HU');
  const tdaLq = almRows?.find((a) => a.codigo === 'TDA-LQ');

  if (tdaHu && tdaLq) {
    await upsert('cajas', [
      { codigo: 'CAJA-HU-01', almacen_id: tdaHu.id, nombre: 'Caja Huallaga', serie_boleta: 'BH01', serie_factura: 'FH01', serie_nota_venta: 'NH01', monto_apertura_default: 100 },
      { codigo: 'CAJA-LQ-01', almacen_id: tdaLq.id, nombre: 'Caja La Quinta', serie_boleta: 'BL01', serie_factura: 'FL01', serie_nota_venta: 'NL01', monto_apertura_default: 100 },
    ], 'codigo');
  }

  // 6. Series de comprobantes (para ERP y web)
  await upsert('series_comprobantes', [
    { tipo: 'BOLETA',       serie: 'B001', canal: 'WEB'  },
    { tipo: 'FACTURA',      serie: 'F001', canal: 'WEB'  },
    { tipo: 'BOLETA',       serie: 'BH01', canal: 'POS'  },
    { tipo: 'FACTURA',      serie: 'FH01', canal: 'POS'  },
    { tipo: 'BOLETA',       serie: 'BL01', canal: 'POS'  },
    { tipo: 'FACTURA',      serie: 'FL01', canal: 'POS'  },
    { tipo: 'NOTA_VENTA',   serie: 'NV01', canal: 'POS'  },
    { tipo: 'NOTA_CREDITO', serie: 'NC01', canal: 'POS'  },
    { tipo: 'NOTA_DEBITO',  serie: 'ND01', canal: 'POS'  },
    { tipo: 'GUIA_REMISION',serie: 'T001'                 },
  ], 'tipo,serie');

  // 7. Categorías base (de lo que se ve en los Excels: DANZAS TIPICAS, FIESTAS PATRIAS, etc.)
  const categorias = [
    { codigo: 'DANZAS',      nombre: 'Danzas Típicas',     slug: 'danzas-tipicas',     icono: '💃', orden_web: 10 },
    { codigo: 'FP',          nombre: 'Fiestas Patrias',    slug: 'fiestas-patrias',    icono: '🇵🇪', orden_web: 20 },
    { codigo: 'HALLOWEEN',   nombre: 'Halloween',          slug: 'halloween',          icono: '🎃', orden_web: 30 },
    { codigo: 'NAVIDAD',     nombre: 'Navidad',            slug: 'navidad',            icono: '🎅', orden_web: 40 },
    { codigo: 'SUPER',       nombre: 'Superhéroes',        slug: 'superheroes',        icono: '🦸', orden_web: 50 },
    { codigo: 'PRINCESAS',   nombre: 'Princesas',          slug: 'princesas',          icono: '👸', orden_web: 60 },
    { codigo: 'PERSONAJES',  nombre: 'Personajes de TV',   slug: 'personajes-tv',      icono: '📺', orden_web: 70 },
    { codigo: 'PROFESIONES', nombre: 'Profesiones',        slug: 'profesiones',        icono: '👩‍🚒', orden_web: 80 },
    { codigo: 'ANIMALES',    nombre: 'Animales',           slug: 'animales',           icono: '🦁', orden_web: 90 },
    { codigo: 'CARNAVAL',    nombre: 'Carnavales',         slug: 'carnavales',         icono: '🎭', orden_web: 100 },
  ];
  await upsert('categorias', categorias, 'codigo');

  // 8. Campañas (temporadas)
  await upsert('campanas', [
    { codigo: 'HALLOWEEN-2026', nombre: 'Halloween 2026', fecha_inicio: '2026-09-01', fecha_fin: '2026-11-05', factor_costo_servicio: 1.10 },
    { codigo: 'FIESTASPATRIAS-2026', nombre: 'Fiestas Patrias 2026', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-31', factor_costo_servicio: 1.05 },
    { codigo: 'NAVIDAD-2026', nombre: 'Navidad 2026', fecha_inicio: '2026-11-15', fecha_fin: '2026-12-26', factor_costo_servicio: 1.10 },
  ], 'codigo');

  // 9. Colores base
  const colores = [
    { codigo: 'BLANCO',   nombre: 'Blanco',   hex: '#FFFFFF' },
    { codigo: 'NEGRO',    nombre: 'Negro',    hex: '#000000' },
    { codigo: 'ROJO',     nombre: 'Rojo',     hex: '#DC2626' },
    { codigo: 'AZUL',     nombre: 'Azul',     hex: '#2563EB' },
    { codigo: 'AZULINO',  nombre: 'Azulino',  hex: '#1E3A8A' },
    { codigo: 'AMARILLO', nombre: 'Amarillo', hex: '#FBBF24' },
    { codigo: 'DORADO',   nombre: 'Dorado',   hex: '#D4AF37' },
    { codigo: 'PLATEADO', nombre: 'Plateado', hex: '#C0C0C0' },
    { codigo: 'VERDE',    nombre: 'Verde',    hex: '#16A34A' },
    { codigo: 'ROSADO',   nombre: 'Rosado',   hex: '#EC4899' },
    { codigo: 'CELESTE',  nombre: 'Celeste',  hex: '#38BDF8' },
    { codigo: 'NARANJA',  nombre: 'Naranja',  hex: '#FB923C' },
    { codigo: 'MORADO',   nombre: 'Morado',   hex: '#9333EA' },
    { codigo: 'MARRON',   nombre: 'Marrón',   hex: '#7C4A20' },
    { codigo: 'GUINDA',   nombre: 'Guinda',   hex: '#6F1A1A' },
  ];
  await upsert('colores', colores, 'codigo');

  // 10. Catálogo de defectos
  await upsert('defectos', [
    { codigo: 'COSTURA_SUELTA', nombre: 'Costura suelta',       severidad: 'MEDIA', accion_default: 'REPROCESO' },
    { codigo: 'MANCHA',         nombre: 'Mancha',               severidad: 'ALTA',  accion_default: 'REPROCESO' },
    { codigo: 'MEDIDA_MAL',     nombre: 'Medida incorrecta',    severidad: 'ALTA',  accion_default: 'REPROCESO' },
    { codigo: 'BORDADO_MAL',    nombre: 'Bordado mal colocado', severidad: 'MEDIA', accion_default: 'DEVOLVER_TALLER' },
    { codigo: 'TELA_ROTA',      nombre: 'Tela rota',            severidad: 'ALTA',  accion_default: 'MERMA' },
    { codigo: 'ESTAMPADO_MAL',  nombre: 'Estampado defectuoso', severidad: 'MEDIA', accion_default: 'REPROCESO' },
    { codigo: 'FALTA_AVIO',     nombre: 'Falta avío',           severidad: 'BAJA',  accion_default: 'REPROCESO' },
  ], 'codigo');

  log('✅ Datos base completados');
}

main().catch((e) => { console.error(e); process.exit(1); });
