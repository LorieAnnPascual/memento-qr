import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/auth/supabase-server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/reset-password';

  if (!code) {
    return NextResponse.redirect(new URL('/forgot-password?error=invalid_link', origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('Password reset link exchange error:', error);
    return NextResponse.redirect(new URL('/forgot-password?error=expired_link', origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
