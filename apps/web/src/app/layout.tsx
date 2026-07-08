import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces, Fredoka } from 'next/font/google';
import { Toaster } from 'sonner';
import '@happy/ui/styles.css';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { WhatsappFab } from '@/components/whatsapp-fab';
import { cargarDatosHeader } from '@/server/queries/header-data';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
// Fredoka — fuente redondeada y juguetona para titulares dirigidos a familias/niños.
// Usada en el hero slider para darle calidez sin perder profesionalismo.
const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-fun',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// URL canónica del sitio — el cliente compró disfraceshappys.com.pe en
// julio 2026 y lo apuntó a este proyecto Vercel. La variable env
// NEXT_PUBLIC_WEB_URL puede sobreescribir para preview/staging.
const SITE_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://www.disfraceshappys.com.pe';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Disfraces Happys — La mayor variedad del Perú 🎭',
    template: '%s · Disfraces Happys',
  },
  description: 'Disfraces para niños y adultos. Halloween, Navidad, Fiestas Patrias, Superhéroes, Danzas Típicas y más. Envíos a todo el Perú.',
  keywords: ['disfraces', 'disfraces perú', 'halloween', 'fiestas patrias', 'trajes típicos', 'disfraces de niños', 'disfraces de adultos', 'disfraces Lima'],
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    url: SITE_URL,
    siteName: 'Disfraces Happys',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ff4d0d',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Datos server-side para el header: campaña vigente por fecha (reemplaza el
  // link hardcoded de "Día de la Madre 2026" que ya venció) + índice de
  // productos para el autocomplete del buscador.
  const { campanaVigente, productosParaBusqueda } = await cargarDatosHeader();
  return (
    <html lang="es-PE" className={`${inter.variable} ${fraunces.variable} ${fredoka.variable}`}>
      <body className="flex min-h-screen flex-col bg-white font-sans antialiased">
        <SiteHeader
          campanaVigente={campanaVigente}
          productosParaBusqueda={productosParaBusqueda}
        />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <WhatsappFab />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
