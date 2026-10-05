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
 * El armado sigue el ejemplo oficial de izipay para React:
 *   https://github.com/izipay-pe/Embedded-PaymentForm-React
 * Hay dos detalles suyos que no se pueden cambiar sin romperlo todo:
 *
 *   1. La librería se carga con `@lyracom/embedded-form-glue`, el paquete de
 *      ellos. Cargar el script a mano parece equivalente y no lo es.
 *   2. `attachForm` recibe el div que CONTIENE al `.kr-embedded`, no el
 *      `.kr-embedded` mismo. Apuntándole al de adentro, izipay lo marca como
 *      suyo, le vacía el contenido y no dibuja un solo campo: queda un
 *      recuadro en blanco, sin ningún error, para siempre.
 *
 * ── Por qué esto es una PÁGINA y no una ventana sobre el checkout ──
 *
 * Krypton se inicializa una sola vez por carga de página. Se probó con un
 * modal y falla de dos maneras: si se desmonta, no vuelve a montarse nunca, y
 * si solo se oculta, izipay da el pago por "Abortado" y el formulario que
 * queda detrás ya no sirve. Las dos dejaban al comprador sin poder reintentar.
 * Con una página propia cada intento es una carga nueva y arranca limpio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import KRGlue from '@lyracom/embedded-form-glue';
import { Loader2, Lock, ArrowLeft } from 'lucide-react';
import { useCart } from '@/store/cart';

/** Dominio desde el que izipay sirve su librería y su tema. */
const ENDPOINT_IZIPAY = 'https://static.micuentaweb.pe';
const CSS_TEMA = `${ENDPOINT_IZIPAY}/static/js/krypton-client/V4.0/ext/classic-reset.css`;
const JS_TEMA = `${ENDPOINT_IZIPAY}/static/js/krypton-client/V4.0/ext/classic.js`;

/** El div que envuelve al formulario. Es el que recibe `attachForm`. */
const ENVOLTORIO = 'izipay-envoltorio';

type RespuestaKrypton = {
  rawClientAnswer: string;
  hash: string;
  hashKey: string;
};

function cargarCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function cargarScript(src: string): Promise<void> {
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
    s.addEventListener('load', () => {
      s.dataset.listo = '1';
      resolve();
    });
    s.addEventListener('error', () => reject(new Error(`No cargó ${src}`)));
    document.head.appendChild(s);
  });
}

/**
 * A los cuántos segundos se avisa que está tardando, y a los cuántos se da por
 * perdido.
 *
 * La primera vez que alguien entra, el navegador se baja una decena de
 * archivos de izipay más su analizador de riesgo. Decirle "no cargó, revisa tu
 * conexión" cuando el formulario estaba por aparecer lo manda a cerrar la
 * página con la compra a medias.
 */
const AVISAR_LENTO_MS = 20000;
const RENDIRSE_MS = 90000;

/**
 * Cuánto se espera la confirmación después de pagar antes de llevar igual al
 * comprador a su pedido. Allá el estado sale de la base, y el aviso de izipay
 * al servidor lo confirma aunque esta respuesta no llegue.
 */
const CONFIRMAR_MAX_MS = 20000;

/**
 * Lleva al pedido con una carga COMPLETA de la página.
 *
 * Con la navegación interna de Next (`router.push`) el comprador se quedaba en
 * "Confirmando tu pago…" para siempre, con el cobro hecho y el pedido ya en el
 * ERP (primer pago real, 05/10/2026): la librería de izipay sigue viva en la
 * página y la navegación no termina. Es el mismo motivo por el que el botón de
 * reintento del pedido es un <a> y no un <Link>.
 */
function irAlPedido(pedidoId: string, pagado: boolean) {
  window.location.assign(`/pedido/${pedidoId}${pagado ? '?pagado=1' : ''}`);
}

