import { obtenerContenidoWeb } from '@/lib/contenido-web';
import { enlaceWhatsApp, telefonoLegible } from '@happy/lib/web/contenido';

export const metadata = { title: 'Contacto' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { contacto } = await obtenerContenidoWeb();
  return (
    <article className="container max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl font-semibold">Contacto</h1>
      <p className="mt-4 text-slate-600">
        Estamos para ayudarte. Escríbenos por WhatsApp o correo.
      </p>
      <ul className="mt-8 space-y-3 text-sm">
        <li>📱 WhatsApp: <a href={enlaceWhatsApp(contacto.whatsapp)} className="text-happy-600 hover:underline">{telefonoLegible(contacto.whatsapp)}</a></li>
        <li>📧 Email: <a href={`mailto:${contacto.email}`} className="text-happy-600 hover:underline">{contacto.email}</a></li>
        <li>🏬 {contacto.direccion}</li>
      </ul>
    </article>
  );
}
