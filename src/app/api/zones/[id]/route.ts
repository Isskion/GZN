// ==============================================================================
// GZN — API ROUTE: GESTIÓN INDIVIDUAL DE ZONAS TÁCTICAS (/api/zones/[id])
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { validateGeoJSONPolygon, validateZoneEnhancements } from '@/lib/geo/validation';
import { logAuditEvent } from '@/lib/audit/logger';
import { ZoneSeverity } from '@/types/database';

const ALLOWED_SEVERITIES: ZoneSeverity[] = ['RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/zones/[id] — Obtener detalle y geometría GeoJSON de una zona específica
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { authenticated, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Identificador de zona inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // Consulta con cliente de sesión: RLS filtra por pertenencia a la organización
    const { data: zone, error } = await supabase
      .from('zones')
      .select(`
        id, organization_id, created_by, name, description, severity, color_hex,
        buffer_meters, is_curfew, curfew_start, curfew_end, contact_phone, radio_frequency,
        gate_access_protocol, valid_from, valid_until, is_active, created_at, updated_at, geom
      `)
      .eq('id', id)
      .single();

    if (error || !zone) {
      return NextResponse.json(
        { error: 'Zona no encontrada o no accesible para su organización.' },
        { status: 404 }
      );
    }

    let geomObj: any = zone.geom;
    if (typeof zone.geom === 'string') {
      try {
        geomObj = JSON.parse(zone.geom);
      } catch {
        geomObj = null;
      }
    }

    const feature: GeoJSON.Feature = {
      type: 'Feature',
      id: zone.id,
      geometry: geomObj,
      properties: {
        id: zone.id,
        organization_id: zone.organization_id,
        created_by: zone.created_by,
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
        valid_from: zone.valid_from,
        valid_until: zone.valid_until,
        is_active: zone.is_active,
        created_at: zone.created_at,
        updated_at: zone.updated_at,
      },
    };

    return NextResponse.json({ zone: feature });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH /api/zones/[id] — Actualizar propiedades tácticas o geometría de una zona
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Identificador de zona inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // Control de Acceso Estricto RBAC (Mandato Claude: validar perfil activo 'is_active = true')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para modificar zonas tácticas.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Cuerpo de petición JSON inválido o malformado.' },
        { status: 400 }
      );
    }

    // 1. Obtener zona actual para validar existencia y capturar valores previos para auditoría
    const { data: currentZone, error: fetchError } = await supabase
      .from('zones')
      .select(`
        id, organization_id, name, description, severity, color_hex,
        buffer_meters, is_curfew, curfew_start, curfew_end, contact_phone,
        radio_frequency, gate_access_protocol, is_active, valid_until
      `)
      .eq('id', id)
      .single();

    if (fetchError || !currentZone) {
      return NextResponse.json(
        { error: 'Zona no encontrada o no accesible para su organización.' },
        { status: 404 }
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // 2. Validación de campos básicos
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json({ error: 'El campo "name" no puede estar vacío.' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.severity !== undefined) {
      if (!ALLOWED_SEVERITIES.includes(body.severity)) {
        return NextResponse.json(
          { error: `Severidad inválida: '${body.severity}'. Debe ser una de: ${ALLOWED_SEVERITIES.join(', ')}.` },
          { status: 400 }
        );
      }
      updates.severity = body.severity;
    }

    if (body.color_hex !== undefined) {
      if (typeof body.color_hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.color_hex)) {
        return NextResponse.json(
          { error: 'Formato color_hex inválido. Debe ser hexadecimal de 6 caracteres (ej. #EF4444).' },
          { status: 400 }
        );
      }
      updates.color_hex = body.color_hex;
    }

    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'El campo "is_active" debe ser booleano.' }, { status: 400 });
      }
      updates.is_active = body.is_active;
    }

    if (body.valid_until !== undefined) {
      updates.valid_until = body.valid_until ? new Date(body.valid_until).toISOString() : null;
    }

    // 3. Validación de parámetros tácticos (buffers, curfews, refugios)
    const enhancementsToValidate: any = {};
    if (body.buffer_meters !== undefined) enhancementsToValidate.buffer_meters = body.buffer_meters;
    if (body.is_curfew !== undefined) enhancementsToValidate.is_curfew = body.is_curfew;
    if (body.curfew_start !== undefined) enhancementsToValidate.curfew_start = body.curfew_start;
    if (body.curfew_end !== undefined) enhancementsToValidate.curfew_end = body.curfew_end;
    if (body.contact_phone !== undefined) enhancementsToValidate.contact_phone = body.contact_phone;
    if (body.radio_frequency !== undefined) enhancementsToValidate.radio_frequency = body.radio_frequency;
    if (body.gate_access_protocol !== undefined) enhancementsToValidate.gate_access_protocol = body.gate_access_protocol;

    if (Object.keys(enhancementsToValidate).length > 0) {
      const valResult = validateZoneEnhancements(enhancementsToValidate);
      if (!valResult.valid) {
        return NextResponse.json(
          { error: `Parámetros tácticos inválidos: ${valResult.error}` },
          { status: 400 }
        );
      }

      if (body.buffer_meters !== undefined) updates.buffer_meters = body.buffer_meters;
      if (body.is_curfew !== undefined) updates.is_curfew = body.is_curfew;
      if (body.curfew_start !== undefined) updates.curfew_start = body.curfew_start || null;
      if (body.curfew_end !== undefined) updates.curfew_end = body.curfew_end || null;
      if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone ? String(body.contact_phone).trim() : null;
      if (body.radio_frequency !== undefined) updates.radio_frequency = body.radio_frequency ? String(body.radio_frequency).trim() : null;
      if (body.gate_access_protocol !== undefined) updates.gate_access_protocol = body.gate_access_protocol ? String(body.gate_access_protocol).trim() : null;
    }

    // 4. Validación y actualización opcional de geometría GeoJSON
    if (body.geojson_geometry !== undefined) {
      const geoValidation = validateGeoJSONPolygon(body.geojson_geometry);
      if (!geoValidation.valid) {
        return NextResponse.json(
          { error: `Geometría GeoJSON inválida: ${geoValidation.error}` },
          { status: 400 }
        );
      }
      const geomObj = body.geojson_geometry.type === 'Feature' ? body.geojson_geometry.geometry : body.geojson_geometry;
      updates.geom = geomObj;
    }

    // 5. Ejecutar actualización en Supabase
    const { data: updatedZone, error: updateError } = await supabase
      .from('zones')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedZone) {
      return NextResponse.json(
        { error: updateError?.message || 'Error al actualizar la zona táctica.' },
        { status: 500 }
      );
    }

    // 6. Registro forense DPIA / RGPD Art. 35 en audit_logs
    await logAuditEvent(supabase, {
      organization_id: currentZone.organization_id,
      performed_by: user.id,
      action: 'ZONE_MODIFIED',
      entity_type: 'ZONE',
      entity_id: id,
      payload: {
        previous_values: {
          name: currentZone.name,
          severity: currentZone.severity,
          is_active: currentZone.is_active,
          buffer_meters: currentZone.buffer_meters,
          is_curfew: currentZone.is_curfew,
        },
        updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at'),
        zone_name: updates.name ?? currentZone.name,
      },
    });

    return NextResponse.json({ success: true, zone: updatedZone });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/zones/[id] — Retirar zona táctica (soft-delete por defecto, hard-delete opcional con salvaguarda forense)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Identificador de zona inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // Control de Acceso Estricto RBAC (Mandato Claude: validar perfil activo 'is_active = true')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para eliminar zonas tácticas.' },
        { status: 403 }
      );
    }

    // Obtener zona para comprobar existencia y pertenencia organizativa
    const { data: zone, error: fetchError } = await supabase
      .from('zones')
      .select('id, organization_id, name, severity, is_active')
      .eq('id', id)
      .single();

    if (fetchError || !zone) {
      return NextResponse.json(
        { error: 'Zona no encontrada o no accesible para su organización.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isPermanent = searchParams.get('permanent') === 'true';

    if (isPermanent) {
      // Comprobación explícita de alertas vinculadas antes del borrado físico (Sugerencia Claude)
      const { count: linkedAlertsCount, error: countError } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('zone_id', id);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if (linkedAlertsCount && linkedAlertsCount > 0) {
        return NextResponse.json(
          {
            error: `No se puede eliminar físicamente la zona "${zone.name}": existen ${linkedAlertsCount} alertas de seguridad vinculadas que constituyen evidencia forense histórica (DPIA / RGPD Art. 35). Utilice soft-delete (is_active=false).`,
          },
          { status: 409 }
        );
      }

      // Borrado físico sin alertas dependientes
      const { error: deleteError } = await supabase
        .from('zones')
        .delete()
        .eq('id', id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    } else {
      // Soft-delete táctico por defecto: desactivar zona
      const { error: softDeleteError } = await supabase
        .from('zones')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (softDeleteError) {
        return NextResponse.json({ error: softDeleteError.message }, { status: 500 });
      }
    }

    // Registro forense en audit_logs
    await logAuditEvent(supabase, {
      organization_id: zone.organization_id,
      performed_by: user.id,
      action: 'ZONE_DELETED',
      entity_type: 'ZONE',
      entity_id: id,
      payload: {
        deletion_type: isPermanent ? 'hard' : 'soft',
        zone_name: zone.name,
        severity: zone.severity,
      },
    });

    return NextResponse.json({
      success: true,
      message: isPermanent
        ? `Zona "${zone.name}" eliminada físicamente de forma permanente.`
        : `Zona "${zone.name}" retirada tácticamente (soft-delete, is_active=false).`,
      deletion_type: isPermanent ? 'hard' : 'soft',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