/** Espera a que los campos de tarjeta estén realmente en pantalla. */
function esperarFormulario(avisarLento: () => void): Promise<boolean> {
  const desde = Date.now();
  let avisado = false;
  return new Promise((resolve) => {
    const mirar = () => {
      if (document.querySelector(`#${ENVOLTORIO} iframe`)) return resolve(true);
      const pasado = Date.now() - desde;
      if (!avisado && pasado > AVISAR_LENTO_MS) {
        avisado = true;
        avisarLento();
      }
      if (pasado > RENDIRSE_MS) return resolve(false);
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
  const vaciarCarrito = useCart((s) => s.clear);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'procesando' | 'error'>('cargando');
  const [error, setError] = useState('');
  const [tardando, setTardando] = useState(false);

  // React monta dos veces en desarrollo (StrictMode). Sin esta guarda se
  // pedirían dos formTokens y el formulario se dibujaría duplicado.
  const yaArranco = useRef(false);
  /*
   * El envoltorio lo renderiza React; el `.kr-embedded` de adentro NO.
   *
   * Izipay no dibuja dentro de ese elemento: lo REEMPLAZA, le pone
   * `is="krypton-card-form"` y monta su propio componente encima. Si lo
   * hubiera renderizado React, el siguiente repintado se encuentra con un nodo
   * que ya no es suyo y toda la página se cae con "Application error". Creado
   * a mano, React ni se entera de que existe.
   */
  const envoltorioRef = useRef<HTMLDivElement | null>(null);

  const confirmar = useCallback(
    async (ev: RespuestaKrypton) => {
      setEstado('procesando');
      setError('');
      const corte = new AbortController();
      const reloj = setTimeout(() => corte.abort(), CONFIRMAR_MAX_MS);
      let json: { pagado?: boolean; mensaje?: string; error?: string } = {};
      let ok = false;
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
          signal: corte.signal,
        });
        ok = res.ok;
        json = await res.json().catch(() => ({}));
      } catch {
        // Sin respuesta (se cortó la red o tardó demasiado): el cobro pudo
        // salir igual. Se sigue al pedido, que muestra lo que realmente pasó.
        clearTimeout(reloj);
        irAlPedido(pedidoId, false);
        return;
      }
      clearTimeout(reloj);

      if (ok && json.pagado) {
        // Recién con el pago confirmado se vacía el carrito: si el cobro no
        // salía, el comprador conserva lo que había elegido.
        vaciarCarrito();
        irAlPedido(pedidoId, true);
        return;
      }
      if (ok) {
        // El banco lo rechazó: se queda acá para reintentar con otra tarjeta.
        setError(json.mensaje ?? 'El pago no se completó');
        setEstado('error');
        return;
      }
      // El servidor no pudo confirmarlo (firma, base caída…): el estado real
      // lo tiene el pedido, y el aviso de izipay al servidor llega igual.
      irAlPedido(pedidoId, false);
    },
    [pedidoId, vaciarCarrito],
  );

  /*
   * `confirmar` se guarda en una referencia y el efecto NO depende de ella.
   *
   * Si el efecto dependiera de la función, cada repintado que le cambiara la
   * identidad lo volvería a ejecutar: primero corre la limpieza —que le pide a
   * izipay que quite el formulario— y después el cuerpo, que no rearma nada
   * porque ya arrancó una vez. El formulario se dibujaba y desaparecía.
   */
  const confirmarRef = useRef<(ev: RespuestaKrypton) => Promise<void>>(async () => {});
  confirmarRef.current = confirmar;

  useEffect(() => {
    if (yaArranco.current) return;
    yaArranco.current = true;
    let vivo = true;

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

        // El tema es lo que le da forma a los campos; sin él no se dibujan.
        cargarCss(CSS_TEMA);
        await cargarScript(JS_TEMA);
        if (!vivo) return;

        const { KR } = await KRGlue.loadLibrary(ENDPOINT_IZIPAY, json.publicKey);
        if (!vivo) return;

        // El hueco donde izipay va a montar (ver `envoltorioRef`).
        const envoltorio = envoltorioRef.current;
        if (!envoltorio) throw new Error('No se pudo preparar el formulario');
        envoltorio.innerHTML = '';
        const hueco = document.createElement('div');
        hueco.className = 'kr-embedded';
        envoltorio.appendChild(hueco);

        KR.onError((e: { errorMessage?: string; detailedErrorMessage?: string }) => {
          // Errores del propio formulario: tarjeta inválida, rechazo del
          // banco. No sacan al comprador de la página, puede reintentar.
          setError(e.detailedErrorMessage || e.errorMessage || 'Ocurrió un problema con el pago');
        });
        KR.onSubmit((ev: RespuestaKrypton) => {
          // Como en el ejemplo oficial: se lanza y se devuelve `false` en el
          // acto (una promesa no es `false`). Sin esto izipay redirige.
          void confirmarRef.current(ev);
          return false;
        });

        await KR.setFormConfig({ formToken: json.formToken, 'kr-language': 'es-PE' });
        // OJO: el envoltorio, no el `.kr-embedded` de adentro. Ver la nota de
        // arriba del archivo.
        const { result } = await KR.attachForm(`#${ENVOLTORIO}`);
        await KR.showForm(result.formId);

        const seVe = await esperarFormulario(() => {
          if (vivo) setTardando(true);
        });
        if (!vivo) return;
        if (!seVe) {
          throw new Error(
            'El formulario de pago no llegó a cargar. Revisa tu conexión e intenta de nuevo. ' +
              'Tu pedido quedó guardado: puedes volver a intentarlo desde la página del pedido.',
          );
        }
        setTardando(false);
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
    };
    // Solo el pedido. Ver `confirmarRef`: cualquier otra dependencia haría que
    // este efecto se rehaga y tire abajo el formulario.
  }, [pedidoId]);

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
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Preparando el pago seguro…
              </span>
              {tardando && (
                <span className="text-center text-xs text-slate-400">
                  Está tardando más de lo normal. No cierres esta página: tu pedido ya está
                  guardado y el pago todavía no se hizo.
                </span>
              )}
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          )}

          {/* Acá monta izipay. Este div es el que recibe `attachForm`; el
              `.kr-embedded` que va adentro se crea a mano — ver
              `envoltorioRef`. */}
          <div id={ENVOLTORIO} ref={envoltorioRef} />

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
