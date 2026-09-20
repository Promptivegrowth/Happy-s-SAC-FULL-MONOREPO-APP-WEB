'use client';

/**
 * La última red: lo que se ve cuando falla el layout mismo.
 *
 * El `error.tsx` del dashboard atrapa lo que pasa DENTRO, pero no puede atrapar
 * un fallo del layout que lo contiene. Y sin nada que atrape eso, lo que queda
 * es una PANTALLA EN BLANCO: ni un mensaje, ni un botón, nada que hacer salvo
 * recargar adivinando. Reportado el 19/09/2026 — "a veces se queda en blanco y
 * tengo que recargar".
 *
 * Una causa muy común es haber desplegado mientras la pestaña estaba abierta:
 * el navegador se quedó con pedazos de la versión vieja que ya no existen.
 * Recargar lo arregla, y por eso ese es el botón principal.
 *
 * Reemplaza el documento entero, así que lleva sus propios <html> y <body> y no
 * puede apoyarse en los estilos de la aplicación: si lo que falló fue el layout,
 * las hojas de estilo pueden no haber cargado. Todo va en línea a propósito.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', background: '#f8fafc' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{
            maxWidth: 460, width: '100%', background: '#fff', borderRadius: 16,
            padding: 32, boxShadow: '0 10px 30px rgba(15,23,42,.08)', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#fff1ed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 28,
            }}>
              ⚠️
            </div>

            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a' }}>
              La pantalla no cargó bien
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
              Casi siempre es porque el sistema se actualizó mientras tenías esta pestaña abierta.
              Recargá y listo — <strong>no se pierde nada de lo que ya guardaste</strong>.
            </p>

            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 24, width: '100%', height: 44, border: 'none', borderRadius: 8,
                background: '#ff4d0d', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Recargar la página
            </button>

            <button
              onClick={() => reset()}
              style={{
                marginTop: 8, width: '100%', height: 40, borderRadius: 8,
                border: '1px solid #cbd5e1', background: '#fff', color: '#334155',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Reintentar sin recargar
            </button>

            <p style={{ margin: '20px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Si vuelve a pasar, avisá a soporte
              {error?.digest ? <> y pasá este código: <code style={{ color: '#475569' }}>{error.digest}</code></> : null}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
