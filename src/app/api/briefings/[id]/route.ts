// ==============================================================================
// GZN — API ROUTE: BRIEFING INDIVIDUAL TÁCTICO (Detalle, Modificación y Baja)
// ==============================================================================
// GET /api/briefings/[id]    — Detalle con POIs (Staff y Hardware)
// PATCH /api/briefings/[id]  — Actualización táctica y sustitución atómica de POIs (RSO/Admin)
// DELETE /api/briefings/[id] — Retirada de briefing y borrado en cascada (RSO/Admin)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { verifyDeviceAuth } from '@/lib/auth/device';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit/logger';
import { validatePoi } from '../route';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/briefings/[id] — Detalle individual con POIs (Autenticación Dual)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id || id.trim() === '') {
      return NextResponse.json({ error: 'Identificador de briefing no proporcionado' }, { status: 400 });
    }

    const hasDeviceSecret = request.headers.has('x-device-secret');
    let clientToUse: any;
    let orgId: string | null = null;

    if (hasDeviceSecret) {
      // Rama Hardware (Terminal Móvil)
      const travelerId = request.headers.get('x-traveler-id') || new URL(request.url).searchParams.get('traveler_id');
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
      // Rama Staff (Consola RSO)
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

      if (profileError || !profile || !['OPERATOR', 'RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
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
      .eq('id', id);

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: briefing, error: dbError } = await query.single();

    if (dbError || !briefing) {
      return NextResponse.json(
        { error: 'Briefing no encontrado o no pertenece a la organización autorizada.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, briefing });
  } catch (err: any) {
    console.error('Excepción no controlada en GET /api/briefings/[id]:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

// PATCH /api/briefings/[id] — Modificación y sustitución atómica de POIs (Transacción RPC)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id || id.trim() === '') {
      return NextResponse.json({ error: 'Identificador de briefing no proporcionado' }, { status: 400 });
    }

    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    // Control RBAC: Solo RSO, ORG_ADMIN o SUPER_ADMIN activo
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, organization_id, role, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para modificar briefings de misión.' },
        { status: 403 }
      );
    }

    // Verificar existencia previa del briefing en la organización
    const { data: existingBriefing, error: fetchError } = await supabase
      .from('briefings')
      .select('id, organization_id, title')
      .eq('id', id)
      .single();

    if (fetchError || !existingBriefing) {
      return NextResponse.json(
        { error: 'Briefing no encontrado o no pertenece a la organización del usuario.' },
        { status: 404 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo de la petición JSON inválido o malformado' }, { status: 400 });
    }

    const { title, welcome_message, protocol_instructions, pois } = body;
    const updates: Record<string, any> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        return NextResponse.json({ error: 'El campo "title" no puede estar vacío.' }, { status: 400 });
      }
      updates.title = title.trim();
    }

    if (welcome_message !== undefined) {
      updates.welcome_message = welcome_message ? String(welcome_message).trim() : null;
    }

    if (protocol_instructions !== undefined) {
      updates.protocol_instructions = protocol_instructions ? String(protocol_instructions).trim() : null;
    }

    // 1. Si se solicita sustitución de POIs, validar y ejecutar la RPC atómica
    let poisReplaced = false;
    if (pois !== undefined) {
      if (!Array.isArray(pois)) {
        return NextResponse.json({ error: 'El campo "pois" debe ser un array de puntos de interés.' }, { status: 400 });
      }

      for (let i = 0; i < pois.length; i++) {
        const val = validatePoi(pois[i], i);
        if (!val.valid) {
          return NextResponse.json({ error: val.error }, { status: 400 });
        }
      }

      const sanitizedPois = pois.map((p: any) => ({
        name: p.name.trim(),
        category: p.category,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        notes: p.notes?.trim() || null,
      }));

      // Invocación de la RPC atómica replace_briefing_pois (una sola transacción PostgreSQL)
      const { error: rpcError } = await supabase.rpc('replace_briefing_pois', {
        p_briefing_id: id,
        p_pois: sanitizedPois,
      });

      if (rpcError) {
        console.error('Error en RPC replace_briefing_pois durante PATCH:', rpcError);
        return NextResponse.json(
          { error: `Error al actualizar atómicamente los puntos de interés: ${rpcError.message}` },
          { status: 400 }
        );
      }

      poisReplaced = true;
    }

    // 2. Actualizar campos escalares si existen
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('briefings')
        .update(updates)
        .eq('id', id);

      if (updateError) {
        console.error('Error al actualizar campos del briefing:', updateError);
        return NextResponse.json({ error: 'Error al guardar los cambios del briefing.' }, { status: 500 });
      }
    }

    // 3. Auditoría DPIA
    await logAuditEvent(supabase, {
      organization_id: profile.organization_id,
      performed_by: user.id,
      action: 'BRIEFING_MODIFIED',
      entity_type: 'BRIEFING',
      entity_id: id,
      payload: {
        updated_fields: Object.keys(body),
        pois_replaced: poisReplaced,
      },
    });

    // 4. Devolver objeto completo actualizado
    const { data: updatedBriefing } = await supabase
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
      .eq('id', id)
      .single();

    return NextResponse.json({ success: true, briefing: updatedBriefing });
  } catch (err: any) {
    console.error('Excepción no controlada en PATCH /api/briefings/[id]:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

// DELETE /api/briefings/[id] — Retirada de briefing y borrado en cascada
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id || id.trim() === '') {
      return NextResponse.json({ error: 'Identificador de briefing no proporcionado' }, { status: 400 });
    }

    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    // Control RBAC: Solo RSO, ORG_ADMIN o SUPER_ADMIN
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, organization_id, role, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para eliminar briefings de misión.' },
        { status: 403 }
      );
    }

    // Verificar existencia del briefing
    const { data: existingBriefing, error: fetchError } = await supabase
      .from('briefings')
      .select('id, organization_id, title')
      .eq('id', id)
      .single();

    if (fetchError || !existingBriefing) {
      return NextResponse.json(
        { error: 'Briefing no encontrado o no pertenece a la organización del usuario.' },
        { status: 404 }
      );
    }

    // Eliminar briefing (POIs eliminados automáticamente por ON DELETE CASCADE)
    const { error: deleteError } = await supabase
      .from('briefings')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error al eliminar briefing:', deleteError);
      return NextResponse.json({ error: 'Error al eliminar el briefing de la base de datos.' }, { status: 500 });
    }

    // Auditoría DPIA
    await logAuditEvent(supabase, {
      organization_id: profile.organization_id,
      performed_by: user.id,
      action: 'BRIEFING_DELETED',
      entity_type: 'BRIEFING',
      entity_id: id,
      payload: {
        title: existingBriefing.title,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Briefing "${existingBriefing.title}" y sus puntos de interés asociados han sido eliminados correctamente.`,
    });
  } catch (err: any) {
    console.error('Excepción no controlada en DELETE /api/briefings/[id]:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
