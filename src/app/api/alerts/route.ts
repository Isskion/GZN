import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmergencyPushToTopic } from '@/lib/firebase/admin';

// GET /api/alerts — Listar alertas activas
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organization_id');
    const status = searchParams.get('status') || 'OPEN';

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

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }
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

// POST /api/alerts — Disparo de Botón de Pánico / SOS
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const { traveler_id, latitude, longitude, memo, alert_type } = body;

    if (!traveler_id || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Parámetros obligatorios: traveler_id, latitude (number), longitude (number)' },
        { status: 400 }
      );
    }

    // 1. Obtener viajero
    const { data: traveler, error: travelerError } = await supabase
      .from('travelers')
      .select('id, organization_id, full_name, callsign, phone')
      .eq('id', traveler_id)
      .single();

    if (travelerError || !traveler) {
      return NextResponse.json({ error: 'Viajero no encontrado' }, { status: 404 });
    }

    const orgId = traveler.organization_id;
    const type = alert_type || 'PANIC_BUTTON';

    // 2. Insertar alerta de pánico
    const { data: alertData, error: alertError } = await supabase
      .from('alerts')
      .insert({
        organization_id: orgId,
        traveler_id: traveler.id,
        alert_type: type,
        severity: 'CRITICAL',
        latitude,
        longitude,
        memo: memo || '¡BOTÓN DE PÁNICO ACTIVADO POR EL VIAJERO!',
        status: 'OPEN',
      })
      .select()
      .single();

    if (alertError) {
      return NextResponse.json({ error: alertError.message }, { status: 500 });
    }

    // 3. Cambiar estado del viajero a PANIC
    await supabase
      .from('travelers')
      .update({
        status: 'PANIC',
        last_latitude: latitude,
        last_longitude: longitude,
        last_ping_at: new Date().toISOString(),
      })
      .eq('id', traveler.id);

    // 4. Enviar notificación push de emergencia inmediata a la consola y móviles RSO
    await sendEmergencyPushToTopic(
      `org_${orgId}_alerts`,
      '🚨 SOS: ¡BOTÓN DE PÁNICO ACTIVADO!',
      `${traveler.full_name} (${traveler.callsign || 'Viajero'}) requiere auxilio inmediato en (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
      {
        alert_id: alertData.id,
        traveler_id: traveler.id,
        severity: 'CRITICAL',
        type: 'PANIC_BUTTON',
      }
    );

    return NextResponse.json({ success: true, alert: alertData }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
