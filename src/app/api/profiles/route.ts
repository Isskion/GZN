// ==============================================================================
// GZN — API ROUTE: LISTADO DE PERFILES TÁCTICOS (/api/profiles)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const { authenticated, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión activa'}` },
        { status: 401 }
      );
    }

    // Consulta con cliente de sesión: RLS filtra estrictamente por pertenencia al tenant
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, role_level, is_active')
      .eq('is_active', true)
      .gte('role_level', 60)
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: `Error al consultar perfiles: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: profiles || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
