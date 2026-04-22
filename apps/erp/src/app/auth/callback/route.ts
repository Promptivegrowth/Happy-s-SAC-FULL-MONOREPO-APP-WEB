import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@happy/db/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const sb = await createClient();
    await sb.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
