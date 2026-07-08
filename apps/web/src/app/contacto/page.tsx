export const metadata = { title: 'Contacto' };

export default function Page() {
  return (
    <article className="container max-w-3xl px-4 py-14">
      <h1 className="font-display text-4xl font-semibold">Contacto</h1>
      <p className="mt-4 text-slate-600">
        Estamos para ayudarte. Escríbenos por WhatsApp o correo.
      </p>
      <ul className="mt-8 space-y-3 text-sm">
        <li>📱 WhatsApp: <a href="https://wa.me/51903064120" className="text-happy-600 hover:underline">+51 903 064 120</a></li>
        <li>📧 Email: <a href="mailto:ventas@disfraceshappys.com.pe" className="text-happy-600 hover:underline">ventas@disfraceshappys.com.pe</a></li>
        <li>🏬 Tienda Huallaga · 🏬 Tienda La Quinta — Lima, Perú</li>
      </ul>
    </article>
  );
}
