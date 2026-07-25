import { createClient } from "@supabase/supabase-js";

// Cliente con la service role key — solo para uso server-side (crear/borrar
// cuentas de staff vía supabase.auth.admin.*). Nunca importar desde código
// que corra en el cliente, y la key nunca debe llevar prefijo NEXT_PUBLIC_.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY para crear cuentas de staff.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
