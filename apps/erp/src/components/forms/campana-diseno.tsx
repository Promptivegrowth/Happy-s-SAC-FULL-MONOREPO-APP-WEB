'use client';

/**
 * El diseño de la campaña, con vista previa en vivo.
 *
 * Javier cambia la sección de temporada casi todos los meses y pidió poder
 * cambiarlo TODO él mismo: el fondo, los textos y la pestaña del menú
 * (24/09/2026). Hasta entonces solo se podía cambiar el título y el texto; el
 * resto estaba fijo en el código y salía igual en Halloween que en Navidad.
 *
 * La vista previa usa la misma función que usa la tienda web para pintar
 * (`resolverEstilo`, en la librería compartida), así que lo que se ve acá es lo
 * que se va a ver allá. Todo viaja al servidor en un solo campo oculto, `estilo`.
 */

import { useMemo, useState } from 'react';
import { Input } from '@happy/ui/input';
import { Switch } from '@happy/ui/switch';
import { Button } from '@happy/ui/button';
import { FormSection } from '@happy/ui/form-row';
import { Sparkles, Calendar, RotateCcw } from 'lucide-react';
import {
  resolverEstilo, fondoCss, TEMAS, ESTILO_BASE,
  type EstiloCampana, type ModoTexto, type ModoImagen,
} from '@happy/lib/web/campana-estilo';
import { ImageUploader } from './image-uploader';

function fechaCorta(d: string) {
  if (!d) return '';
  const [a, m, dia] = d.split('-');
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  return a && m && dia ? `${Number(dia)} de ${meses[Number(m) - 1]}` : '';
}

/** Saca las claves vacías de verdad (undefined) antes de guardar. */
function limpio(e: EstiloCampana): EstiloCampana {
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as EstiloCampana;
}

