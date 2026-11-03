// lib/supabase-admin.ts
// Cliente con la llave de servicio: lee lo que la base le niega al usuario. Solo en el
// servidor y siempre filtrando por la empresa (ownerId), porque esta llave no tiene RLS.
// Se usa para que el jefe de obra reciba la mano de obra agrupada y para repartir sueldos
// cuando él corrige un parte. Sin SUPABASE_SERVICE_ROLE_KEY devuelve null.
import { createClient } from '@supabase/supabase-js'

export function clienteServicio() {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (typeof window !== 'undefined' || !llave || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Para leer sueldos en nombre de quien no los ve: con la llave si existe; si no, la sesión.
export const lectorSueldos = (supabase: any) => clienteServicio() ?? supabase
