import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { getSession } from '@/server/session';

// El layout hace queries vía getSession(), por lo tanto debe ser dinámico.
// Sin este flag, las pages hijas sin force-dynamic propio intentan prerrenderizarse
// en build y fallan porque no tienen las env vars de Supabase.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSession();
  return (
    <div className="flex min-h-screen">
      <Sidebar roles={sesion.roles} />
      <div className="flex w-full flex-col">
        <Topbar nombre={sesion.nombre} email={sesion.email} roles={sesion.roles} />
        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
