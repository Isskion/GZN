// ==============================================================================
// GZN — API ROUTE: MODIFICACIÓN Y ESTADO DE PERFIL (/api/profiles/[id])
// ==============================================================================
// Control de Acceso y Jerarquía Estricta:
// 1. Aislamiento Multi-Tenant: Solo perfiles de la misma organización.
// 2. Techo Jerárquico: El invocador solo puede editar usuarios de nivel <= caller_role_level.
// 3. Anti-Autoescalamiento: Un usuario no puede alterar su propio rol ni role_level.
// 4. Anti-Autobloqueo: Un usuario no puede desactivar su propia cuenta (is_active = false).
// 5. Asignación de Roles: El nuevo rol asignado no puede exceder el nivel del invocador.
// 6. Registro de Auditoría DPIA: Evento inmutable USER_UPDATED en public.audit_logs.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROLE_LEVELS, UserRole } from '@/types/database';
import { logAuditEvent } from '@/lib/audit/logger';

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
    const effectiveRole = profileUpdates.role || targetProfile.role;
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

    // 11. Registro de Auditoría DPIA
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
      },
    });

    return NextResponse.json({
      data: updatedProfile,
      profile: updatedProfile,
      message: `Perfil de ${updatedProfile.full_name} actualizado correctamente`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
