'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

// Mapeo categoría → prefijo de 4 letras para el código auto.
// La "N" final = "Nuevo" (creado desde la UI del ERP, no importado del
// sistema viejo). Los códigos importados (ej. TEL0000057, TEL2320007) usan
// los prefijos cortos TEL/AVI/INS/EMP y NO se tocan — quedan como están
// para preservar la trazabilidad con planillas/Excel del cliente.
// Decisión tomada con el cliente tras detectar que los códigos importados
// están dispersos por todo el rango 1..9.6M sin patrón consecutivo, lo que
// hacía imposible sincronizar el contador a un "rango limpio".
const PREFIJO_CAT: Record<'TELA' | 'AVIO' | 'INSUMO' | 'EMPAQUE', string> = {
  TELA: 'TELN',
  AVIO: 'AVIN',
  INSUMO: 'INSN',
  EMPAQUE: 'EMPN',
};

const schema = z.object({
  // Opcional: si vacío, server lo autogenera como <PREFIJO_CAT><NNNN>.
  codigo: z.string().max(40).optional().or(z.literal('')),
  nombre: z.string().min(2).max(200),
  descripcion: z.string().optional().or(z.literal('')),
  categoria: z.enum(['TELA','AVIO','INSUMO','EMPAQUE']),
  sub_categoria: z.string().optional().or(z.literal('')),
  color_nombre: z.string().optional().or(z.literal('')),
  unidad_compra_id: z.string().uuid().optional().or(z.literal('')),
  unidad_consumo_id: z.string().uuid().optional().or(z.literal('')),
  factor_conversion: z.coerce.number().min(0).default(1),
  precio_unitario: z.coerce.number().min(0).default(0),
  precio_incluye_igv: z.boolean().default(true),
  stock_minimo: z.coerce.number().min(0).default(0),
  es_importado: z.boolean().default(false),
  requiere_lote: z.boolean().default(false),
  proveedor_preferido_id: z.string().uuid().optional().or(z.literal('')),
  notas: z.string().optional().or(z.literal('')),
  imagen_url: z.string().url().optional().or(z.literal('')),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  return schema.parse({
    codigo: fd.get('codigo') || '',
    nombre: fd.get('nombre'),
    descripcion: fd.get('descripcion') || '',
    categoria: fd.get('categoria') || 'INSUMO',
    sub_categoria: fd.get('sub_categoria') || '',
    color_nombre: fd.get('color_nombre') || '',
    unidad_compra_id: fd.get('unidad_compra_id') || '',
    unidad_consumo_id: fd.get('unidad_consumo_id') || '',
    factor_conversion: fd.get('factor_conversion') || 1,
    precio_unitario: fd.get('precio_unitario') || 0,
    precio_incluye_igv: fd.get('precio_incluye_igv') === 'on',
    stock_minimo: fd.get('stock_minimo') || 0,
    es_importado: fd.get('es_importado') === 'on',
    requiere_lote: fd.get('requiere_lote') === 'on',
    proveedor_preferido_id: fd.get('proveedor_preferido_id') || '',
    notas: fd.get('notas') || '',
    imagen_url: fd.get('imagen_url') || '',
    activo: fd.get('activo') !== 'off',
  });
}

function clean(d: ReturnType<typeof parseForm>) {
  return {
    codigo: (d.codigo ?? '').trim().toUpperCase(),
    nombre: d.nombre.trim(),
    descripcion: d.descripcion || null,
    categoria: d.categoria,
    sub_categoria: d.sub_categoria || null,
    color_nombre: d.color_nombre || null,
    unidad_compra_id: d.unidad_compra_id || null,
    unidad_consumo_id: d.unidad_consumo_id || d.unidad_compra_id || null,
    factor_conversion: d.factor_conversion,
    precio_unitario: d.precio_unitario,
    precio_incluye_igv: d.precio_incluye_igv,
    stock_minimo: d.stock_minimo,
    es_importado: d.es_importado,
    requiere_lote: d.requiere_lote,
    proveedor_preferido_id: d.proveedor_preferido_id || null,
    notas: d.notas || null,
    imagen_url: d.imagen_url || null,
    activo: d.activo,
  };
}

export async function crearMaterial(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();

    const cleaned = clean(data);

    // Si el código vino vacío, autogenerar como <PREFIJO_CAT><NNNN>.
    // Con reintento (2026-07-13): los imports masivos crearon códigos sin
    // pasar por el contador `correlativos`, y el autogenerado podía chocar
    // con uno existente ("Código INSN0003 ya existe" aunque el campo estaba
    // vacío). Si choca, se pide el siguiente correlativo hasta encontrar
    // uno libre (máx. 25 intentos). El contador además fue sincronizado
    // con el máximo real por prefijo.
    const autogenerado = !cleaned.codigo;
    const prefix = PREFIJO_CAT[cleaned.categoria];
    const generarCodigo = async () => {
      const { data: nro, error: errNro } = await sb.rpc('next_correlativo', {
        p_clave: `MAT_${prefix}`,
        p_padding: 4,
      });
      if (errNro) throw new Error(errNro.message);
      return `${prefix}${nro}`;
    };
    if (autogenerado) cleaned.codigo = await generarCodigo();

    for (let intento = 0; ; intento++) {
      const { data: row, error } = await sb.from('materiales').insert(cleaned).select('id').single();
      if (!error) return { id: row!.id };
      if (error.code === '23505' && autogenerado && intento < 25) {
        cleaned.codigo = await generarCodigo();
        continue;
      }
      if (error.code === '23505') {
        throw new Error(`Código "${cleaned.codigo}" ya existe — déjalo vacío para autogenerar`);
      }
      throw new Error(error.message);
    }
  });
  if (r.ok) {
    await bumpPaths('/materiales');
    redirect('/materiales');
  }
  return r;
}

