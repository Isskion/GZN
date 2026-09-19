// ==============================================================================
// GZN — API ROUTE: MODIFICACIÓN, DETALLE Y CONTROL DE ZONAS (/api/profiles/[id])
// ==============================================================================
// 1. GET: Consulta individual de perfil con zonas bajo control (RSO) o exclusiones (CONTROL_TOWER).
// 2. PATCH: Modificación de datos y sincronización completa de control de zonas:
//    - RSO: Sincronización de zones.assigned_rso_id (reasignación sin bloquear + liberación de no seleccionadas).
//    - CONTROL_TOWER: Sincronización de zone_control_exclusions (lista de exclusión de visibilidad total).
//    - Cambio de rol: Limpieza automática de zonas asignadas o exclusiones huérfanas.
//    - Anti-Autoescalamiento y Anti-Autobloqueo bajo estricto RLS.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROLE_LEVELS, UserRole } from '@/types/database';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { authenticated, user, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !user || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión activa'}` },
        { status: 401 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const targetUserId = resolvedParams.id;

    if (!targetUserId) {
      return NextResponse.json({ error: 'ID de perfil no especificado' }, { status: 400 });
    }

    // Consulta del perfil bajo RLS del cliente de sesión
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, organization_id, full_name, email, role, role_level, phone, emergency_contact, supervising_rso_id, is_active, created_at, updated_at')
      .eq('id', targetUserId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Perfil no encontrado o fuera de su alcance jerárquico' },
        { status: 404 }
      );
    }

    let controlledZoneIds: string[] = [];
    let excludedZoneIds: string[] = [];

    // Se utiliza adminClient acotado a la organización para que la RLS de zones
    // no oculte las zonas de un RSO al ser consultadas por otro RSO del mismo rango.
    const adminClient = createAdminClient();

    // Zonas asignadas si es Oficial RSO
    if (profile.role === 'RSO') {
      const { data: assignedZones } = await adminClient
        .from('zones')
        .select('id')
        .eq('assigned_rso_id', targetUserId)
        .eq('organization_id', profile.organization_id);
      controlledZoneIds = (assignedZones || []).map((z: any) => z.id);
    }

    // Zonas excluidas si es Torre de Control
    if (profile.role === 'CONTROL_TOWER') {
      const { data: exclusions } = await adminClient
        .from('zone_control_exclusions')
        .select('zone_id')
        .eq('profile_id', targetUserId);
      excludedZoneIds = (exclusions || []).map((e: any) => e.zone_id);
    }

    const responseData = {
      ...profile,
      controlled_zone_ids: controlledZoneIds,
      excluded_zone_ids: excludedZoneIds,
    };

    return NextResponse.json({ data: responseData, profile: responseData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { authenticated, user, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !user || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión activa'}` },
        { status: 401 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const targetUserId = resolvedParams.id;

    if (!targetUserId) {
      return NextResponse.json({ error: 'ID de perfil no especificado' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // 1. Consultar perfil del invocador
    const { data: callerProfile, error: callerError } = await adminClient
      .from('profiles')
      .select('id, organization_id, full_name, role, role_level')
      .eq('id', user.id)
      .single();

    if (callerError || !callerProfile) {
      return NextResponse.json(
        { error: 'Perfil de usuario invocador no encontrado' },
        { status: 403 }
      );
    }

    // 2. Consultar perfil objetivo
    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json(
        { error: 'Perfil de usuario no localizado en el sistema' },
        { status: 404 }
      );
    }

    // 3. Aislamiento de Organización (Multi-Tenant)
    if (targetProfile.organization_id !== callerProfile.organization_id) {
      return NextResponse.json(
        { error: 'No autorizado: El perfil pertenece a otra organización' },
        { status: 404 }
      );
    }

    const isSelf = callerProfile.id === targetProfile.id;

    // 4. Jerarquía de Autoridad
    if (!isSelf) {
      // Para editar a otro usuario se requiere rango de mando (role_level >= 60)
      if (callerProfile.role_level < 60) {
        return NextResponse.json(
          { error: 'Acceso denegado: Se requiere rango mínimo de RSO para modificar perfiles ajenos' },
          { status: 403 }
        );
      }

      // Un rol no puede editar a usuarios con nivel superior al suyo
      if (targetProfile.role_level > callerProfile.role_level) {
        return NextResponse.json(
          {
            error: `Infracción jerárquica: Su nivel (${callerProfile.role_level}) no le autoriza a gestionar a un usuario de nivel superior (${targetProfile.role_level})`,
          },
          { status: 403 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const profileUpdates: Record<string, any> = {};
    const authUpdates: Record<string, any> = {};

    // 5. Control de Reglas Anti-Autoescalamiento y Anti-Autobloqueo
    if (isSelf) {
      if (body.role && body.role !== targetProfile.role) {
        return NextResponse.json(
          { error: 'Infracción de seguridad: No está autorizado a alterar su propio rol de usuario' },
          { status: 403 }
        );
      }

      if (body.role_level && body.role_level !== targetProfile.role_level) {
        return NextResponse.json(
          { error: 'Infracción de seguridad: No está autorizado a alterar su propio nivel jerárquico' },
          { status: 403 }
        );
      }

      if (body.is_active === false) {
        return NextResponse.json(
          { error: 'Operación denegada: No puede desactivar su propia cuenta de acceso' },
          { status: 400 }
        );
      }
    }

    // 6. Validación de Cambio de Rol para subordinados
    if (body.role && body.role !== targetProfile.role) {
      const validRoles: UserRole[] = ['ORG_ADMIN', 'CONTROL_TOWER', 'RSO', 'OPERATOR'];
      if (!validRoles.includes(body.role)) {
        return NextResponse.json(
          { error: `Rol no válido. Debe ser uno de: ${validRoles.join(', ')}` },
          { status: 400 }
        );
      }

      const newRoleLevel = ROLE_LEVELS[body.role as UserRole];

      // El nuevo rol no puede exceder el nivel del invocador
      if (newRoleLevel > callerProfile.role_level) {
        return NextResponse.json(
          {
            error: `Infracción jerárquica: No puede promover a un usuario a un rol (${body.role} - Nivel ${newRoleLevel}) superior a su propio rango (${callerProfile.role} - Nivel ${callerProfile.role_level})`,
          },
          { status: 403 }
        );
      }

      profileUpdates.role = body.role;
      profileUpdates.role_level = newRoleLevel;
    }

    const previousRole = targetProfile.role;
    const effectiveRole = profileUpdates.role || targetProfile.role;

    // 7. Modificación de Datos de Contacto y Metadatos
    if (typeof body.full_name === 'string' && body.full_name.trim()) {
      profileUpdates.full_name = body.full_name.trim();
      authUpdates.user_metadata = {
        ...((await adminClient.auth.admin.getUserById(targetProfile.id)).data.user?.user_metadata || {}),
        full_name: body.full_name.trim(),
      };
    }

    if (typeof body.phone !== 'undefined') {
      profileUpdates.phone = body.phone ? String(body.phone).trim() : null;
    }

    if (typeof body.emergency_contact !== 'undefined') {
      profileUpdates.emergency_contact = body.emergency_contact
        ? String(body.emergency_contact).trim()
        : null;
    }

    if (typeof body.is_active === 'boolean') {
      profileUpdates.is_active = body.is_active;
    }

    // 8. Validación de Supervisor RSO (solo para operadores)
    if (effectiveRole === 'OPERATOR') {
      if (typeof body.supervising_rso_id !== 'undefined') {
        if (body.supervising_rso_id === null || body.supervising_rso_id === '') {
          profileUpdates.supervising_rso_id = null;
        } else {
          const { data: supervisor } = await adminClient
            .from('profiles')
            .select('id, organization_id, role_level')
            .eq('id', body.supervising_rso_id)
            .eq('organization_id', callerProfile.organization_id)
            .gte('role_level', 60)
            .single();

          if (!supervisor) {
            return NextResponse.json(
              { error: 'El Oficial RSO asignado no es válido o no pertenece a su organización' },
              { status: 400 }
            );
          }
          profileUpdates.supervising_rso_id = supervisor.id;
        }
      }
    } else {
      // Si el rol ya no es OPERATOR, se limpia el supervisor
      profileUpdates.supervising_rso_id = null;
    }

    // 9. Actualización de Credenciales en Auth si procede (email o password)
    if (body.password && typeof body.password === 'string') {
      if (body.password.length < 8) {
        return NextResponse.json(
          { error: 'La nueva contraseña debe tener un mínimo de 8 caracteres' },
          { status: 400 }
        );
      }
      authUpdates.password = body.password;
    }

    if (body.email && typeof body.email === 'string' && body.email.includes('@')) {
      const normalizedEmail = body.email.trim().toLowerCase();
      if (normalizedEmail !== targetProfile.email) {
        authUpdates.email = normalizedEmail;
        profileUpdates.email = normalizedEmail;
      }
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authErr } = await adminClient.auth.admin.updateUserById(targetUserId, authUpdates);
      if (authErr) {
        return NextResponse.json(
          { error: `Error al sincronizar credenciales de usuario: ${authErr.message}` },
          { status: 400 }
        );
      }
    }

    // 10. Persistir Cambios en public.profiles usando el cliente de sesión (ejercita la política RLS UPDATE de la migración 013)
    profileUpdates.updated_at = new Date().toISOString();

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', targetUserId)
      .select('id, organization_id, full_name, email, role, role_level, phone, emergency_contact, supervising_rso_id, is_active, created_at, updated_at')
      .single();

    if (updateError || !updatedProfile) {
      return NextResponse.json(
        { error: `Error al actualizar perfil: ${updateError?.message || 'Error desconocido'}` },
        { status: 500 }
      );
    }

    let finalControlledZoneIds: string[] = [];
    let finalExcludedZoneIds: string[] = [];

    // 11. SINCRONIZACIÓN DE ZONAS BAJO CONTROL (Oficial RSO)
    if (effectiveRole === 'RSO') {
      if (typeof body.controlled_zone_ids !== 'undefined' && Array.isArray(body.controlled_zone_ids)) {
        // Validar que todas las zonas enviadas pertenezcan a la organización del tenant (con adminClient para evitar ceguera RLS)
        const { data: validZones } = await adminClient
          .from('zones')
          .select('id')
          .eq('organization_id', callerProfile.organization_id)
          .in('id', body.controlled_zone_ids);
        const newZoneIds: string[] = (validZones || []).map((z: any) => z.id);

        // Consultar zonas asignadas actualmente a este RSO (con adminClient para ver las asignadas aunque el invocador sea otro RSO)
        const { data: currentAssigned } = await adminClient
          .from('zones')
          .select('id')
          .eq('assigned_rso_id', targetUserId)
          .eq('organization_id', callerProfile.organization_id);
        const currentZoneIds: string[] = (currentAssigned || []).map((z: any) => z.id);

        // Zonas que eran suyas y ya no están en controlled_zone_ids -> liberar (assigned_rso_id = NULL)
        const toUnassign = currentZoneIds.filter((id) => !newZoneIds.includes(id));
        if (toUnassign.length > 0) {
          await supabase
            .from('zones')
            .update({ assigned_rso_id: null, updated_at: new Date().toISOString() })
            .in('id', toUnassign)
            .eq('organization_id', callerProfile.organization_id);
        }

        // Zonas que se le asignan nuevas -> assigned_rso_id = targetUserId (reasignación sin bloquear)
        const toAssign = newZoneIds.filter((id) => !currentZoneIds.includes(id));
        if (toAssign.length > 0) {
          await supabase
            .from('zones')
            .update({ assigned_rso_id: targetUserId, updated_at: new Date().toISOString() })
            .in('id', toAssign)
            .eq('organization_id', callerProfile.organization_id);
        }

        finalControlledZoneIds = newZoneIds;
      } else {
        // Mantener las asignaciones actuales si no se enviaron cambios
        const { data: currentAssigned } = await adminClient
          .from('zones')
          .select('id')
          .eq('assigned_rso_id', targetUserId)
          .eq('organization_id', callerProfile.organization_id);
        finalControlledZoneIds = (currentAssigned || []).map((z: any) => z.id);
      }
    } else if (previousRole === 'RSO' && effectiveRole !== 'RSO') {
      // Si deja de ser RSO, liberar todas sus zonas asignadas
      await supabase
        .from('zones')
        .update({ assigned_rso_id: null, updated_at: new Date().toISOString() })
        .eq('assigned_rso_id', targetUserId)
        .eq('organization_id', callerProfile.organization_id);
    }

    // 12. SINCRONIZACIÓN DE EXCLUSIONES DE CONTROL (Torre de Control)
    if (effectiveRole === 'CONTROL_TOWER') {
      if (typeof body.excluded_zone_ids !== 'undefined' && Array.isArray(body.excluded_zone_ids)) {
        // Validar que las zonas existan en la organización
        const { data: validZones } = await adminClient
          .from('zones')
          .select('id')
          .eq('organization_id', callerProfile.organization_id)
          .in('id', body.excluded_zone_ids);
        const validExcludedIds: string[] = (validZones || []).map((z: any) => z.id);

        // Sincronización completa: purgar exclusiones anteriores de este usuario
        await supabase
          .from('zone_control_exclusions')
          .delete()
          .eq('profile_id', targetUserId);

        // Insertar conjunto nuevo de exclusiones
        if (validExcludedIds.length > 0) {
          const rows = validExcludedIds.map((zid) => ({
            profile_id: targetUserId,
            zone_id: zid,
          }));
          await supabase
            .from('zone_control_exclusions')
            .insert(rows);
        }

        finalExcludedZoneIds = validExcludedIds;
      } else {
        const { data: currentExclusions } = await adminClient
          .from('zone_control_exclusions')
          .select('zone_id')
          .eq('profile_id', targetUserId);
        finalExcludedZoneIds = (currentExclusions || []).map((e: any) => e.zone_id);
      }
    } else if (previousRole === 'CONTROL_TOWER' && effectiveRole !== 'CONTROL_TOWER') {
      // Si deja de ser CONTROL_TOWER, purgar todas sus exclusiones
      await supabase
        .from('zone_control_exclusions')
        .delete()
        .eq('profile_id', targetUserId);
    }

    // 13. Registro de Auditoría DPIA
    await logAuditEvent(adminClient, {
      organization_id: callerProfile.organization_id,
      performed_by: user.id,
      action: 'USER_UPDATED',
      entity_type: 'PROFILE',
      entity_id: updatedProfile.id,
      payload: {
        target_user: updatedProfile.full_name,
        target_role: updatedProfile.role,
        target_role_level: updatedProfile.role_level,
        changes: profileUpdates,
        controlled_zone_ids: effectiveRole === 'RSO' ? finalControlledZoneIds : undefined,
        excluded_zone_ids: effectiveRole === 'CONTROL_TOWER' ? finalExcludedZoneIds : undefined,
      },
    });

    const responseProfile = {
      ...updatedProfile,
      controlled_zone_ids: finalControlledZoneIds,
      excluded_zone_ids: finalExcludedZoneIds,
    };

    return NextResponse.json({
      data: responseProfile,
      profile: responseProfile,
      message: `Perfil de ${updatedProfile.full_name} actualizado correctamente`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
