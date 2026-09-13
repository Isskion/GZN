import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmergencyPushToTopic } from '@/lib/firebase/admin';

// POST /api/telemetry — Ingesta de telemetría de viajero y evaluación de geofencing
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const { traveler_id, latitude, longitude, battery_level, speed_kmh } = body;

    if (!traveler_id || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios: traveler_id, latitude (number), longitude (number)' },
        { status: 400 }
      );
    }

    // 1. Obtener viajero y su organización
    const { data: traveler, error: travelerError } = await supabase
      .from('travelers')
      .select('id, organization_id, full_name, status, assigned_rso_id')
      .eq('id', traveler_id)
      .single();

    if (travelerError || !traveler) {
      return NextResponse.json({ error: 'Viajero no encontrado' }, { status: 404 });
    }

    const orgId = traveler.organization_id;

    // 2. Evaluar Geofencing en PostGIS llamando a la función RPC
    const { data: zoneResults, error: rpcError } = await supabase.rpc('check_point_zones', {
      p_org_id: orgId,
      p_lat: latitude,
      p_lon: longitude,
    });

    if (rpcError) {
      console.error('Error al evaluar check_point_zones:', rpcError);
    }

    const currentZone = zoneResults && zoneResults.length > 0 ? zoneResults[0] : null;
    let newStatus = traveler.status;
    let alertCreated = false;

    // 3. Procesar consecuencias de zona
    if (currentZone) {
      if (currentZone.severity === 'RED') {
        newStatus = 'DANGER';

        // Comprobar si ya existe una alerta activa para este viajero en esta zona para no saturar
        const { data: existingAlerts } = await supabase
          .from('alerts')
          .select('id')
          .eq('traveler_id', traveler_id)
          .eq('zone_id', currentZone.zone_id)
          .eq('status', 'OPEN')
          .limit(1);

        if (!existingAlerts || existingAlerts.length === 0) {
          // Crear alerta crítica de intrusión en zona roja
          const { error: alertErr } = await supabase.from('alerts').insert({
            organization_id: orgId,
            traveler_id: traveler.id,
            zone_id: currentZone.zone_id,
            alert_type: 'ZONE_VIOLATION',
            severity: 'CRITICAL',
            latitude,
            longitude,
            memo: `Incursión no autorizada en zona de conflicto: ${currentZone.zone_name}`,
            status: 'OPEN',
          });

          if (!alertErr) {
            alertCreated = true;
            // Disparar push de emergencia al canal del RSO
            await sendEmergencyPushToTopic(
              `org_${orgId}_alerts`,
              '🚨 ALERTA CRÍTICA: Violación de Zona Roja',
              `${traveler.full_name} ha ingresado en ${currentZone.zone_name}`,
              {
                traveler_id: traveler.id,
                zone_id: currentZone.zone_id,
                severity: 'CRITICAL',
              }
            );
          }
        }
      } else if (currentZone.severity === 'AMBER') {
        if (newStatus !== 'PANIC' && newStatus !== 'DANGER') {
          newStatus = 'WARNING';
        }
      } else if (currentZone.severity === 'SAFE_HAVEN') {
        if (newStatus !== 'PANIC') {
          newStatus = 'SAFE';
        }
      }
    } else {
      // Fuera de zonas catalogadas
      if (newStatus === 'DANGER' || newStatus === 'WARNING') {
        newStatus = 'SAFE';
      }
    }

    // 4. Actualizar posición y estado del viajero en Supabase
    await supabase
      .from('travelers')
      .update({
        last_latitude: latitude,
        last_longitude: longitude,
        battery_level: battery_level !== undefined ? battery_level : null,
        status: newStatus,
        last_ping_at: new Date().toISOString(),
      })
      .eq('id', traveler_id);

    return NextResponse.json({
      success: true,
      traveler_id,
      status: newStatus,
      current_zone: currentZone,
      alert_triggered: alertCreated,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
