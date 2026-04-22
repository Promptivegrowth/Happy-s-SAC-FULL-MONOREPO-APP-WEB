'use client';

import { MessageCircle } from 'lucide-react';

export function WhatsappFab() {
  return (
    <a
      href={`https://wa.me/51916856842?text=${encodeURIComponent('Hola! Estoy en disfraceshappys.com y quisiera consultar...')}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Hablar por WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-glow transition hover:scale-110"
    >
      <MessageCircle className="h-7 w-7 fill-white" />
      <span className="absolute -top-1 -right-1 flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
      </span>
    </a>
  );
}
