import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import { Toaster } from 'sonner';
import '@happy/ui/styles.css';
import './globals.css';

// Incluimos latin-ext además de latin — cliente reportó (2026-07-10) que
// caracteres acentuados del español (í, á, é, ó, ú, ñ) se veían como
// rombos ◇ en algunos chips/badges. El subset 'latin' de Google Fonts
// omite ese rango; 'latin-ext' lo agrega.
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin', 'latin-ext'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'HAPPY ERP', template: '%s · HAPPY ERP' },
  description: 'Panel administrativo HAPPY SAC — disfraceshappys.com',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1021' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
