// ==============================================================================
// GZN — API ROUTE: GESTIÓN DE VIAJEROS / EL REBAÑO (/api/travelers)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { hashDeviceSecret } from '@/lib/auth/device';
import { logAuditEvent } from '@/lib/audit/logger';
import { TravelerStatus } from '@/types/database';

const VALID_STATUSES: TravelerStatus[] = ['SAFE', 'WARNING', 'DANGER', 'PANIC', 'INCOMMUNICADO'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/travelers — Listar viajeros de la organización del usuario en sesión
export async function GET(request: NextRequest) {
  try {
    const { authenticated, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') || 'ALL';
    const assignedRsoId = searchParams.get('assigned_rso_id');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    if (assignedRsoId && !UUID_REGEX.test(assignedRsoId)) {
      return NextResponse.json(
        { error: 'Parámetro assigned_rso_id inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // Regla de Oro: device_secret_hash NUNCA se proyecta ni se devuelve en respuestas de lectura
    let query = supabase
      .from('travelers')
      .select(`
        id,
        organization_id,
        assigned_rso_id,
        user_id,
        full_name,
        email,
        phone,
        callsign,
        status,
        last_latitude,
        last_longitude,
        last_ping_at,
        battery_level,
        created_at,
        updated_at,
        assigned_rso:profiles!assigned_rso_id (id, full_name, role, phone)
      `)
      .order('full_name', { ascending: true });

    if (statusParam !== 'ALL') {
      if (!VALID_STATUSES.includes(statusParam as TravelerStatus)) {
        return NextResponse.json(
          { error: `Estado de viajero inválido: '${statusParam}'. Estados válidos: ${VALID_STATUSES.join(', ')} o 'ALL'.` },
          { status: 400 }
        );
      }
      query = query.eq('status', statusParam);
    }

    if (assignedRsoId) {
      query = query.eq('assigned_rso_id', assignedRsoId);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: travelers, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ travelers: travelers || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/travelers — Alta de viajero y enrolamiento criptográfico de terminal móvil
export async function POST(request: NextRequest) {
  try {
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    // Control de Acceso Estricto RBAC (Mandato Claude: validación de perfil activo 'is_active = true')
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile || !['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Rol insuficiente: Se requiere rol RSO o Administrador activo para dar de alta viajeros.' },
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

    const {
      full_name,
      phone,
      email,
      callsign,
      assigned_rso_id,
      user_id,
      generate_device_secret,
    } = body;

    // Validación de campos obligatorios
    if (!full_name || typeof full_name !== 'string' || full_name.trim() === '') {
      return NextResponse.json({ error: 'El campo "full_name" es obligatorio.' }, { status: 400 });
    }

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return NextResponse.json({ error: 'El campo "phone" es obligatorio.' }, { status: 400 });
    }

    if (assigned_rso_id && !UUID_REGEX.test(assigned_rso_id)) {
      return NextResponse.json({ error: 'assigned_rso_id debe ser un UUID válido.' }, { status: 400 });
    }

    if (user_id && !UUID_REGEX.test(user_id)) {
      return NextResponse.json({ error: 'user_id debe ser un UUID válido.' }, { status: 400 });
    }

    // Enrolamiento Criptográfico de Hardware
    let rawSecret: string | null = null;
    let secretHash: string | null = null;

    if (generate_device_secret !== false) {
      // 32 bytes de alta entropía -> 64 caracteres hex (256 bits)
      rawSecret = crypto.randomBytes(32).toString('hex');
      secretHash = hashDeviceSecret(rawSecret);
    }

    // Inserción en public.travelers
    const { data: newTraveler, error: insertError } = await supabase
      .from('travelers')
      .insert({
        organization_id: profile.organization_id,
        assigned_rso_id: assigned_rso_id || null,
        user_id: user_id || null,
        full_name: full_name.trim(),
        email: email ? String(email).trim() : null,
        phone: phone.trim(),
        callsign: callsign ? String(callsign).trim() : null,
        status: 'SAFE',
        device_secret_hash: secretHash,
      })
      .select(`
        id,
        organization_id,
        assigned_rso_id,
        user_id,
        full_name,
        email,
        phone,
        callsign,
        status,
        last_latitude,
        last_longitude,
        battery_level,
        created_at,
        updated_at
      `)
      .single();

    if (insertError || !newTraveler) {
      return NextResponse.json(
        { error: insertError?.message || 'Error al registrar el viajero en la base de datos.' },
        { status: 500 }
      );
    }

    // Registro forense inmutable en public.audit_logs (DPIA / RGPD Art. 35)
    await logAuditEvent(supabase, {
      organization_id: profile.organization_id,
      performed_by: user.id,
      action: 'TRAVELER_CREATED',
      entity_type: 'TRAVELER',
      entity_id: newTraveler.id,
      payload: {
        traveler_name: newTraveler.full_name,
        callsign: newTraveler.callsign,
        phone: newTraveler.phone,
        assigned_rso_id: newTraveler.assigned_rso_id,
        device_enrolled: Boolean(secretHash),
      },
    });

    return NextResponse.json(
      {
        success: true,
        traveler: newTraveler,
        device_secret: rawSecret,
        warning: rawSecret
          ? 'ATENCIÓN: Este secreto de hardware se muestra UNA SOLA VEZ. Debe ser cargado inmediatamente en el terminal móvil del viajero.'
          : undefined,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
