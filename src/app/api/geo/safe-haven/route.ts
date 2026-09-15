// ==============================================================================
// GZN — API ROUTE: REFUGIO SEGURO MÁS CERCANO (RPC PostGIS Táctico)
// ==============================================================================
// GET /api/geo/safe-haven
// Consulta el refugio táctico (SAFE_HAVEN) activo más próximo a unas coordenadas
// o a la última posición conocida de un viajero.
//
// Autenticación Dual:
// 1. Staff (Consola RSO): Sesión de usuario activa (cookie/Bearer). RLS aplicado.
// 2. Hardware (Terminal Móvil M2M): Cabecera 'x-device-secret' + 'traveler_id'.
//    Invoca con cliente admin (service_role) y organización validada del viajero.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { verifyDeviceAuth } from '@/lib/auth/device';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 1. Extracción de parámetros de consulta
    const latParam = searchParams.get('latitude') ?? searchParams.get('lat');
    const lonParam = searchParams.get('longitude') ?? searchParams.get('lon');
    const travelerIdParam = searchParams.get('traveler_id') ?? request.headers.get('x-traveler-id');

    let latitude: number | null = latParam !== null ? parseFloat(latParam) : null;
    let longitude: number | null = lonParam !== null ? parseFloat(lonParam) : null;
    let resolvedTravelerId: string | null = null;
    let orgId: string;
    let isHardwareAuth = false;
    let adminClient: any = null;
    let sessionClient: any = null;

    // 2. Comprobación de Autenticación Dual (Hardware vs Staff)
    const hasDeviceSecret = request.headers.has('x-device-secret');

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
      if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
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

      if (profileError || !profile || !['OPERATOR', 'RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
        return NextResponse.json(
          { error: 'Acceso denegado: Se requiere rol operativo o de gestión activo para consultar servicios tácticos.' },
          { status: 403 }
        );
      }

      sessionClient = supabase;
      orgId = profile.organization_id;

      // Si se pasa traveler_id para resolver coordenadas
      if (travelerIdParam && (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude))) {
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

    // 3. Validación estricta de Coordenadas WGS84
    if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
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

    // 4. Invocación de la RPC PostGIS find_nearest_safe_haven
    // Para hardware se utiliza cliente admin con orgId validado; para staff se utiliza cliente de sesión con RLS
    const clientToUse = isHardwareAuth ? adminClient : sessionClient;
    const { data: safeHavens, error: rpcError } = await clientToUse.rpc('find_nearest_safe_haven', {
      p_org_id: orgId,
      p_lat: latitude,
      p_lon: longitude,
    });

    if (rpcError) {
      console.error('Error al invocar find_nearest_safe_haven:', rpcError);
      return NextResponse.json(
        { error: 'Error interno al consultar el refugio seguro más cercano.' },
        { status: 500 }
      );
    }

    // 5. Formato de respuesta táctica
    if (!safeHavens || safeHavens.length === 0) {
      return NextResponse.json({
        found: false,
        safe_haven: null,
        message: 'No existen zonas de refugio seguro (SAFE_HAVEN) activas y vigentes para la organización.',
        origin: {
          latitude,
          longitude,
          ...(resolvedTravelerId ? { traveler_id: resolvedTravelerId } : {}),
        },
      });
    }

    const sh = safeHavens[0];
    const distanceMeters = Math.round(sh.distance_meters * 10) / 10;
    const distanceKm = Math.round((sh.distance_meters / 1000) * 100) / 100;

    return NextResponse.json({
      found: true,
      safe_haven: {
        zone_id: sh.zone_id,
        zone_name: sh.zone_name,
        description: sh.description,
        contact_phone: sh.contact_phone,
        radio_frequency: sh.radio_frequency,
        gate_access_protocol: sh.gate_access_protocol,
        distance_meters: distanceMeters,
        distance_km: distanceKm,
      },
      origin: {
        latitude,
        longitude,
        ...(resolvedTravelerId ? { traveler_id: resolvedTravelerId } : {}),
      },
    });
  } catch (err: any) {
    console.error('Excepción no controlada en GET /api/geo/safe-haven:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno del servidor en servicio geoespacial.' },
      { status: 500 }
    );
  }
}
