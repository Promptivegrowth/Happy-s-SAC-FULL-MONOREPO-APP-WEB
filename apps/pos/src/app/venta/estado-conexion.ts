'use client';

/**
 * Si el POS puede hablar con el sistema, y decirlo antes de que se note vendiendo.
 *
 * El 18/09/2026 en tienda "se congeló el botón de pagar". El cobro fallaba por
 * red y nadie se enteraba, porque el error se perdía. Eso ya está arreglado —hay
 * un cartel cuando el cobro falla—, pero avisar DESPUÉS, con el cliente en el
 * mostrador y la venta caída, llega tarde. Esto avisa antes.
 *
 * `navigator.onLine` solo no alcanza: dice que sí mientras haya wifi, aunque el
 * router no tenga internet, que es justo lo que pasa en una tienda. Por eso
 * además se pregunta de verdad al servidor cada tanto. El que manda es el
 * resultado real; `navigator.onLine` sirve para reaccionar al instante cuando
 * se desenchufa el cable.
 */

import { useEffect, useState } from 'react';

export type EstadoConexion = 'ok' | 'sin-internet' | 'lenta';

/**
 * Cada cuánto se comprueba, en milisegundos.
 *
 * Un minuto y no veinte segundos: lo que se busca es enterarse de que se cayó
 * el internet antes de cobrar, y para eso alcanza. Cuanto menos hable el POS
 * con el servidor por su cuenta, menos se mete en el camino de lo que importa.
 */
const CADA = 60_000;

/** A partir de acá la conexión está para avisar: el cobro se va a sentir. */
const LENTA_MS = 4_000;

/** Si tarda más que esto, se cuenta como caída. */
const LIMITE_MS = 8_000;

async function medir(): Promise<EstadoConexion> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'sin-internet';

  const inicio = Date.now();
  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), LIMITE_MS);

  try {
    /*
     * Se pide una ruta propia y chica, sin caché.
     *
     * Tiene que salir a la red de verdad en cada intento: una respuesta servida
     * del caché diría "hay internet" con el cable desenchufado.
     */
    const r = await fetch(`/api/ping?t=${inicio}`, {
      cache: 'no-store',
      signal: abortar.signal,
      /*
       * SIN cookies, a proposito.
       *
       * Mandar la sesion en cada comprobacion hacia que el servidor la
       * revisara, y con el token por vencer intentara renovarlo. Varias
       * renovaciones a la vez lo revocan y cierran la sesion sola. Medir la red
       * no necesita identificarse.
       */
      credentials: 'omit',
    });
    if (!r.ok) return 'sin-internet';
    return Date.now() - inicio > LENTA_MS ? 'lenta' : 'ok';
  } catch {
    return 'sin-internet';
  } finally {
    clearTimeout(reloj);
  }
}

export function useEstadoConexion(): EstadoConexion {
  const [estado, setEstado] = useState<EstadoConexion>('ok');

  useEffect(() => {
    let vivo = true;
    const revisar = async () => {
      const r = await medir();
      if (vivo) setEstado(r);
    };

    void revisar();
    const timer = setInterval(revisar, CADA);

    // Desenchufar el cable se nota al instante; no hay que esperar al timer.
    const alCaer = () => { if (vivo) setEstado('sin-internet'); };
    const alVolver = () => { void revisar(); };
    window.addEventListener('offline', alCaer);
    window.addEventListener('online', alVolver);

    return () => {
      vivo = false;
      clearInterval(timer);
      window.removeEventListener('offline', alCaer);
      window.removeEventListener('online', alVolver);
    };
  }, []);

  return estado;
}