function Opciones<T extends string>({ valor, opciones, onChange }: {
  valor: T;
  opciones: Array<{ v: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-slate-50 p-1">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            valor === o.v ? 'bg-white text-corp-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Color({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="color"
        value={valor}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-12 cursor-pointer rounded border bg-white p-0.5"
      />
      <span>
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="font-mono text-xs">{valor}</span>
      </span>
    </label>
  );
}

export function CampanaDiseno({
  nombre, descripcion, inicio, fin, banner, onBanner, inicial,
}: {
  nombre: string;
  descripcion: string;
  inicio: string;
  fin: string;
  banner: string | null;
  onBanner: (url: string | null) => void;
  inicial?: EstiloCampana | null;
}) {
  const [estilo, setEstilo] = useState<EstiloCampana>(inicial ?? {});
  const r = useMemo(() => resolverEstilo(estilo, nombre || 'Nombre de la campaña'), [estilo, nombre]);
  const set = (cambios: Partial<EstiloCampana>) => setEstilo((prev) => ({ ...prev, ...cambios }));

  const colorLetra = r.textoOscuro ? '#1E1B4B' : '#FFFFFF';
  const pastilla = r.textoOscuro ? 'bg-black/10' : 'bg-white/20';

  return (
    <FormSection
      title="Diseño"
      description="Cómo se ve la campaña en la tienda: el fondo, los textos y la pestaña del menú. Lo que ves abajo es exactamente lo que se va a ver en la web."
    >
      <input type="hidden" name="estilo" value={JSON.stringify(limpio(estilo))} />

      {/* ---------------- Vista previa ---------------- */}
      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: '#2D3193' }}>
          <span className="px-2 opacity-80">Home</span>
          <span className="px-2 opacity-80">Disfraces de niño</span>
          <span className="px-2 opacity-80">Accesorios</span>
          <span className="inline-flex items-center px-2" style={{ color: r.menuColor }}>
            {r.menuTexto}
            {r.menuEtiqueta && (
              <span className="ml-1 rounded-full px-1 text-[8px] leading-4 text-white" style={{ backgroundColor: r.menuEtiquetaColor }}>
                {r.menuEtiqueta}
              </span>
            )}
          </span>
          <span className="px-2 opacity-80">Contacto</span>
        </div>

        <div className="relative overflow-hidden" style={{ background: fondoCss(r), color: colorLetra }}>
          {banner && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={banner} alt="" className={`absolute inset-0 h-full w-full object-cover ${r.imagenModo === 'suave' ? 'opacity-30' : ''}`} />
              {r.imagenModo === 'fondo' && (
                <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${r.colorInicio}E6 0%, ${r.colorInicio}99 40%, transparent 75%)` }} />
              )}
            </>
          )}
          <div className="relative px-5 py-8 sm:px-8 sm:py-10">
            {r.etiqueta && (
              <span className={`mb-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pastilla}`}>
                <Sparkles className="h-3 w-3" /> {r.etiqueta}
              </span>
            )}
            <p className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{nombre || 'Nombre de la campaña'}</p>
            {descripcion && <p className="mt-2 max-w-md text-sm opacity-90">{descripcion}</p>}
            {r.mostrarFechas && inicio && fin && (
              <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] ${pastilla}`}>
                <Calendar className="h-3 w-3" /> Del {fechaCorta(inicio)} al {fechaCorta(fin)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Temas ---------------- */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-medium">Temas rápidos</p>
        <div className="flex flex-wrap gap-2">
          {TEMAS.map((t) => (
            <button
              key={t.nombre}
              type="button"
              onClick={() => set({ color_medio: undefined, ...t.estilo })}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:border-slate-400"
            >
              <span
                className="h-4 w-8 rounded"
                style={{ background: fondoCss(resolverEstilo(t.estilo, t.nombre)) }}
              />
              {t.nombre}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Un clic y quedan los colores de esa temporada. Después puedes cambiar cualquiera.</p>
      </div>

      {/* ---------------- Fondo ---------------- */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Colores del fondo</p>
          <div className="flex flex-wrap items-center gap-4">
            <Color label="Inicio" valor={r.colorInicio} onChange={(v) => set({ color_inicio: v, color_fin: r.colorFin, color_medio: r.colorMedio ?? undefined })} />
            {r.colorMedio && (
              <Color label="Medio" valor={r.colorMedio} onChange={(v) => set({ color_medio: v })} />
            )}
            <Color label="Fin" valor={r.colorFin} onChange={(v) => set({ color_fin: v, color_inicio: r.colorInicio, color_medio: r.colorMedio ?? undefined })} />
          </div>
          <button
            type="button"
            onClick={() => set(r.colorMedio
              ? { color_medio: undefined, color_inicio: r.colorInicio, color_fin: r.colorFin }
              : { color_medio: ESTILO_BASE.color_medio, color_inicio: r.colorInicio, color_fin: r.colorFin })}
            className="mt-2 text-xs text-sky-700 underline"
          >
            {r.colorMedio ? 'Quitar el color del medio' : 'Agregar un color en el medio'}
          </button>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Color de la letra</p>
          <Opciones<ModoTexto>
            valor={estilo.color_texto ?? 'auto'}
            onChange={(v) => set({ color_texto: v })}
            opciones={[{ v: 'auto', label: 'Automático' }, { v: 'claro', label: 'Blanca' }, { v: 'oscuro', label: 'Oscura' }]}
          />
          <p className="mt-1 text-xs text-slate-500">En automático se oscurece sola sobre fondos claros, donde la blanca no se lee.</p>
        </div>
      </div>

      {/* ---------------- Textos ---------------- */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Etiqueta de arriba</span>
          <Input
            value={estilo.etiqueta ?? ESTILO_BASE.etiqueta}
            onChange={(e) => set({ etiqueta: e.target.value })}
            maxLength={40}
            placeholder="Ej: Campaña activa, ¡Nuevo!, Últimos días"
          />
          <span className="mt-1 block text-xs text-slate-500">Déjala vacía para no mostrar etiqueta.</span>
        </label>
        <div className="text-sm">
          <span className="mb-1 block font-medium">Fechas</span>
          <label className="flex items-center gap-3">
            <Switch checked={estilo.mostrar_fechas ?? true} onCheckedChange={(v) => set({ mostrar_fechas: v })} />
            <span>Mostrar &quot;Del … al …&quot; debajo del texto</span>
          </label>
        </div>
      </div>

      {/* ---------------- Imagen ---------------- */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Imagen de fondo (opcional)</p>
          <ImageUploader value={banner} onChange={onBanner} name="banner_url" prefix="campanas" label="Subir imagen" aspect="video" />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Cómo se ve la imagen</p>
          <Opciones<ModoImagen>
            valor={estilo.imagen_modo ?? 'fondo'}
            onChange={(v) => set({ imagen_modo: v })}
            opciones={[{ v: 'fondo', label: 'Foto a pleno' }, { v: 'suave', label: 'Foto suave' }]}
          />
          <p className="mt-1 text-xs text-slate-500">
            A pleno, la foto se ve completa con el color del fondo detrás del texto para que se lea.
            Suave, la foto queda tenue bajo los colores.
          </p>
        </div>
      </div>

      {/* ---------------- Pestaña del menú ---------------- */}
      <div className="mt-5 rounded-lg border bg-slate-50/60 p-4">
        <p className="mb-3 text-sm font-medium">La pestaña del menú</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Texto de la pestaña</span>
            <Input
              value={estilo.menu_texto ?? ''}
              onChange={(e) => set({ menu_texto: e.target.value })}
              maxLength={30}
              placeholder={nombre || 'Si lo dejas vacío, va el nombre de la campaña'}
            />
          </label>
          <Color label="Color del texto" valor={r.menuColor} onChange={(v) => set({ menu_color: v })} />
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Pastilla al lado (vacía = sin pastilla)</span>
            <Input
              value={estilo.menu_etiqueta ?? ESTILO_BASE.menu_etiqueta}
              onChange={(e) => set({ menu_etiqueta: e.target.value })}
              maxLength={12}
              placeholder="Ej: HOT, NUEVO, 🎃"
            />
          </label>
          <Color label="Color de la pastilla" valor={r.menuEtiquetaColor} onChange={(v) => set({ menu_etiqueta_color: v })} />
        </div>
      </div>

      <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setEstilo({})}>
        <RotateCcw className="h-4 w-4" /> Volver al diseño de siempre
      </Button>
    </FormSection>
  );
}
