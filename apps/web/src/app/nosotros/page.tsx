export const metadata = { title: 'Sobre nosotros' };

export default function Page() {
  return (
    <article className="container max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl font-semibold">Sobre Disfraces Happys</h1>
      <p className="mt-4 text-lg text-slate-600">
        Somos una empresa peruana con más de 25 años fabricando disfraces premium para niños y adultos.
        Trabajamos con materiales de primera calidad y un equipo de operarios especializados.
      </p>
      <p className="mt-4 text-slate-600">
        Atendemos minoristas en nuestras tiendas de Huallaga y La Quinta, y mayoristas en todo el Perú.
        Nuestro proceso de producción incluye corte propio, confección con talleres asociados certificados,
        y un riguroso control de calidad antes de despachar a almacén.
      </p>
    </article>
  );
}
