// ==============================================================================
// GZN — API ROUTE: GESTIÓN DE PERFILES Y ALTA DE USUARIOS (/api/profiles)
// ==============================================================================
// - GET:
//   1. Por defecto (sin scope): Mantiene compatibilidad absoluta con selectores
//      de RSO (ZoneCreationModal, TravelerCreationModal), filtrando .gte('role_level', 60)
//      y retornando { data: profiles }.
//   2. Con ?scope=hierarchy: Modo gestión para PersonasScreen. Filtra perfiles de nivel
//      igual o inferior al usuario invocador (.lte('role_level', caller_level)), con soporte
//      de ?include_inactive=true y ?role=.
// - POST:
//   Alta atómica de usuario (auth.users + public.profiles).
//   Requiere rango de mando (role_level >= 60) y prohíbe crear roles de rango superior
//   al nivel jerárquico del invocador. Incluye rollback compensatorio y auditoría DPIA.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROLE_LEVELS, UserRole } from '@/types/database';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(request: NextRequest) {
  try {
    const { authenticated, user, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !user || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión activa'}` },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');

    // 1. MODO JERÁRQUICO EXPLÍCITO (Consola de Personas)
    if (scope === 'hierarchy') {
      // Consultar perfil del usuario autenticado con cliente de sesión (RLS activo)
      const { data: callerProfile, error: callerError } = await supabase
        .from('profiles')
        .select('id, organization_id, full_name, role, role_level')
        .eq('id', user.id)
        .single();

      if (callerError || !callerProfile) {
        return NextResponse.json(
          { error: 'Perfil de usuario invocador no encontrado en la organización' },
          { status: 403 }
        );
      }

      const includeInactive = searchParams.get('include_inactive') === 'true';
      const roleFilter = searchParams.get('role') as UserRole | null;

      let query = supabase
        .from('profiles')
        .select('id, organization_id, full_name, email, role, role_level, phone, emergency_contact, supervising_rso_id, is_active, created_at, updated_at')
        .lte('role_level', callerProfile.role_level);

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      if (roleFilter && Object.keys(ROLE_LEVELS).includes(roleFilter)) {
        query = query.eq('role', roleFilter);
      }

      const { data: profiles, error: queryError } = await query
        .order('role_level', { ascending: false })
        .order('full_name', { ascending: true });

      if (queryError) {
        return NextResponse.json(
          { error: `Error al consultar perfiles jerárquicos: ${queryError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        data: profiles || [],
        profiles: profiles || [],
        caller_role_level: callerProfile.role_level,
      });
    }

    // 2. MODO POR DEFECTO: Selectores de RSO en producción (ZoneCreationModal, TravelerCreationModal)
    // Utiliza el cliente de sesión (RLS activo: aislamiento de tenant garantizado sin bypass de admin)
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, role_level, is_active')
      .eq('is_active', true)
      .gte('role_level', 60)
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: `Error al consultar perfiles: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: profiles || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { authenticated, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión activa'}` },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Obtener y validar perfil del invocador
    const { data: callerProfile, error: callerError } = await adminClient
      .from('profiles')
      .select('id, organization_id, full_name, role, role_level')
      .eq('id', user.id)
      .single();

    if (callerError || !callerProfile) {
      return NextResponse.json(
        { error: 'Perfil de usuario no localizado en el sistema' },
        { status: 403 }
      );
    }

    // 2. Control de Permiso: Solo mandos (role_level >= 60) pueden dar de alta usuarios
    if (callerProfile.role_level < 60) {
      return NextResponse.json(
        { error: 'Acceso denegado: Se requiere rango mínimo de RSO (nivel 60) para dar de alta usuarios' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { full_name, email, password, role, phone, emergency_contact, supervising_rso_id } = body;

    // 3. Validaciones de entrada
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return NextResponse.json({ error: 'El nombre completo es obligatorio' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.trim().includes('@')) {
      return NextResponse.json({ error: 'Email corporativo no válido' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña inicial debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    const validRoles: UserRole[] = ['ORG_ADMIN', 'CONTROL_TOWER', 'RSO', 'OPERATOR'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Rol no válido. Debe ser uno de: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    const requestedRoleLevel = ROLE_LEVELS[role as UserRole];

    // 4. Regla Jerárquica Estricta: Un rol solo gestiona/crea roles de nivel igual o inferior
    if (requestedRoleLevel > callerProfile.role_level) {
      return NextResponse.json(
        {
          error: `Infracción jerárquica: Su nivel (${callerProfile.role_level} - ${callerProfile.role}) no le permite crear usuarios con rango superior (${requestedRoleLevel} - ${role})`,
        },
        { status: 403 }
      );
    }

    // 5. Validar supervisor RSO si aplica
    if (role === 'OPERATOR' && supervising_rso_id) {
      const { data: supervisor } = await adminClient
        .from('profiles')
        .select('id, organization_id, role_level')
        .eq('id', supervising_rso_id)
        .eq('organization_id', callerProfile.organization_id)
        .gte('role_level', 60)
        .single();

      if (!supervisor) {
        return NextResponse.json(
          { error: 'El Oficial RSO asignado como supervisor no es válido o no pertenece a la organización' },
          { status: 400 }
        );
      }
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 6. Aprovisionamiento Atómico: Paso 1 - Crear credencial en auth.users
    const { data: authData, error: authCreateError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        organization_id: callerProfile.organization_id,
      },
    });

    if (authCreateError || !authData.user) {
      return NextResponse.json(
        { error: `Fallo al aprovisionar usuario en Auth: ${authCreateError?.message || 'Error desconocido'}` },
        { status: 400 }
      );
    }

    const newUserId = authData.user.id;

    // 7. Aprovisionamiento Atómico: Paso 2 - Crear registro en public.profiles
    const { data: newProfile, error: profileInsertError } = await adminClient
      .from('profiles')
      .insert({
        id: newUserId,
        organization_id: callerProfile.organization_id,
        full_name: full_name.trim(),
        email: normalizedEmail,
        role: role,
        role_level: requestedRoleLevel,
        phone: phone ? String(phone).trim() : null,
        emergency_contact: emergency_contact ? String(emergency_contact).trim() : null,
        supervising_rso_id: (role === 'OPERATOR' && supervising_rso_id) ? supervising_rso_id : null,
        is_active: true,
      })
      .select('id, organization_id, full_name, email, role, role_level, phone, emergency_contact, supervising_rso_id, is_active, created_at')
      .single();

    // 8. Rollback Compensatorio si la creación de perfil falla
    if (profileInsertError || !newProfile) {
      console.error('[ROLLBACK USER PROVISIONING] Eliminando auth user tras fallo en profiles:', profileInsertError);
      await adminClient.auth.admin.deleteUser(newUserId);

      return NextResponse.json(
        { error: `Error al registrar perfil corporativo: ${profileInsertError?.message || 'Error interno'}` },
        { status: 500 }
      );
    }

    // 9. Registro DPIA / Auditoría inmutable
    await logAuditEvent(adminClient, {
      organization_id: callerProfile.organization_id,
      performed_by: user.id,
      action: 'USER_CREATED',
      entity_type: 'PROFILE',
      entity_id: newProfile.id,
      payload: {
        full_name: newProfile.full_name,
        email: newProfile.email,
        role: newProfile.role,
        role_level: newProfile.role_level,
        supervising_rso_id: newProfile.supervising_rso_id,
      },
    });

    return NextResponse.json(
      {
        data: newProfile,
        profile: newProfile,
        message: `Usuario ${newProfile.full_name} (${newProfile.role}) dado de alta satisfactoriamente`,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
