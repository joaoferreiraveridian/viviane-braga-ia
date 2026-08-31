/**
 * Cliente Supabase opcional.
 *
 * Este arquivo é 100% descartável: se o app que você está construindo
 * a partir deste template não usa Supabase, pode apagar este arquivo
 * (e a dependência @supabase/supabase-js) sem quebrar nada — nenhum
 * outro arquivo do template importa `supabase` diretamente.
 *
 * Lê as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
 * Se não estiverem definidas, `supabase` é `null` e `isSupabaseConfigured`
 * é `false` — permitindo que o app rode normalmente com dados fictícios
 * ou outra fonte de dados até que o Supabase seja configurado.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
