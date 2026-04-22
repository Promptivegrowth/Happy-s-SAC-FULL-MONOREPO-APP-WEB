export const metadata = { title: 'Términos y condiciones' };

export default function Page() {
  return (
    <article className="container max-w-3xl px-4 py-14 prose prose-sm">
      <h1 className="font-display text-4xl font-semibold">Términos y condiciones</h1>
      <p className="mt-4 text-slate-500">Última actualización: {new Date().toLocaleDateString('es-PE')}</p>
      <p className="mt-6 text-slate-600">
        Al acceder y comprar en disfraceshappys.com aceptas los siguientes términos. Documento referencial — debe ser revisado por asesoría legal antes de producción.
      </p>
      <h2>Datos del proveedor</h2>
      <p>HAPPY SAC · RUC 20609213770 · Lima, Perú.</p>
      <h2>Productos</h2>
      <p>Las imágenes son referenciales. Los colores pueden variar ligeramente. Cada talla se entrega según las medidas indicadas en la ficha del producto.</p>
      <h2>Pagos</h2>
      <p>Aceptamos Yape, Plin, tarjetas Visa/MasterCard/Amex (vía Culqi), transferencia bancaria y pago contraentrega coordinado por WhatsApp.</p>
      <h2>Envíos</h2>
      <p>Lima Metropolitana en 2-3 días hábiles. Provincias en 4-7 días hábiles. El cliente puede coordinar recojo en tienda.</p>
      <h2>Cambios y devoluciones</h2>
      <p>Se aceptan cambios dentro de las 48 horas posteriores a la entrega, con producto sin uso, etiquetas y empaque original.</p>
    </article>
  );
}
