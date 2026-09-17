// ==============================================================================
// GZN — API ROUTE: BRIEFINGS DE MISIÓN Y POIS COMPARTIDOS (Colección)
// ==============================================================================
// GET /api/briefings  — Listado de briefings tácticos con POIs (Staff y Hardware)
// POST /api/briefings — Creación de nuevo briefing de misión con POIs atómicos (RSO/Admin)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { verifyDeviceAuth } from '@/lib/auth/device';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit/logger';

export const VALID_POI_CATEGORIES = [
  'EXTRACTION_POINT',
  'HOSPITAL',
  'POLICE',
  'SAFE_HOUSE',
  'CHECKPOINT',
  'DANGER_POINT',
] as const;

export type PoiCategory = typeof VALID_POI_CATEGORIES[number];

export interface BriefingPoiInput {
  name: string;
  category: PoiCategory;
  latitude: number;
  longitude: number;
  notes?: string | null;
}

export function validatePoi(poi: any, index: number): { valid: boolean; error?: string } {
  if (!poi || typeof poi !== 'object') {
    return { valid: false, error: `El POI en índice ${index} debe ser un objeto válido.` };
  }
  if (!poi.name || typeof poi.name !== 'string' || poi.name.trim() === '') {
    return { valid: false, error: `El POI en índice ${index} requiere un 'name' no vacío.` };
  }
  if (!VALID_POI_CATEGORIES.includes(poi.category)) {
    return {
      valid: false,
      error: `Categoría inválida '${poi.category}' en POI '${poi.name}'. Categorías válidas: ${VALID_POI_CATEGORIES.join(', ')}.`,
    };
  }
  const lat = Number(poi.latitude);
  const lon = Number(poi.longitude);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return {
      valid: false,
      error: `Coordenadas WGS84 inválidas en POI '${poi.name}': latitude debe estar en [-90, 90] y longitude en [-180, 180].`,
    };
  }
  return { valid: true };
}

