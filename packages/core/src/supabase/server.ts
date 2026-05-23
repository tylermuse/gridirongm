/**
 * @bs/core/supabase/server — server-side Supabase auth client.
 *
 * Promoted from apps/web/src/lib/supabase/server.ts during Sub-phase 1D.
 *
 * Server-only — uses `next/headers` cookies. Must be called from Server
 * Components, Route Handlers, or Server Actions. Calling from a Client
 * Component will throw.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    },
  );
}
