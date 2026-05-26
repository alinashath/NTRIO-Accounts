import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocketImpl from "ws";

/**
 * Service-role Supabase client for Node (Express).
 * Node.js before v22 has no global WebSocket; `@supabase/supabase-js` still wires Realtime and throws without `ws`.
 */
export function createServiceRoleSupabase(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      transport: WebSocketImpl as unknown as typeof WebSocket,
    },
  });
}
