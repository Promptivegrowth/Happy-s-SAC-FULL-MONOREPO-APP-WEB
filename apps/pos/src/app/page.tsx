import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';

export const dynamic = 'force-dynamic';

export default async function Root() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  redirect(user ? '/venta' : '/login');
}
