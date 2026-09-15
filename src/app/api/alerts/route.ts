// ==============================================================================
// GZN — API ROUTE: INCIDENCIAS Y BOTÓN DE PÁNICO SOS
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { verifyDeviceAuth, triggerDevicePanicAlert } from '@/lib/auth/device';
import { sendEmergencyPushToTopic } from '@/lib/firebase/admin';
import { logAuditEvent } from '@/lib/audit/logger';

// GET /api/alerts — Listar alertas activas de la organización
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
    const status = searchParams.get('status') || 'OPEN';

    // RLS filtra automáticamente por la organización del usuario en sesión
    let query = supabase
      .from('alerts')
      .select(`
        id,
        organization_id,
        traveler_id,
        zone_id,
        alert_type,
        severity,
        latitude,
        longitude,
        memo,
        status,
        created_at,
        travelers (id, full_name, callsign, phone, battery_level),
        zones (id, name, severity, color_hex)
      `)
      .order('created_at', { ascending: false });

    if (status !== 'ALL') {
      query = query.eq('status', status);
    }

    const { data: alerts, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: alerts || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/alerts — Disparo de Botón de Pánico / SOS (Dispositivo móvil o RSO autenticado)
export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo de la petición JSON inválido o malformado' }, { status: 400 });
    }

    const { traveler_id, latitude, longitude, memo, alert_type } = body;

    if (!traveler_id || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Parámetros obligatorios: traveler_id, latitude (number), longitude (number)' },
        { status: 400 }
      );
    }

    // Comprobación de autenticación dual: Secreto de dispositivo móvil O Sesión de usuario RSO
    const hasDeviceSecret = request.headers.has('x-device-secret');

    if (hasDeviceSecret) {
      // 1. Vía Terminal Móvil: Verificar autenticidad del dispositivo con su secreto pre-compartido
      const deviceAuth = await verifyDeviceAuth(request, traveler_id);

      if (!deviceAuth.authenticated || !deviceAuth.traveler) {
        return NextResponse.json(
          { error: `No autorizado: ${deviceAuth.error || 'Credencial de dispositivo inválida'}` },
          { status: 401 }
        );
      }

      const alertData = await triggerDevicePanicAlert(
        deviceAuth.traveler,
        latitude,
        longitude,
        memo,
        alert_type
      );

      return NextResponse.json({ success: true, alert: alertData }, { status: 201 });
    }

    // 2. Vía Consola RSO: Verificar sesión activa de usuario operador
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: 'No autorizado: Se requiere cabecera x-device-secret o sesión activa de usuario RSO.' },
        { status: 401 }
      );
    }

    // Obtener viajero con el cliente de sesión (RLS impide acceder a viajeros de otra organización)
    const { data: traveler, error: travelerError } = await supabase
      .from('travelers')
      .select('id, organization_id, full_name, callsign, phone')
      .eq('id', traveler_id)
      .single();

    if (travelerError || !traveler) {
      return NextResponse.json(
        { error: 'Viajero no encontrado o no pertenece a la organización del usuario autenticado' },
        { status: 404 }
      );
    }

    const orgId = traveler.organization_id;
    const type = alert_type || 'MANUAL_SOS';

    // Insertar alerta con cliente de sesión (RLS valida pertenencia)
    const { data: alertData, error: alertError } = await supabase
      .from('alerts')
      .insert({
        organization_id: orgId,
        traveler_id: traveler.id,
        alert_type: type,
        severity: 'CRITICAL',
        latitude,
        longitude,
        memo: memo || '¡SOS MANUAL ACTIVADO POR EL OPERADOR RSO!',
        status: 'OPEN',
      })
      .select()
      .single();

    if (alertError) {
      return NextResponse.json({ error: alertError.message }, { status: 500 });
    }

    // Actualizar estado del viajero a PANIC
    await supabase
      .from('travelers')
      .update({
        status: 'PANIC',
        last_latitude: latitude,
        last_longitude: longitude,
        last_ping_at: new Date().toISOString(),
      })
      .eq('id', traveler.id);

    // Despacho de push de emergencia
    await sendEmergencyPushToTopic(
      `org_${orgId}_alerts`,
      '🚨 SOS MANUAL RSO: Auxilio Solicitado',
      `${traveler.full_name} (${traveler.callsign || 'Viajero'}) marcado en emergencia crítica en (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
      {
        alert_id: alertData.id,
        traveler_id: traveler.id,
        severity: 'CRITICAL',
        type: 'MANUAL_SOS',
      }
    );

    // Registrar evento inmutable en public.audit_logs (Trazabilidad DPIA / RGPD Art. 35)
    await logAuditEvent(supabase, {
      organization_id: orgId,
      performed_by: user.id,
      action: 'ALERT_TRIGGERED',
      entity_type: 'ALERT',
      entity_id: alertData.id,
      payload: {
        traveler_id: traveler.id,
        traveler_name: traveler.full_name,
        callsign: traveler.callsign,
        alert_type: type,
        severity: 'CRITICAL',
        coordinates: [longitude, latitude],
        memo: memo || '¡SOS MANUAL ACTIVADO POR EL OPERADOR RSO!',
        trigger_source: 'RSO_CONSOLE',
      },
    });

    return NextResponse.json({ success: true, alert: alertData }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
