// ==============================================================================
// GZN — API ROUTE: ZONAS TÁCTICAS (CRUD GeoJSON & PostGIS)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { validateGeoJSONPolygon } from '@/lib/geo/validation';

// GET /api/zones — Obtener zonas activas de la organización del usuario
export async function GET(request: NextRequest) {
  try {
    const { authenticated, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    // Consulta con cliente de sesión: RLS filtra automáticamente por la organización del usuario
    const { data: zones, error } = await supabase
      .from('zones')
      .select('id, organization_id, name, description, severity, color_hex, valid_from, valid_until, is_active, created_at, geom')
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convertir a GeoJSON FeatureCollection para consumo en MapLibre GL
    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (zones || []).map((zone: any) => {
        let geomObj: any = zone.geom;
        if (typeof zone.geom === 'string') {
          try {
            geomObj = JSON.parse(zone.geom);
          } catch {
            geomObj = null;
          }
        }

        return {
          type: 'Feature',
          id: zone.id,
          geometry: geomObj,
          properties: {
            id: zone.id,
            organization_id: zone.organization_id,
            name: zone.name,
            description: zone.description,
            severity: zone.severity,
            color: zone.color_hex,
            valid_until: zone.valid_until,
          },
        };
      }),
    };

    return NextResponse.json(featureCollection);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/zones — Crear una nueva zona táctica mediante la RPC PostGIS
export async function POST(request: NextRequest) {
  try {
    const { authenticated, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo de la petición JSON inválido o malformado' }, { status: 400 });
    }

    const {
      name,
      description,
      severity,
      color_hex,
      geojson_geometry,
      valid_until,
    } = body;

    // Validación de campos obligatorios
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'El campo "name" es obligatorio.' }, { status: 400 });
    }

    const allowedSeverities = ['RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR'];
    if (!severity || !allowedSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `Severidad inválida: '${severity}'. Debe ser una de: ${allowedSeverities.join(', ')}.` },
        { status: 400 }
      );
    }

    if (!geojson_geometry) {
      return NextResponse.json(
        { error: 'El campo "geojson_geometry" con la geometría del polígono es obligatorio.' },
        { status: 400 }
      );
    }

    // Validación estricta del polígono GeoJSON antes de llamar a PostGIS
    const geoValidation = validateGeoJSONPolygon(geojson_geometry);
    if (!geoValidation.valid) {
      return NextResponse.json(
        { error: `Geometría GeoJSON inválida: ${geoValidation.error}` },
        { status: 400 }
      );
    }

    const geometryString = JSON.stringify(
      geojson_geometry.type === 'Feature' ? geojson_geometry.geometry : geojson_geometry
    );

    // Ejecutar RPC create_zone_with_geojson en PostGIS (organización resuelta por RLS/get_auth_org_id)
    const { data, error } = await supabase.rpc('create_zone_with_geojson', {
      p_name: name.trim(),
      p_description: description ? description.trim() : null,
      p_severity: severity,
      p_color_hex: color_hex || null,
      p_geojson: geometryString,
      p_valid_until: valid_until || null,
    });

    if (error) {
      // Devolver error de Postgres controlado sin fallback silencioso
      return NextResponse.json(
        { error: `Error al crear zona en base de datos: ${error.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, zone: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
