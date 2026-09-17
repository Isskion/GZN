// ==============================================================================
// GZN — API ROUTE: EVALUACIÓN DE PUNTO Y GEOFENCING TÁCTICO (RPC PostGIS)
// ==============================================================================
// POST /api/geo/check-point (y GET de soporte)
// Servicio analítico geoespacial puro y SIN ESTADO (stateless).
// Evalúa si unas coordenadas geográficas dadas cruzan polígonos de severidad
// táctica (RED, AMBER, SAFE_HAVEN, CORRIDOR), penetran en su buffer perimetral
// o vulneran un toque de queda activo en el instante presente.
//
// Diferencia crítica con /api/telemetry:
// - NO persiste posiciones.
// - NO muta el estado del viajero (status).
// - NO genera alertas en public.alerts.
// - NO despacha notificaciones push (FCM).
// Diseñado para Mission Planning, evaluación previa de rutas e inspección RSO.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { verifyDeviceAuth } from '@/lib/auth/device';
import { createAdminClient } from '@/lib/supabase/admin';

export type HighestSeverity = 'RED' | 'AMBER' | 'SAFE_HAVEN' | 'CORRIDOR' | string | null;

interface CheckPointParams {
  latitude?: number | null;
  longitude?: number | null;
  traveler_id?: string | null;
}

async function handleCheckPoint(request: NextRequest, params: CheckPointParams) {
  let { latitude, longitude, traveler_id } = params;
  let resolvedTravelerId: string | null = null;
  let orgId: string;
  let isHardwareAuth = false;
  let adminClient: any = null;
  let sessionClient: any = null;

  // 1. Comprobación de Autenticación Dual (Hardware vs Staff)
  const hasDeviceSecret = request.headers.has('x-device-secret');
  const travelerIdParam = traveler_id ?? request.headers.get('x-traveler-id');

  if (hasDeviceSecret) {
    // ------------------------------------------------------------------------
    // RAMA HARDWARE (Terminal Móvil / Convoy en Campo)
    // ------------------------------------------------------------------------
    if (!travelerIdParam) {
      return NextResponse.json(
        { error: 'Autenticación de dispositivo requiere parámetro traveler_id o cabecera x-traveler-id.' },
        { status: 400 }
      );
    }

    const deviceAuth = await verifyDeviceAuth(request, travelerIdParam);

    if (!deviceAuth.authenticated || !deviceAuth.traveler) {
      return NextResponse.json(
        { error: `No autorizado: ${deviceAuth.error || 'Credencial de dispositivo inválida'}` },
        { status: 401 }
      );
    }

    isHardwareAuth = true;
    adminClient = createAdminClient();
    orgId = deviceAuth.traveler.organization_id;
    resolvedTravelerId = deviceAuth.traveler.id;

    // Si no se pasaron coordenadas explícitas, obtener última posición del viajero
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
      const { data: travelerData, error: travelerErr } = await adminClient
        .from('travelers')
        .select('last_latitude, last_longitude')
        .eq('id', deviceAuth.traveler.id)
        .single();

      if (travelerErr || !travelerData || travelerData.last_latitude === null || travelerData.last_longitude === null) {
        return NextResponse.json(
          { error: 'El dispositivo del viajero no dispone de coordenadas previas registradas. Proporcione latitude y longitude explícitas.' },
          { status: 400 }
        );
      }

      latitude = travelerData.last_latitude;
      longitude = travelerData.last_longitude;
    }
  } else {
    // ------------------------------------------------------------------------
    // RAMA STAFF (Consola RSO / Operador Web)
    // ------------------------------------------------------------------------
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa o cabecera x-device-secret.'}` },
        { status: 401 }
      );
    }

    // Validar perfil activo y rol operativo
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, organization_id, role, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['OPERATOR', 'RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Acceso denegado: Se requiere rol operativo o de gestión activo para consultar servicios tácticos.' },
        { status: 403 }
      );
    }

    sessionClient = supabase;
    orgId = profile.organization_id;

    // Si se pasa traveler_id para resolver coordenadas
    if (travelerIdParam && (latitude === null || latitude === undefined || longitude === null || longitude === undefined || isNaN(latitude) || isNaN(longitude))) {
      const { data: travelerData, error: travelerErr } = await supabase
        .from('travelers')
        .select('id, organization_id, last_latitude, last_longitude')
        .eq('id', travelerIdParam)
        .single();

      if (travelerErr || !travelerData) {
        return NextResponse.json(
          { error: 'Viajero no encontrado o no pertenece a la organización autorizada.' },
          { status: 404 }
        );
      }

      if (travelerData.last_latitude === null || travelerData.last_longitude === null) {
        return NextResponse.json(
          { error: 'El viajero no dispone de coordenadas de telemetría recientes en el sistema.' },
          { status: 400 }
        );
      }

      latitude = travelerData.last_latitude;
      longitude = travelerData.last_longitude;
      resolvedTravelerId = travelerData.id;
    }
  }

  // 2. Validación estricta de Coordenadas WGS84
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined || isNaN(latitude) || isNaN(longitude)) {
    return NextResponse.json(
      { error: 'Parámetros obligatorios ausentes: Debe proporcionar latitude y longitude numéricas, o un traveler_id con posición conocida.' },
      { status: 400 }
    );
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json(
      { error: 'Coordenadas WGS84 inválidas: latitude debe estar en [-90, 90] y longitude en [-180, 180].' },
      { status: 400 }
    );
  }

  // 3. Invocación de la RPC PostGIS check_point_zones
  // Para hardware se utiliza cliente admin con orgId validado; para staff se utiliza cliente de sesión con RLS
  const clientToUse = isHardwareAuth ? adminClient : sessionClient;
  const { data: zones, error: rpcError } = await clientToUse.rpc('check_point_zones', {
    p_org_id: orgId,
    p_lat: latitude,
    p_lon: longitude,
  });

  if (rpcError) {
    console.error('Error al invocar check_point_zones:', rpcError);
    return NextResponse.json(
      { error: 'Error interno al evaluar coordenadas en zonas tácticas.' },
      { status: 500 }
    );
  }

  const matchingZones = zones || [];
  const totalZones = matchingZones.length;
  const insideZones = totalZones > 0;

  // La función PostGIS ya devuelve ordenado por severidad: RED (1) -> AMBER (2) -> SAFE_HAVEN (3) -> RESTO (4)
  const highestSeverity: HighestSeverity = insideZones ? matchingZones[0].severity : null;
  const hasActiveCurfew = matchingZones.some((z: any) => z.curfew_active_now === true);

  return NextResponse.json({
    inside_zones: insideZones,
    total_zones: totalZones,
    highest_severity: highestSeverity,
    has_active_curfew: hasActiveCurfew,
    zones: matchingZones,
    evaluated_at: new Date().toISOString(),
    coordinates: {
      latitude,
      longitude,
      ...(resolvedTravelerId ? { traveler_id: resolvedTravelerId } : {}),
    },
  });
}

