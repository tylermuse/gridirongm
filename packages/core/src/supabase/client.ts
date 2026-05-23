/**
 * @bs/core/supabase/client — browser-side Supabase auth client.
 *
 * Promoted from apps/web/src/lib/supabase/client.ts during Sub-phase 1D.
 *
 * Returns null if Supabase env vars are missing — callers must handle this
 * (e.g., feature-flag premium / GM sync off when Supabase is unconfigured).
 *
 * The client is memoized at module scope so repeated calls don't reinstantiate
 * the WebSocket connection.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return _client;
}
