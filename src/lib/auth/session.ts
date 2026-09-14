// ==============================================================================
// GZN — CONTROL DE SESIÓN Y AUTENTICACIÓN RSO (Supabase Auth / RLS)
// ==============================================================================

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { SupabaseClient, User } from '@supabase/supabase-js';

export interface SessionAuthResult {
  authenticated: boolean;
  user: User | null;
  supabase: SupabaseClient | null;
  error?: string;
}

/**
 * Valida la sesión activa de un operador o RSO desde la consola web o llamadas API autenticadas.
 * Acepta sesión por cookies (SSR) o cabecera 'Authorization: Bearer <token>'.
 *
 * Se verifica de forma estricta contra supabase.auth.getUser().
 * No contiene atajos, patrones de texto ni mocks de desarrollo.
 */
export async function getAuthenticatedSession(request: NextRequest): Promise<SessionAuthResult> {
  const authHeader = request.headers.get('authorization');
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const hasAuthCookie = allCookies.some(c => c.name.startsWith('sb-') || c.name.includes('auth'));

  // Rechazo temprano si no se proporciona ninguna credencial
  if (!authHeader && !hasAuthCookie) {
    return {
      authenticated: false,
      user: null,
      supabase: null,
      error: 'Se requiere sesión de usuario activa (cookie o cabecera Authorization Bearer).',
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return {
      authenticated: false,
      user: null,
      supabase: null,
      error: 'Entorno no configurado: faltan credenciales públicas de Supabase.',
    };
  }

  try {
    const supabase = await createClient(request);
    let user: User | null = null;
    let authError = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const res = await supabase.auth.getUser(token);
      user = res.data?.user || null;
      authError = res.error;
    } else {
      const res = await supabase.auth.getUser();
      user = res.data?.user || null;
      authError = res.error;
    }

    if (authError || !user) {
      return {
        authenticated: false,
        user: null,
        supabase: null,
        error: authError?.message || 'Sesión no válida o expirada.',
      };
    }

    return {
      authenticated: true,
      user,
      supabase: supabase as any,
    };
  } catch (err: any) {
    return {
      authenticated: false,
      user: null,
      supabase: null,
      error: err.message || 'Error al validar la sesión del usuario.',
    };
  }
}
