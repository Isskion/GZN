import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/zones — Obtener zonas activas (formato GeoJSON para MapLibre GL)
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organization_id');

    let query = supabase
      .from('zones')
      .select('id, organization_id, name, description, severity, color_hex, valid_from, valid_until, is_active, created_at, geom')
      .eq('is_active', true);

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: zones, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convertir a GeoJSON FeatureCollection para visualización directa en MapLibre
    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (zones || []).map((zone: any) => ({
        type: 'Feature',
        id: zone.id,
        geometry: typeof zone.geom === 'string' ? JSON.parse(zone.geom) : zone.geom,
        properties: {
          id: zone.id,
          name: zone.name,
          description: zone.description,
          severity: zone.severity,
          color: zone.color_hex,
          valid_until: zone.valid_until,
        },
      })),
    };

    return NextResponse.json(featureCollection);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/zones — Crear una nueva zona con geometría GeoJSON
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const {
      organization_id,
      name,
      description,
      severity,
      color_hex,
      geojson_geometry, // Objeto GeoJSON Polygon
      valid_until,
    } = body;

    if (!organization_id || !name || !severity || !geojson_geometry) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: organization_id, name, severity, geojson_geometry' },
        { status: 400 }
      );
    }

    const geometryString = JSON.stringify(geojson_geometry);

    // Insertar usando ST_GeomFromGeoJSON para validar y almacenar la geometría en SRID 4326
    const { data, error } = await supabase.rpc('create_zone_with_geojson', {
      p_org_id: organization_id,
      p_name: name,
      p_description: description || null,
      p_severity: severity,
      p_color_hex: color_hex || (severity === 'RED' ? '#EF4444' : severity === 'AMBER' ? '#F59E0B' : '#10B981'),
      p_geojson: geometryString,
      p_valid_until: valid_until || null,
    });

    if (error) {
      // Fallback a inserción directa si el helper RPC no existe todavía
      const { data: directData, error: directError } = await supabase
        .from('zones')
        .insert({
          organization_id,
          name,
          description,
          severity,
          color_hex: color_hex || (severity === 'RED' ? '#EF4444' : severity === 'AMBER' ? '#F59E0B' : '#10B981'),
          geom: geojson_geometry,
          valid_until: valid_until || null,
        })
        .select()
        .single();

      if (directError) {
        return NextResponse.json({ error: directError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, zone: directData }, { status: 201 });
    }

    return NextResponse.json({ success: true, zone: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