/**
 * Sugiere un factor de conversión para un par (unidad_compra, unidad_consumo)
 * basándose en el factor más usado por OTROS materiales con esa misma combinación.
 * Útil cuando la tabla unidades_medida no tiene factor_conversion definido.
 *
 * Retorna el factor más frecuente (moda) y cuántos materiales lo usan, para que
 * la UI pueda decir "120 materiales usan factor 50". Devuelve null si no hay match.
 */
export async function sugerirFactorConversion(
  unidadCompraId: string,
  unidadConsumoId: string,
): Promise<{ factor: number; coincidencias: number } | null> {
  if (!unidadCompraId || !unidadConsumoId) return null;
  if (unidadCompraId === unidadConsumoId) return { factor: 1, coincidencias: 0 };

  const { sb } = await requireUser();
  const { data, error } = await sb
    .from('materiales')
    .select('factor_conversion')
    .eq('unidad_compra_id', unidadCompraId)
    .eq('unidad_consumo_id', unidadConsumoId)
    .not('factor_conversion', 'is', null)
    .gt('factor_conversion', 0);
  if (error || !data || data.length === 0) return null;

  // Calcular moda (factor más frecuente)
  const conteo = new Map<number, number>();
  for (const row of data) {
    const f = Number(row.factor_conversion ?? 0);
    if (f <= 0) continue;
    conteo.set(f, (conteo.get(f) ?? 0) + 1);
  }
  if (conteo.size === 0) return null;
  let mejorFactor = 0;
  let mejorCount = 0;
  for (const [f, c] of conteo) {
    if (c > mejorCount) {
      mejorFactor = f;
      mejorCount = c;
    }
  }
  return { factor: mejorFactor, coincidencias: mejorCount };
}

export async function actualizarMaterial(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { error } = await sb.from('materiales').update(clean(data)).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/materiales', `/materiales/${id}`);
    redirect('/materiales');
  }
  return r;
}

export async function eliminarMaterial(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('materiales').delete().eq('id', id);
    if (!error) return { desactivado: false };

    // 23503 = viola foreign key: el material está referenciado (recetas,
    // kardex, compras, traslados…). Eliminarlo rompería ese historial, así
    // que lo DESACTIVAMOS en su lugar — desaparece de búsquedas y de nuevas
    // recetas — y se lo explicamos al usuario en claro, en vez de mostrar
    // el error crudo de Postgres (reporte del cliente 18/07/2026).
    const esFk = error.code === '23503' || /foreign key/i.test(error.message);
    if (!esFk) throw new Error(error.message);

    const { count } = await sb
      .from('recetas_lineas')
      .select('id', { count: 'exact', head: true })
      .eq('material_id', id);
    const { data: mat } = await sb.from('materiales').select('notas, activo').eq('id', id).single();
    const fecha = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const nota = `[Desactivado el ${fecha}: no se pudo eliminar porque está en uso${count ? ` en ${count} línea(s) de receta` : ''}]`;
    const { error: e2 } = await sb
      .from('materiales')
      .update({ activo: false, notas: mat?.notas ? `${mat.notas} | ${nota}` : nota })
      .eq('id', id);
    if (e2) throw new Error(e2.message);
    return { desactivado: true, enRecetas: count ?? 0 };
  });
  if (r.ok) {
    await bumpPaths('/materiales');
    const info = r.data as { desactivado: boolean; enRecetas?: number } | undefined;
    if (info?.desactivado) {
      // Sin redirect: el usuario se queda en la página y el toast le explica
      // qué pasó. El material ya no aparecerá en búsquedas ni recetas nuevas.
      return {
        ...r,
        message: `Este material está en uso${info.enRecetas ? ` en ${info.enRecetas} receta(s)` : ''}, por eso no se puede eliminar. Se DESACTIVÓ en su lugar. En la sección "Usado en recetas" (abajo en esta página) puede ver cuáles son y quitarlo de cada una para poder eliminarlo.`,
      };
    }
    redirect('/materiales');
  }
  return r;
}
