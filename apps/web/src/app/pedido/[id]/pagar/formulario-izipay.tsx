'use client';

/**
 * Formulario de tarjeta de izipay.
 *
 * Los campos de la tarjeta son iframes de izipay: el número no pasa por este
 * código ni por nuestro servidor en ningún momento. Nosotros solo le decimos a
 * izipay "cobra este formToken" y recibimos el resultado firmado.
 *
 * El resultado se manda a /api/pagos/izipay/confirmar para que el servidor
 * verifique la firma. NO se confía en `orderStatus` acá: el navegador del
 * comprador puede decir lo que quiera.
 *
 * ── Por qué esto es una PÁGINA y no una ventana sobre el checkout ──
 *
 * Krypton (la librería de izipay) se inicializa una sola vez por carga de
 * página. Se probó con un modal y falla de dos maneras: si se desmonta, no
 * vuelve a montarse nunca —queda un recuadro vacío—, y si solo se oculta,
 * izipay da el pago por "Abortado" y el formulario que queda detrás ya no
 * sirve. Las dos dejaban al comprador sin poder reintentar.
 *
 * Con una página propia cada intento es una carga nueva y siempre arranca
 * limpio. Además le queda un enlace al que volver: el pedido ya existe y sigue
 * esperando el pago.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Lock, ArrowLeft } from 'lucide-react';
import { useCart } from '@/store/cart';

// Librería del formulario incrustado (Krypton V4) y su tema "clásico".
const JS_KRYPTON =
  'https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js';
const CSS_KRYPTON =
  'https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic-reset.css';
const JS_TEMA =
  'https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.js';

const CONTENEDOR = 'izipay-formulario';

/* eslint-disable @typescript-eslint/no-explicit-any */
type KryptonEvent = {
  rawClientAnswer: string;
  hash: string;
  hashKey: string;
};
declare global {
  interface Window {
    KR?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function cargarCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function cargarScript(src: string, atributos: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const yaEsta = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (yaEsta) {
      if (yaEsta.dataset.listo === '1') return resolve();
      yaEsta.addEventListener('load', () => resolve());
      yaEsta.addEventListener('error', () => reject(new Error(`No cargó ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    for (const [k, v] of Object.entries(atributos)) s.setAttribute(k, v);
    s.addEventListener('load', () => {
      s.dataset.listo = '1';
      resolve();
    });
    s.addEventListener('error', () => reject(new Error(`No cargó ${src}`)));
    document.head.appendChild(s);
  });
}

/**
 * Ejecuta un paso de Krypton sin que un fallo corte la secuencia.
 *
 * Krypton rechaza con `undefined` en pasos que a veces sobran: volver a
 * enganchar un formulario ya enganchado, o mostrar uno que ya se está viendo.
 * Tratar eso como error dejaba al comprador con un cartel rojo delante de un
 * formulario que funcionaba perfectamente. Lo que decide si hubo un problema
 * de verdad es si los campos llegaron a dibujarse (`esperarFormulario`).
 */
async function paso<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/**
 * Espera a que los campos de tarjeta estén realmente en pantalla.
 *
 * El margen es generoso a propósito: la primera vez que alguien entra, el
 * navegador se baja una decena de archivos de izipay más el analizador de
 * riesgo. Con 20 segundos, un comprador nuevo en una conexión lenta veía
 * "no llegó a cargar" mientras el formulario estaba por aparecer.
 */
function esperarFormulario(listo: () => boolean, limiteMs = 45000): Promise<boolean> {
  const hasta = Date.now() + limiteMs;
  return new Promise((resolve) => {
    const mirar = () => {
      if (listo() || document.querySelector(`#${CONTENEDOR} iframe`)) return resolve(true);
      if (Date.now() > hasta) return resolve(false);
      setTimeout(mirar, 250);
    };
    mirar();
  });
}

/** Saca un texto legible de cualquier cosa con la que algo haya fallado. */
function describirFallo(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const texto = o.detailedErrorMessage ?? o.errorMessage ?? o.message;
    if (typeof texto === 'string' && texto) return texto;
  }
  return 'No pudimos abrir el pago con tarjeta. Intenta de nuevo.';
}

export function FormularioIzipay({
  pedidoId,
  numero,
  total,
}: {
  pedidoId: string;
  numero: string;
  total: number;
}) {
  const router = useRouter();
  const vaciarCarrito = useCart((s) => s.clear);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'procesando' | 'error'>('cargando');
  const [error, setError] = useState('');

  // React monta dos veces en desarrollo (StrictMode). Sin esta guarda se
  // pedirían dos formTokens y el formulario se dibujaría duplicado.
  const yaArranco = useRef(false);
  /*
   * Punto de anclaje del formulario de izipay.
   *
   * React renderiza este div VACÍO y no vuelve a tocarlo nunca. El nodo donde
   * monta Krypton se crea a mano y se cuelga acá dentro.
   *
   * Es a propósito: Krypton no dibuja dentro del elemento, lo REEMPLAZA (le
   * pone `is="krypton-card-form"` y monta su propio componente encima). Si ese
   * elemento lo hubiera renderizado React, el siguiente re-render se encuentra
   * con un nodo que ya no es suyo y toda la página se cae con "Application
   * error: a client-side exception has occurred".
   */
  const anclaRef = useRef<HTMLDivElement | null>(null);
  const formularioListo = useRef(false);

  const confirmar = useCallback(
    async (ev: KryptonEvent) => {
      setEstado('procesando');
      try {
        const res = await fetch('/api/pagos/izipay/confirmar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            // El texto CRUDO: volver a serializarlo invalidaría la firma.
            respuesta: ev.rawClientAnswer,
            firma: ev.hash,
            claveUsada: ev.hashKey,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'No pudimos confirmar el pago');
        if (!json.pagado) throw new Error(json.mensaje ?? 'El pago no se completó');
        // Recién con el pago confirmado se vacía el carrito: si el cobro no
        // salía, el comprador conserva lo que había elegido.
        vaciarCarrito();
        router.push(`/pedido/${pedidoId}`);
      } catch (e) {
        setError(describirFallo(e));
        setEstado('error');
      }
    },
    [pedidoId, router, vaciarCarrito],
  );

  useEffect(() => {
    if (yaArranco.current) return;
    yaArranco.current = true;
    let vivo = true;
    let anfitrion: HTMLDivElement | null = null;

    (async () => {
      try {
        const res = await fetch('/api/pagos/izipay/form-token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pedidoId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'No pudimos preparar el pago');
        if (!vivo) return;

        cargarCss(CSS_KRYPTON);
        await cargarScript(JS_KRYPTON, {
          'kr-public-key': json.publicKey,
          'kr-language': 'es-PE',
        });
        await cargarScript(JS_TEMA);
        if (!vivo) return;

        const KR = window.KR;
        if (!KR) throw new Error('No se pudo cargar el formulario de izipay');

        /*
         * El nodo de Krypton se crea DESPUÉS de cargar la librería, y va fuera
         * del alcance de React (ver `anclaRef`).
         *
         * Krypton avisa por consola que lo suyo es tener el elemento antes de
         * que arranque. Probado: al arrancar marca el div como ya procesado y
         * después `attachForm` no dibuja nada — queda el recuadro con las
         * clases puestas y sin un solo campo. Creándolo después funciona, y el
         * aviso de consola es solo eso, un aviso.
         */
        const ancla = anclaRef.current;
        if (!ancla) throw new Error('No se pudo preparar el formulario');
        ancla.innerHTML = '';
        anfitrion = document.createElement('div');
        anfitrion.id = CONTENEDOR;
        anfitrion.className = 'kr-embedded';
        ancla.appendChild(anfitrion);

        KR.onError((e: { errorMessage?: string; detailedErrorMessage?: string }) => {
          // Errores del propio formulario: tarjeta inválida, rechazo del
          // banco. No sacan al comprador de la página, puede reintentar.
          setError(e.detailedErrorMessage || e.errorMessage || 'Ocurrió un problema con el pago');
        });
        KR.onSubmit(async (ev: KryptonEvent) => {
          await confirmar(ev);
          return false; // nos encargamos nosotros; sin esto izipay redirige
        });
        KR.onFormReady(() => {
          formularioListo.current = true;
        });

        // Los pasos que sobren fallan sin ruido: lo que importa es si los
        // campos aparecen (ver `paso`).
        await paso(() => KR.setFormConfig({ formToken: json.formToken, 'kr-language': 'es-PE' }));
        const enganche = (await paso(() => KR.attachForm(`#${CONTENEDOR}`))) as
          | { result?: { formId?: string } }
          | undefined;
        if (enganche?.result?.formId) {
          await paso(() => KR.showForm(enganche.result?.formId));
        }

        const seVe = await esperarFormulario(() => formularioListo.current);
        if (!vivo) return;
        if (!seVe) {
          throw new Error(
            'El formulario de pago no llegó a cargar. Revisa tu conexión e intenta de nuevo.',
          );
        }
        setEstado('listo');
      } catch (e) {
        if (!vivo) return;
        // Krypton a veces rechaza con un objeto suelto, no con un Error: sin
        // esto el fallo aparecía como "undefined" y no había por dónde empezar.
        setError(describirFallo(e));
        setEstado('error');
      }
    })();

    return () => {
      vivo = false;
      try {
        window.KR?.removeForms();
      } catch {
        /* si la librería no llegó a cargar, no hay nada que limpiar */
      }
      // El nodo lo creamos nosotros, así que lo sacamos nosotros: React no
      // sabe que existe y no lo va a limpiar.
      anfitrion?.remove();
    };
  }, [pedidoId, confirmar]);

  return (
    <div className="container max-w-md px-4 py-10">
      <Link
        href={`/pedido/${pedidoId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al pedido
      </Link>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-slate-500">Pedido {numero}</p>
        <h1 className="font-display text-2xl font-semibold">Pago con tarjeta</h1>
        <p className="mt-1 text-sm text-slate-600">
          Total a pagar: <strong className="text-happy-600">S/ {total.toFixed(2)}</strong>
        </p>

        <div className="mt-5">
          {estado === 'cargando' && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparando el pago seguro…
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          )}

          {/* Acá va el formulario de izipay. Este div queda VACÍO en el JSX:
              el motivo está en `anclaRef`. */}
          <div ref={anclaRef} />

          {estado === 'procesando' && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Confirmando tu pago…
            </div>
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <Lock className="h-3 w-3" /> Pago procesado por izipay. No guardamos los datos de tu
          tarjeta.
        </p>
      </div>
    </div>
  );
}