// GET /api/briefings — Listar briefings con POIs (Autenticación Dual)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const hasDeviceSecret = request.headers.has('x-device-secret');
    let clientToUse: any;
    let orgId: string | null = null;

    if (hasDeviceSecret) {
      // Rama Hardware (Terminal Móvil en Campo - Descarga Offline)
      const travelerId = searchParams.get('traveler_id') || request.headers.get('x-traveler-id');
      if (!travelerId) {
        return NextResponse.json(
          { error: 'Autenticación de dispositivo requiere parámetro traveler_id o cabecera x-traveler-id.' },
          { status: 400 }
        );
      }
      const deviceAuth = await verifyDeviceAuth(request, travelerId);
      if (!deviceAuth.authenticated || !deviceAuth.traveler) {
        return NextResponse.json(
          { error: `No autorizado: ${deviceAuth.error || 'Credencial de dispositivo inválida'}` },
          { status: 401 }
        );
      }
      clientToUse = createAdminClient();
      orgId = deviceAuth.traveler.organization_id;
    } else {
      // Rama Staff (Consola Web RSO)
      const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);
      if (!authenticated || !supabase || !user) {
        return NextResponse.json(
          { error: `No autorizado: ${authError || 'Se requiere sesión activa o cabecera x-device-secret.'}` },
          { status: 401 }
        );
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, organization_id, role, is_active')
        .eq('id', user.id)
        .eq('is_active', true)
        .single();

      if (profileError || !profile || !['OPERATOR', 'RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role)) {
        return NextResponse.json(
          { error: 'Acceso denegado: Se requiere rol activo en la organización para consultar briefings.' },
          { status: 403 }
        );
      }
      clientToUse = supabase;
    }

    let query = clientToUse
      .from('briefings')
      .select(`
        id,
        organization_id,
        author_rso_id,
        title,
        welcome_message,
        protocol_instructions,
        created_at,
        updated_at,
        author:profiles!author_rso_id (id, full_name, role, phone),
        pois:briefing_pois (id, name, category, latitude, longitude, notes)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    if (search && search.trim() !== '') {
      query = query.ilike('title', `%${search.trim()}%`);
    }

    const { data: briefings, error: dbError } = await query;

    if (dbError) {
      console.error('Error al consultar briefings:', dbError);
      return NextResponse.json({ error: 'Error interno al consultar briefings tácticos.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: briefings?.length || 0,
      briefings: briefings || [],
    });
  } catch (err: any) {
    console.error('Excepción no controlada en GET /api/briefings:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

// POST /api/briefings — Creación de nuevo briefing de misión con POIs atómicos
export async function POST(request: NextRequest) {
  try {
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    // Control RBAC: Solo RSO, ORG_ADMIN o SUPER_ADMIN con perfil activo
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, organization_id, role, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para redactar briefings de misión.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo de la petición JSON inválido o malformado' }, { status: 400 });
    }

    const { title, welcome_message, protocol_instructions, pois } = body;

    // Validación defensiva de campos principales
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: 'El campo "title" es obligatorio y no puede estar vacío.' }, { status: 400 });
    }

    // Validación defensiva de colección de POIs si vienen especificados
    if (pois !== undefined && pois !== null) {
      if (!Array.isArray(pois)) {
        return NextResponse.json({ error: 'El campo "pois" debe ser un array de puntos de interés.' }, { status: 400 });
      }
      for (let i = 0; i < pois.length; i++) {
        const val = validatePoi(pois[i], i);
        if (!val.valid) {
          return NextResponse.json({ error: val.error }, { status: 400 });
        }
      }
    }

    // 1. Inserción del briefing principal
    const { data: newBriefing, error: insertError } = await supabase
      .from('briefings')
      .insert({
        organization_id: profile.organization_id,
        author_rso_id: user.id,
        title: title.trim(),
        welcome_message: welcome_message?.trim() || null,
        protocol_instructions: protocol_instructions?.trim() || null,
      })
      .select()
      .single();

    if (insertError || !newBriefing) {
      console.error('Error al insertar briefing:', insertError);
      return NextResponse.json({ error: 'Error al registrar el briefing de misión.' }, { status: 500 });
    }

    // 2. Inserción atómica de POIs mediante RPC transaccional
    let insertedPoisCount = 0;
    if (pois && Array.isArray(pois) && pois.length > 0) {
      const sanitizedPois = pois.map((p: any) => ({
        name: p.name.trim(),
        category: p.category,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        notes: p.notes?.trim() || null,
      }));

      const { data: rpcCount, error: rpcError } = await supabase.rpc('replace_briefing_pois', {
        p_briefing_id: newBriefing.id,
        p_pois: sanitizedPois,
      });

      if (rpcError) {
        console.error('Error en RPC replace_briefing_pois durante creación:', rpcError);
        // Revertir briefing creado para no dejarlo huérfano
        await supabase.from('briefings').delete().eq('id', newBriefing.id);
        return NextResponse.json(
          { error: `Error atómico al registrar puntos de interés: ${rpcError.message}` },
          { status: 400 }
        );
      }
      insertedPoisCount = rpcCount || sanitizedPois.length;
    }

    // 3. Trazabilidad DPIA / Audit Log
    await logAuditEvent(supabase, {
      organization_id: profile.organization_id,
      performed_by: user.id,
      action: 'BRIEFING_CREATED',
      entity_type: 'BRIEFING',
      entity_id: newBriefing.id,
      payload: {
        title: newBriefing.title,
        pois_count: insertedPoisCount,
      },
    });

    // 4. Recuperar objeto completo con POIs para retorno limpio
    const { data: createdBriefing } = await supabase
      .from('briefings')
      .select(`
        id,
        organization_id,
        author_rso_id,
        title,
        welcome_message,
        protocol_instructions,
        created_at,
        updated_at,
        author:profiles!author_rso_id (id, full_name, role, phone),
        pois:briefing_pois (id, name, category, latitude, longitude, notes)
      `)
      .eq('id', newBriefing.id)
      .single();

    return NextResponse.json({ success: true, briefing: createdBriefing || newBriefing }, { status: 201 });
  } catch (err: any) {
    console.error('Excepción no controlada en POST /api/briefings:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
