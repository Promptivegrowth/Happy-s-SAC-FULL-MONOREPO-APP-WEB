'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useActionForm } from './use-action-form';
import { SubmitButton } from './submit-button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { Button } from '@happy/ui/button';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { ImageUploader } from './image-uploader';
import { crearCampana, actualizarCampana } from '@/server/actions/campanas';

type Campana = {
  id?: string;
  codigo?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  slug?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  banner_url?: string | null;
  activa?: boolean | null;
  destacada_web?: boolean | null;
  orden_web?: number | null;
};

function slugificar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Qué va a hacer la web con estas fechas, dicho antes de guardar.
 *
 * Una campaña se muestra sola cuando hoy cae dentro del rango, así que las
 * fechas son el interruptor de verdad. Cargarlas a ciegas y descubrir recién
 * en la tienda que no aparece —o que apareció dos meses antes— es el error
 * natural; este renglón lo corta en el formulario.
 */
function queVaAPasar(inicio: string, fin: string, activa: boolean): { texto: string; tono: string } {
  if (!activa) return { texto: 'Apagada: no se muestra en la web, pase lo que pase con las fechas.', tono: 'text-slate-500' };
  if (!inicio || !fin) return { texto: 'Faltan las fechas: sin ellas no se muestra nunca.', tono: 'text-danger' };
  if (fin < inicio) return { texto: 'El fin es anterior al inicio: así no se mostraría nunca.', tono: 'text-danger' };
  const hoy = new Date().toISOString().slice(0, 10);
  const f = (d: string) => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}`; };
  if (hoy < inicio) return { texto: `Se va a encender sola el ${f(inicio)} y se apaga el ${f(fin)}.`, tono: 'text-sky-700' };
  if (hoy > fin) return { texto: `Terminó el ${f(fin)}: hoy no se muestra.`, tono: 'text-slate-500' };
  return { texto: `Se está mostrando ahora, hasta el ${f(fin)}.`, tono: 'text-emerald-700' };
}

export function CampanaForm({ initial }: { initial?: Campana }) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? actualizarCampana.bind(null, initial!.id!) : crearCampana;
  const { formAction, state } = useActionForm(
    action,
    isEdit ? 'Campaña actualizada' : 'Campaña creada',
    // Navega el cliente, no el servidor: un redirect() desde la action corta
    // el ciclo del formulario y el aviso de "creada" no llega a verse.
    isEdit ? undefined : { redirectTo: (r) => (r.data as { id?: string } | undefined)?.id ? `/campanias/${(r.data as { id: string }).id}` : '/campanias' },
  );

  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [slugTocado, setSlugTocado] = useState(isEdit);
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [inicio, setInicio] = useState(initial?.fecha_inicio ?? '');
  const [fin, setFin] = useState(initial?.fecha_fin ?? '');
  const [activa, setActiva] = useState(initial?.activa ?? true);
  const [destacada, setDestacada] = useState(initial?.destacada_web ?? false);
  const [banner, setBanner] = useState<string | null>(initial?.banner_url ?? null);

  function onNombre(v: string) {
    setNombre(v);
    if (!slugTocado) setSlug(slugificar(v));
  }

  const aviso = queVaAPasar(inicio, fin, activa);

  return (
    <form action={formAction} className="space-y-6">
      <FormSection
        title="La campaña"
        description="Es lo que se ve arriba en la página de temporada de la tienda web."
      >
        <FormGrid cols={2}>
          <FormRow label="Nombre" required error={state.fields?.nombre} hint="Sale como título grande en la web.">
            <Input
              name="nombre"
              value={nombre}
              onChange={(e) => onNombre(e.target.value)}
              required
              placeholder="Ej: Halloween 2026"
            />
          </FormRow>
          <FormRow label="Código" required error={state.fields?.codigo} hint="Interno, para reportes. Ej: HALLOWEEN-2026">
            <Input
              name="codigo"
              defaultValue={initial?.codigo ?? ''}
              required
              maxLength={40}
              placeholder="HALLOWEEN-2026"
              className="font-mono uppercase"
            />
          </FormRow>
          <FormRow
            label="Dirección web (slug)"
            error={state.fields?.slug}
            hint={slug ? `disfraceshappys.com.pe/campanias/${slug}` : 'Se arma solo del nombre.'}
          >
            <Input
              name="slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTocado(true); }}
              placeholder="halloween-2026"
            />
          </FormRow>
          <FormRow label="Orden" hint="Menor número = primero, cuando hay varias.">
            <Input name="orden_web" type="number" defaultValue={initial?.orden_web ?? 100} min={0} />
          </FormRow>
          <div className="sm:col-span-2">
            <FormRow label="Texto" error={state.fields?.descripcion} hint="El renglón que va debajo del título.">
              <Textarea
                name="descripcion"
                defaultValue={initial?.descripcion ?? ''}
                rows={2}
                placeholder="Los disfraces más terroríficos para pequeños y grandes."
              />
            </FormRow>
          </div>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Cuándo se muestra"
        description="La web la enciende y la apaga sola según estas fechas. No hay que acordarse de bajarla."
      >
        <FormGrid cols={2}>
          <FormRow label="Desde" required error={state.fields?.fecha_inicio}>
            <Input
              name="fecha_inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              required
            />
          </FormRow>
          <FormRow label="Hasta" required error={state.fields?.fecha_fin}>
            <Input
              name="fecha_fin"
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              required
            />
          </FormRow>
        </FormGrid>
        <p className={`mt-2 text-sm ${aviso.tono}`}>{aviso.texto}</p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <Switch name="activa" checked={activa} onCheckedChange={setActiva} />
            <span>
              <strong>Prendida.</strong>
              <span className="block text-xs text-slate-500">
                Apagala para bajarla de la web al instante sin perder las fechas cargadas.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch name="destacada_web" checked={destacada} onCheckedChange={setDestacada} />
            <span>
              <strong>Destacada.</strong>
              <span className="block text-xs text-slate-500">Para resaltarla por encima de otras campañas.</span>
            </span>
          </label>
        </div>
      </FormSection>

      <FormSection title="Banner" description="La imagen de fondo del encabezado. Si no ponés ninguna, va el degradado naranja.">
        <ImageUploader
          value={banner}
          onChange={setBanner}
          name="banner_url"
          prefix="campanas"
          label="Subir banner"
          aspect="video"
        />
      </FormSection>

      <div className="flex items-center gap-2">
        <SubmitButton>{isEdit ? 'Guardar cambios' : 'Crear campaña'}</SubmitButton>
        <Button asChild variant="ghost"><Link href="/campanias">Cancelar</Link></Button>
      </div>
    </form>
  );
}
