// ==============================================================================
// GZN — API ROUTE: GESTIÓN INDIVIDUAL DE VIAJEROS (/api/travelers/[id])
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { hashDeviceSecret } from '@/lib/auth/device';
import { logAuditEvent, AuditAction } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/travelers/[id] — Obtener ficha individual táctica del viajero
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
        { error: 'Identificador de viajero inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // Regla de Oro: device_secret_hash NUNCA se proyecta ni se devuelve en respuestas de lectura
    const { data: traveler, error } = await supabase
      .from('travelers')
      .select(`
        id,
        organization_id,
        assigned_zone_id,
        assigned_rso_id,
        user_id,
        full_name,
        email,
        phone,
        callsign,
        status,
        last_latitude,
        last_longitude,
        position_source,
        last_ping_at,
        battery_level,
        created_at,
        updated_at,
        assigned_zone:zones!assigned_zone_id (
          id,
          name,
          severity,
          color_hex,
          zone_type,
          assigned_rso_id,
          assigned_rso:profiles!assigned_rso_id (id, full_name, role, phone)
        ),
        assigned_rso:profiles!assigned_rso_id (id, full_name, role, phone)
      `)
      .eq('id', id)
      .single();

    if (error || !traveler) {
      return NextResponse.json(
        { error: 'Viajero no encontrado o no accesible para su organización.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ traveler });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH /api/travelers/[id] — Modificar datos de personal o rotar credencial de hardware
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
        { error: 'Identificador de viajero inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // Control de Acceso Estricto RBAC (Mandato Claude: validación de perfil activo 'is_active = true')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para modificar datos de viajeros.' },
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

    // Mandato Claude: status NO es editable por este endpoint para preservar la lógica multi-incidente de B1
    if (body.status !== undefined) {
      return NextResponse.json(
        {
          error: 'El campo "status" no es modificable manualmente por este endpoint para preservar la lógica preventiva multi-incidente. El estado táctico se actualiza automáticamente mediante telemetría o resolviendo alertas en /api/alerts/[id].',
        },
        { status: 400 }
      );
    }

    // 1. Obtener datos actuales del viajero (RLS garantiza pertenencia)
    const { data: currentTraveler, error: fetchError } = await supabase
      .from('travelers')
      .select('id, organization_id, full_name, phone, email, callsign, assigned_zone_id, assigned_rso_id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !currentTraveler) {
      return NextResponse.json(
        { error: 'Viajero no encontrado o no accesible para su organización.' },
        { status: 404 }
      );
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.full_name !== undefined) {
      if (typeof body.full_name !== 'string' || body.full_name.trim() === '') {
        return NextResponse.json({ error: 'El campo "full_name" no puede estar vacío.' }, { status: 400 });
      }
      updates.full_name = body.full_name.trim();
    }

    if (body.phone !== undefined) {
      if (typeof body.phone !== 'string' || body.phone.trim() === '') {
        return NextResponse.json({ error: 'El campo "phone" no puede estar vacío.' }, { status: 400 });
      }
      updates.phone = body.phone.trim();
    }

    if (body.email !== undefined) {
      updates.email = body.email ? String(body.email).trim() : null;
    }

    if (body.callsign !== undefined) {
      updates.callsign = body.callsign ? String(body.callsign).trim() : null;
    }

    // Reasignación ágil de zona de seguridad
    if (body.assigned_zone_id !== undefined) {
      if (body.assigned_zone_id === null || body.assigned_zone_id === '') {
        updates.assigned_zone_id = null;
        if (body.assigned_rso_id === undefined) {
          updates.assigned_rso_id = null;
        }
      } else {
        if (!UUID_REGEX.test(body.assigned_zone_id)) {
          return NextResponse.json({ error: 'assigned_zone_id debe ser un UUID válido.' }, { status: 400 });
        }
        // Validación con cliente administrativo para evitar que la RLS de zones (015)
        // impida a un RSO reasignar viajeros a zonas de otros RSOs dentro de su organización.
        // Tenant isolation garantizado explícitamente mediante .eq('organization_id', currentTraveler.organization_id).
        const adminClient = createAdminClient();
        const { data: targetZone, error: zoneError } = await adminClient
          .from('zones')
          .select('id, organization_id, assigned_rso_id')
          .eq('id', body.assigned_zone_id)
          .eq('organization_id', currentTraveler.organization_id)
          .single();

        if (zoneError || !targetZone) {
          return NextResponse.json(
            { error: 'La zona asignada no existe o no pertenece a su organización.' },
            { status: 400 }
          );
        }
        updates.assigned_zone_id = targetZone.id;
        if (body.assigned_rso_id === undefined) {
          updates.assigned_rso_id = targetZone.assigned_rso_id || null;
        }
      }
    }

    if (body.assigned_rso_id !== undefined) {
      if (body.assigned_rso_id && !UUID_REGEX.test(body.assigned_rso_id)) {
        return NextResponse.json({ error: 'assigned_rso_id debe ser un UUID válido.' }, { status: 400 });
      }
      updates.assigned_rso_id = body.assigned_rso_id || null;
    }

    if (body.user_id !== undefined) {
      if (body.user_id && !UUID_REGEX.test(body.user_id)) {
        return NextResponse.json({ error: 'user_id debe ser un UUID válido.' }, { status: 400 });
      }
      updates.user_id = body.user_id || null;
    }

    // Reposicionamiento manual por el RSO (Decisión Daniel / Claude)
    if (body.last_latitude !== undefined || body.last_longitude !== undefined) {
      const lat = body.last_latitude;
      const lon = body.last_longitude;
      if (
        typeof lat !== 'number' ||
        typeof lon !== 'number' ||
        isNaN(lat) ||
        isNaN(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return NextResponse.json(
          { error: 'Coordenadas geodésicas inválidas. last_latitude debe estar en [-90, 90] y last_longitude en [-180, 180].' },
          { status: 400 }
        );
      }
      updates.last_latitude = Number(lat);
      updates.last_longitude = Number(lon);
      updates.position_source = 'MANUAL_RSO';
      updates.last_ping_at = new Date().toISOString();
    }

    // 2. Rotación de Credencial de Hardware (Mandato Claude)
    let newRawSecret: string | null = null;
    const isRotating = body.rotate_device_secret === true;

    if (isRotating) {
      newRawSecret = crypto.randomBytes(32).toString('hex');
      updates.device_secret_hash = hashDeviceSecret(newRawSecret);
    }

    // 3. Ejecutar actualización en Supabase
    const { data: updatedTraveler, error: updateError } = await supabase
      .from('travelers')
      .update(updates)
      .eq('id', id)
      .select(`
        id,
        organization_id,
        assigned_zone_id,
        assigned_rso_id,
        user_id,
        full_name,
        email,
        phone,
        callsign,
        status,
        last_latitude,
        last_longitude,
        position_source,
        last_ping_at,
        battery_level,
        created_at,
        updated_at,
        assigned_zone:zones!assigned_zone_id (
          id,
          name,
          severity,
          color_hex,
          zone_type,
          assigned_rso_id,
          assigned_rso:profiles!assigned_rso_id (id, full_name, role, phone)
        )
      `)
      .single();

    if (updateError || !updatedTraveler) {
      return NextResponse.json(
        { error: updateError?.message || 'Error al actualizar el viajero.' },
        { status: 500 }
      );
    }

    // 4. Registro forense en audit_logs diferenciando rotación vs modificación (Mandato Claude)
    const auditAction: AuditAction = isRotating ? 'TRAVELER_CREDENTIAL_ROTATED' : 'TRAVELER_MODIFIED';

    await logAuditEvent(supabase, {
      organization_id: currentTraveler.organization_id,
      performed_by: user.id,
      action: auditAction,
      entity_type: 'TRAVELER',
      entity_id: id,
      payload: {
        traveler_name: updates.full_name ?? currentTraveler.full_name,
        updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at' && k !== 'device_secret_hash'),
        credential_rotated: isRotating,
        previous_zone_id: currentTraveler.assigned_zone_id,
        new_zone_id: updates.assigned_zone_id !== undefined ? updates.assigned_zone_id : currentTraveler.assigned_zone_id,
      },
    });

    return NextResponse.json({
      success: true,
      traveler: updatedTraveler,
      new_device_secret: newRawSecret || undefined,
      warning: newRawSecret
        ? 'ATENCIÓN: Se ha generado una nueva credencial criptográfica. La anterior ha sido revocada. Cargue este secreto inmediatamente en el terminal móvil.'
        : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/travelers/[id] — Retirada o baja de viajero (soft deactivation por defecto, 409 con alertas)
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
        { error: 'Identificador de viajero inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // Control de Acceso Estricto RBAC (Mandato Claude: validación de perfil activo 'is_active = true')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para dar de baja viajeros.' },
        { status: 403 }
      );
    }

    // 1. Obtener viajero actual
    const { data: traveler, error: fetchError } = await supabase
      .from('travelers')
      .select('id, organization_id, full_name, callsign, status')
      .eq('id', id)
      .single();

    if (fetchError || !traveler) {
      return NextResponse.json(
        { error: 'Viajero no encontrado o no accesible para su organización.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isPermanent = searchParams.get('permanent') === 'true';

    if (isPermanent) {
      // Comprobación explícita de alertas vinculadas antes del borrado físico (Mandato Claude)
      const { count: linkedAlertsCount, error: countError } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('traveler_id', id);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if (linkedAlertsCount && linkedAlertsCount > 0) {
        return NextResponse.json(
          {
            error: `No se puede eliminar físicamente al viajero "${traveler.full_name}": existen ${linkedAlertsCount} alertas de seguridad vinculadas que constituyen evidencia forense histórica (DPIA / RGPD Art. 35). Utilice baja táctica (desactivación).`,
          },
          { status: 409 }
        );
      }

      // Borrado físico si no tiene alertas vinculadas (apoyado en RLS de DELETE de migración 005)
      const { error: deleteError } = await supabase
        .from('travelers')
        .delete()
        .eq('id', id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    } else {
      // Baja táctica (soft deactivation por defecto): revocar credencial de hardware y marcar INCOMMUNICADO
      const { error: softError } = await supabase
        .from('travelers')
        .update({
          status: 'INCOMMUNICADO',
          device_secret_hash: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (softError) {
        return NextResponse.json({ error: softError.message }, { status: 500 });
      }
    }

    // Registro forense inmutable en public.audit_logs
    await logAuditEvent(supabase, {
      organization_id: traveler.organization_id,
      performed_by: user.id,
      action: 'TRAVELER_DELETED',
      entity_type: 'TRAVELER',
      entity_id: id,
      payload: {
        deletion_type: isPermanent ? 'hard' : 'soft',
        traveler_name: traveler.full_name,
        callsign: traveler.callsign,
      },
    });

    return NextResponse.json({
      success: true,
      message: isPermanent
        ? `Viajero "${traveler.full_name}" eliminado físicamente de forma permanente.`
        : `Viajero "${traveler.full_name}" dado de baja tácticamente (credencial revocada, status=INCOMMUNICADO).`,
      deletion_type: isPermanent ? 'hard' : 'soft',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
