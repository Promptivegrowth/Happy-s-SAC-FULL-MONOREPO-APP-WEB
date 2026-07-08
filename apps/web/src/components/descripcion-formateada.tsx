/**
 * Renderiza la descripción larga del producto con formato agradable.
 *
 * Cliente reportó (post-2026-07-08): el texto largo se veía como un solo
 * párrafo continuo, sin jerarquía visual. Los admins escriben texto plano
 * en el ERP (no HTML), así que hay que:
 *   1. Auto-detectar si viene HTML crudo (contiene tags como <p>, <br>)
 *      → renderizar tal cual.
 *   2. Si es texto plano → parsearlo:
 *      · Doble salto de línea → párrafo nuevo
 *      · Salto simple → <br>
 *      · Detectar secciones tipo "MATERIALES:", "INSTRUCCIONES:", "TALLAS:"
 *        (palabra + ":") → convertir en título de bloque destacado.
 *      · Detectar "¡Advertencia!" / "IMPORTANTE" / etc → highlight.
 *
 * Sin dependencias externas (marked, dompurify) — parseo manual y estilos
 * inline con tailwind.
 */

import { AlertTriangle, Info } from 'lucide-react';

type Bloque =
  | { kind: 'titulo'; texto: string; contenido: string[] }
  | { kind: 'alerta'; texto: string }
  | { kind: 'parrafo'; texto: string };

// Detecta un "encabezado inline" como "MATERIALES: chaqueta..." →
// devuelve el título y el resto.
const RE_TITULO_INLINE = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s/&\-()]{2,30}):\s*(.*)$/;

// Palabras clave que suben el bloque a "alerta" con icono
const KWS_ALERTA = ['¡ADVERTENCIA!', 'ADVERTENCIA', '¡IMPORTANTE!', 'IMPORTANTE', 'CUIDADO', 'ATENCIÓN'];

function tieneHtml(s: string): boolean {
  return /<\/?(p|br|strong|em|b|i|ul|ol|li|h[1-6]|div|span)\b/i.test(s);
}

function parsear(texto: string): Bloque[] {
  // Split por doble salto de línea (o más). Cada bloque es un párrafo lógico.
  const parrafos = texto
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bloques: Bloque[] = [];
  for (const p of parrafos) {
    // Alerta si el primer token es palabra clave
    const primeraPalabra = p.split(/[\s:]/)[0]?.toUpperCase() ?? '';
    if (KWS_ALERTA.includes(primeraPalabra)) {
      bloques.push({ kind: 'alerta', texto: p });
      continue;
    }

    // Si tiene "TITULO:" al principio, tratarlo como bloque titulado.
    const m = p.match(RE_TITULO_INLINE);
    if (m) {
      const resto = m[2]?.trim() ?? '';
      // Si viene lista tipo "MATERIALES: chaqueta y pantalón" (frase corta),
      // sigue siendo un solo bullet. Si hay múltiples items separados por
      // comas, los mostramos como lista.
      const contenido = resto
        ? resto.split(/[.]\s+/).map((s) => s.trim()).filter(Boolean)
        : [];
      bloques.push({ kind: 'titulo', texto: m[1]!.trim(), contenido });
      continue;
    }

    bloques.push({ kind: 'parrafo', texto: p });
  }
  return bloques;
}

export function DescripcionFormateada({ texto }: { texto: string }) {
  // Si el ERP ya guardó HTML, respetarlo (evitamos doble-render)
  if (tieneHtml(texto)) {
    return (
      <div
        className="prose prose-slate prose-sm max-w-none prose-headings:font-display prose-headings:text-corp-900 prose-p:leading-relaxed prose-strong:text-corp-900"
        dangerouslySetInnerHTML={{ __html: texto }}
      />
    );
  }

  const bloques = parsear(texto);

  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-700">
      {bloques.map((b, i) => {
        if (b.kind === 'alerta') {
          return (
            <div
              key={i}
              className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="leading-relaxed">{b.texto.replace(/^[¡]?[A-ZÁÉÍÓÚÑ]+!?\s*[:—-]?\s*/, '')}</p>
            </div>
          );
        }
        if (b.kind === 'titulo') {
          return (
            <div key={i} className="rounded-lg border border-corp-100 bg-corp-50/40 p-4">
              <h3 className="mb-1.5 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-corp-900">
                <Info className="h-4 w-4 text-corp-600" />
                {b.texto}
              </h3>
              {b.contenido.length === 1 ? (
                <p className="text-[14px] text-slate-700">{b.contenido[0]}</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-[14px] text-slate-700 marker:text-corp-400">
                  {b.contenido.map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        }
        // Párrafo simple — respetar saltos de línea simples con <br>
        const lineas = b.texto.split('\n');
        return (
          <p key={i} className="text-[15px] leading-relaxed text-slate-700">
            {lineas.map((linea, j) => (
              <span key={j}>
                {linea}
                {j < lineas.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
