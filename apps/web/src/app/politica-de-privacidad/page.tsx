export const metadata = { title: 'Política de privacidad' };

export default function Page() {
  return (
    <article className="container max-w-3xl px-4 py-14 prose prose-sm">
      <h1 className="font-display text-4xl font-semibold">Política de privacidad</h1>
      <p className="text-slate-500">Última actualización: {new Date().toLocaleDateString('es-PE')}</p>
      <p className="mt-6 text-slate-600">
        Cumplimos con la Ley N° 29733 de Protección de Datos Personales del Perú. Documento referencial — adaptar con asesoría legal.
      </p>
      <h2>Datos que recopilamos</h2>
      <ul>
        <li>Identificación (DNI / RUC, nombres, dirección)</li>
        <li>Contacto (correo, celular)</li>
        <li>Datos de pago (procesados por Culqi/Izipay — no almacenamos tarjetas)</li>
        <li>Historial de compras</li>
      </ul>
      <h2>Uso</h2>
      <ul>
        <li>Procesar tus pedidos</li>
        <li>Emitir comprobantes electrónicos a SUNAT</li>
        <li>Enviar notificaciones del pedido (correo / WhatsApp)</li>
        <li>Cumplir obligaciones legales (libro de reclamaciones, registros tributarios)</li>
      </ul>
      <h2>Tus derechos</h2>
      <p>Puedes solicitar acceso, rectificación, oposición, cancelación o información sobre el uso de tus datos escribiéndonos a <a href="mailto:ventas@disfraceshappys.com">ventas@disfraceshappys.com</a>.</p>
    </article>
  );
}
