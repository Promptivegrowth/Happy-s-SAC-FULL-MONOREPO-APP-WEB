import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import '@happy/ui/styles.css';
import './globals.css';

// latin-ext incluido para que í, á, é, ó, ú, ñ del español rendericen bien
// en todos los navegadores (bug reportado por cliente 2026-07-10 en el chip
// "Avíos" del ERP — mismo font stack en el POS por consistencia).
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'POS HAPPY',
  description: 'Punto de venta — HAPPY SAC',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ff4d0d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={inter.variable}>
      <body className="min-h-screen bg-slate-100 font-sans antialiased">
        {children}
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
