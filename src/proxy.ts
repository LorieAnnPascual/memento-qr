import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/auth/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization files.
     * /q/[shortCode] and /p/[shortCode] are still matched but treated as public
     * inside updateSession, since the redirect/publish routes need no auth.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
