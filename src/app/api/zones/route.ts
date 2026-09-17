// ==============================================================================
// GZN — API ROUTE: ZONAS TÁCTICAS (CRUD GeoJSON & PostGIS)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { validateGeoJSONPolygon, validateZoneEnhancements } from '@/lib/geo/validation';
import { logAuditEvent } from '@/lib/audit/logger';

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
      .select(`
        id, organization_id, assigned_rso_id, zone_type, name, description, severity, color_hex,
        buffer_meters, is_curfew, curfew_start, curfew_end, contact_phone, radio_frequency,
        gate_access_protocol, valid_until, geom
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Error al consultar zonas: ${error.message}` },
        { status: 500 }
      );
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
            assigned_rso_id: zone.assigned_rso_id ?? null,
            zone_type: zone.zone_type ?? 'THREAT',
            name: zone.name,
            description: zone.description,
            severity: zone.severity,
            color: zone.color_hex,
            buffer_meters: zone.buffer_meters ?? 0,
            is_curfew: zone.is_curfew ?? false,
            curfew_start: zone.curfew_start ?? null,
            curfew_end: zone.curfew_end ?? null,
            contact_phone: zone.contact_phone ?? null,
            radio_frequency: zone.radio_frequency ?? null,
            gate_access_protocol: zone.gate_access_protocol ?? null,
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
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

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
      buffer_meters,
      is_curfew,
      curfew_start,
      curfew_end,
      contact_phone,
      radio_frequency,
      gate_access_protocol,
      assigned_rso_id,
      zone_type: rawZoneType,
    } = body;

    const zone_type = rawZoneType === 'RESPONSIBILITY' ? 'RESPONSIBILITY' : 'THREAT';

    // Validación de campos obligatorios
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'El campo "name" es obligatorio.' }, { status: 400 });
    }

    let resolvedSeverity = severity;
    if (zone_type === 'RESPONSIBILITY') {
      if (!assigned_rso_id) {
        return NextResponse.json(
          { error: 'Para zonas de responsabilidad operativa (RESPONSIBILITY) es obligatorio asignar un RSO.' },
          { status: 400 }
        );
      }
      resolvedSeverity = 'OPERATIONAL';
    } else {
      const allowedSeverities = ['RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR'];
      if (!resolvedSeverity || !allowedSeverities.includes(resolvedSeverity)) {
        return NextResponse.json(
          { error: `Severidad inválida para zona de peligro: '${resolvedSeverity}'. Debe ser una de: ${allowedSeverities.join(', ')}.` },
          { status: 400 }
        );
      }
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

    // Validación de parámetros tácticos adicionales (buffer, curfew, safe haven)
    const enhancementsValidation = validateZoneEnhancements({
      buffer_meters,
      is_curfew,
      curfew_start,
      curfew_end,
      contact_phone,
      radio_frequency,
      gate_access_protocol,
    });

    if (!enhancementsValidation.valid) {
      return NextResponse.json(
        { error: `Parámetros tácticos de zona inválidos: ${enhancementsValidation.error}` },
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
      p_severity: resolvedSeverity,
      p_color_hex: zone_type === 'RESPONSIBILITY' ? '#5980a6' : (color_hex || null),
      p_geojson: geometryString,
      p_valid_until: valid_until || null,
      p_buffer_meters: buffer_meters !== undefined ? buffer_meters : 0,
      p_is_curfew: is_curfew !== undefined ? is_curfew : false,
      p_curfew_start: curfew_start || null,
      p_curfew_end: curfew_end || null,
      p_contact_phone: contact_phone ? String(contact_phone).trim() : null,
      p_radio_frequency: radio_frequency ? String(radio_frequency).trim() : null,
      p_gate_access_protocol: gate_access_protocol ? String(gate_access_protocol).trim() : null,
      p_assigned_rso_id: assigned_rso_id || null,
      p_zone_type: zone_type,
    });

    if (error) {
      const isForbidden = error.message?.includes('Rol insuficiente');
      return NextResponse.json(
        { error: `Error al crear zona: ${error.message}` },
        { status: isForbidden ? 403 : 400 }
      );
    }

    // Registrar evento inmutable en public.audit_logs (Trazabilidad DPIA / RGPD Art. 35)
    await logAuditEvent(supabase, {
      organization_id: data.organization_id,
      performed_by: user?.id || null,
      action: 'ZONE_CREATED',
      entity_type: 'ZONE',
      entity_id: data.id,
      payload: {
        name: data.name,
        zone_type: data.zone_type,
        severity: data.severity,
        assigned_rso_id: data.assigned_rso_id || null,
        buffer_meters: data.buffer_meters,
        is_curfew: data.is_curfew,
        curfew_start: data.curfew_start,
        curfew_end: data.curfew_end,
        contact_phone: data.contact_phone,
        radio_frequency: data.radio_frequency,
        gate_access_protocol: data.gate_access_protocol,
        valid_until: data.valid_until,
      },
    });

    return NextResponse.json({ success: true, zone: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
