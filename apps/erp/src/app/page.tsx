import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';

export default async function Root() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  redirect(user ? '/dashboard' : '/login');
}