// POST /api/geo/check-point — Evaluación analítica de geofencing
export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo de la petición JSON inválido o malformado' }, { status: 400 });
    }

    const latitude = body.latitude !== undefined ? Number(body.latitude) : (body.lat !== undefined ? Number(body.lat) : null);
    const longitude = body.longitude !== undefined ? Number(body.longitude) : (body.lon !== undefined ? Number(body.lon) : null);
    const traveler_id = body.traveler_id || null;

    return await handleCheckPoint(request, { latitude, longitude, traveler_id });
  } catch (err: any) {
    console.error('Excepción no controlada en POST /api/geo/check-point:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor en servicio geoespacial.' },
      { status: 500 }
    );
  }
}

// GET /api/geo/check-point — Soporte alternativo por Query Params
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get('latitude') ?? searchParams.get('lat');
    const lonParam = searchParams.get('longitude') ?? searchParams.get('lon');
    const travelerIdParam = searchParams.get('traveler_id') ?? request.headers.get('x-traveler-id');

    const latitude = latParam !== null ? parseFloat(latParam) : null;
    const longitude = lonParam !== null ? parseFloat(lonParam) : null;

    return await handleCheckPoint(request, { latitude, longitude, traveler_id: travelerIdParam });
  } catch (err: any) {
    console.error('Excepción no controlada en GET /api/geo/check-point:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor en servicio geoespacial.' },
      { status: 500 }
    );
  }
}
