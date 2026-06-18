/**
 * Lectura pública de fichas técnicas vía token.
 * Usa service client porque la tabla productos_fichas_tecnicas tiene RLS
 * que solo permite SELECT a authenticated. El token UUID actúa como
 * autorización del cliente B2B.
 */

import { createServiceClient } from '@happy/db/service';

export type FichaPublicaData = {
  ficha: {
    revision: number;
    temporada: string | null;
    fecha_aprobacion: string | null;
    descripcion_larga: string | null;
    alcance_uso: string | null;
    tela_principal_nombre: string | null;
    tela_principal_composicion: string | null;
    tela_principal_color: string | null;
    tela_secundaria_nombre: string | null;
    tela_secundaria_composicion: string | null;
    tela_secundaria_color: string | null;
    puntadas_remalle: string | null;
    puntadas_recta: string | null;
    notas_acabados: string | null;
  };
  producto: { codigo: string; nombre: string };
  empresa: { razon_social: string; nombre_comercial: string | null; ruc: string; telefono: string | null; email: string | null; logo_url: string | null } | null;
  medidas: { codigo: string; descripcion: string; tolerancia_cm: number; valores: { talla: string; valor: number | null }[] }[];
  imagenes: { tipo: string; url: string; leyenda: string | null }[];
  expirado: boolean;
  revocado: boolean;
};

export async function obtenerFichaPublica(token: string): Promise<FichaPublicaData | { error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceClient() as any;

  const { data: link } = await sb
    .from('fichas_links_publicos')
    .select('id, ficha_id, expira_en, activo')
    .eq('token', token)
    .maybeSingle();
  if (!link) return { error: 'Link no encontrado.' };
  if (!link.activo) return { error: 'Este link fue revocado.' };
  if (link.expira_en && new Date(link.expira_en) < new Date()) {
    return { error: 'Este link expiró.' };
  }

  // Registrar la vista (best-effort, sin bloquear)
  void sb
    .from('fichas_links_publicos')
    .update({
      vistas: ((typeof link.vistas === 'number' ? link.vistas : 0) ?? 0) + 1,
      ultima_vista_en: new Date().toISOString(),
    })
    .eq('id', link.id)
    .then(() => undefined);

  const { data: ficha } = await sb
    .from('productos_fichas_tecnicas')
    .select('*')
    .eq('id', link.ficha_id)
    .single();
  if (!ficha) return { error: 'Ficha no encontrada.' };

  const [{ data: producto }, { data: medidasRaw }, { data: imagenes }, { data: empresa }] = await Promise.all([
    sb.from('productos').select('codigo, nombre').eq('id', ficha.producto_id).single(),
    sb.from('fichas_medidas').select('*, fichas_medidas_valores(talla, valor)').eq('ficha_id', ficha.id).order('orden'),
    sb.from('fichas_imagenes').select('tipo, url, leyenda').eq('ficha_id', ficha.id).order('orden'),
    sb.from('empresa').select('razon_social, nombre_comercial, ruc, telefono, email, logo_url').single(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const medidas = ((medidasRaw ?? []) as any[]).map((m) => ({
    codigo: m.codigo,
    descripcion: m.descripcion,
    tolerancia_cm: Number(m.tolerancia_cm ?? 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    valores: ((m.fichas_medidas_valores ?? []) as { talla: string; valor: any }[]).map((v) => ({
      talla: v.talla,
      valor: v.valor !== null ? Number(v.valor) : null,
    })),
  }));

  return {
    expirado: false,
    revocado: false,
    ficha: ficha as FichaPublicaData['ficha'],
    producto: producto as { codigo: string; nombre: string },
    empresa: (empresa ?? null) as FichaPublicaData['empresa'],
    medidas,
    imagenes: (imagenes ?? []) as { tipo: string; url: string; leyenda: string | null }[],
  };
}
