export const metadata = { title: 'Mi cuenta' };

export default function Page() {
  return (
    <div className="container max-w-2xl px-4 py-14">
      <h1 className="font-display text-3xl font-semibold">Mi cuenta</h1>
      <p className="mt-2 text-slate-500">Próximamente: historial de pedidos, direcciones guardadas, lista de deseos.</p>
      <p className="mt-6 rounded-lg border bg-slate-50 p-4 text-sm">
        Mientras tanto, todo el seguimiento se hace por WhatsApp +51 916 856 842 con tu número de pedido.
      </p>
    </div>
  );
}
