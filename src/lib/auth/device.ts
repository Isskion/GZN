// ==============================================================================
// GZN — AUTENTICACIÓN Y SERVICIOS DE DISPOSITIVOS MÓVILES (Subsistema 1)
// ==============================================================================
// NOTA ARQUITECTURA: Esta implementación con secreto pre-compartido por dispositivo
// (x-device-secret) y verificación criptográfica con hash SHA-256 es un escalón
// intermedio deliberado para asegurar el backend inmediatamente mientras se completa
// la integración completa de vinculación por firma asimétrica ECDSA P-256 (Hoja de Ruta v0.9).
// ==============================================================================

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmergencyPushToTopic } from '@/lib/firebase/admin';
import { logAuditEvent } from '@/lib/audit/logger';

export interface DeviceAuthResult {
  authenticated: boolean;
  traveler?: any;
  error?: string;
}

/**
 * Calcula el hash criptográfico SHA-256 de un secreto de dispositivo.
 */
export function hashDeviceSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret.trim()).digest('hex');
}

/**
 * Verifica la cabecera 'x-device-secret' contra el hash registrado en la tabla 'travelers'.
 * Solo los dispositivos legítimamente aprovisionados y vinculados al viajero pueden reportar.
 */
export async function verifyDeviceAuth(request: NextRequest, travelerId: string): Promise<DeviceAuthResult> {
  const deviceSecret = request.headers.get('x-device-secret');

  if (!deviceSecret || deviceSecret.trim() === '') {
    return {
      authenticated: false,
      error: 'Cabecera de autenticación de dispositivo (x-device-secret) ausente.',
    };
  }

  if (!travelerId) {
    return {
      authenticated: false,
      error: 'Identificador de viajero (traveler_id) no proporcionado.',
    };
  }

  try {
    const supabase = createAdminClient();
    const { data: traveler, error: travelerError } = await supabase
      .from('travelers')
      .select('id, organization_id, full_name, callsign, phone, status, device_secret_hash')
      .eq('id', travelerId)
      .single();

    if (travelerError || !traveler) {
      return {
        authenticated: false,
        error: 'Viajero no encontrado o sin registro en el sistema.',
      };
    }

    if (!traveler.device_secret_hash) {
      return {
        authenticated: false,
        error: 'El dispositivo no ha sido aprovisionado previamente con un secreto de hardware.',
      };
    }

    const computedHash = hashDeviceSecret(deviceSecret);

    // Comparación segura en tiempo constante para mitigar ataques de temporización
    const hashBufferA = Buffer.from(computedHash, 'utf8');
    const hashBufferB = Buffer.from(traveler.device_secret_hash, 'utf8');

    if (hashBufferA.length !== hashBufferB.length || !crypto.timingSafeEqual(hashBufferA, hashBufferB)) {
      return {
        authenticated: false,
        error: 'Credencial de secreto de dispositivo no coincide con el viajero.',
      };
    }

    return {
      authenticated: true,
      traveler,
    };
  } catch (err: any) {
    return {
      authenticated: false,
      error: err.message || 'Error durante la verificación del secreto de dispositivo.',
    };
  }
}

/**
 * Procesa la ingesta de telemetría de un dispositivo autenticado:
 * - Evalúa geofencing en PostGIS (check_point_zones).
 * - Escala estado a DANGER y despacha push FCM ante intrusión en zona roja.
 * - Actualiza posición y estado en base de datos.
 */
export async function processVerifiedTelemetry(
  traveler: any,
  latitude: number,
  longitude: number,
  batteryLevel?: number,
  speedKmh?: number
) {
  const supabase = createAdminClient();
  const orgId = traveler.organization_id;

  // 1. Evaluar Geofencing en PostGIS
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

  // 2. Procesar consecuencias según severidad de zona
  if (currentZone) {
    if (currentZone.severity === 'RED') {
      newStatus = 'DANGER';

      // Evitar saturación si ya existe una alerta activa para este viajero en la misma zona
      const { data: existingAlerts } = await supabase
        .from('alerts')
        .select('id')
        .eq('traveler_id', traveler.id)
        .eq('zone_id', currentZone.zone_id)
        .eq('status', 'OPEN')
        .limit(1);

      if (!existingAlerts || existingAlerts.length === 0) {
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

          // Registrar evento inmutable en public.audit_logs (Trazabilidad DPIA / RGPD Art. 35)
          await logAuditEvent(supabase, {
            organization_id: orgId,
            performed_by: null,
            action: 'ZONE_VIOLATION_DETECTED',
            entity_type: 'ZONE',
            entity_id: currentZone.zone_id,
            payload: {
              traveler_id: traveler.id,
              traveler_name: traveler.full_name,
              callsign: traveler.callsign,
              zone_id: currentZone.zone_id,
              zone_name: currentZone.zone_name,
              coordinates: [longitude, latitude],
              speed_kmh: speedKmh ?? null,
              battery_level: batteryLevel ?? null,
              alert_type: 'ZONE_VIOLATION',
              severity: 'CRITICAL',
            },
          });
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

  // 3. Actualizar posición y estado del viajero en Postgres con origen DEVICE_TELEMETRY (Decisión Daniel / Claude)
  await supabase
    .from('travelers')
    .update({
      last_latitude: latitude,
      last_longitude: longitude,
      position_source: 'DEVICE_TELEMETRY',
      battery_level: batteryLevel !== undefined ? batteryLevel : null,
      status: newStatus,
      last_ping_at: new Date().toISOString(),
    })
    .eq('id', traveler.id);

  return {
    traveler_id: traveler.id,
    status: newStatus,
    current_zone: currentZone,
    alert_triggered: alertCreated,
  };
}

/**
 * Dispara una alerta de pánico SOS desde un dispositivo móvil autenticado por secreto.
 */
export async function triggerDevicePanicAlert(
  traveler: any,
  latitude: number,
  longitude: number,
  memo?: string,
  alertType?: string
) {
  const supabase = createAdminClient();
  const orgId = traveler.organization_id;
  const type = alertType || 'PANIC_BUTTON';

  // 1. Insertar alerta de pánico
  const { data: alertData, error: alertError } = await supabase
    .from('alerts')
    .insert({
      organization_id: orgId,
      traveler_id: traveler.id,
      alert_type: type,
      severity: 'CRITICAL',
      latitude,
      longitude,
      memo: memo || '¡BOTÓN DE PÁNICO ACTIVADO POR EL DISPOSITIVO!',
      status: 'OPEN',
    })
    .select()
    .single();

  if (alertError) {
    throw new Error(`Error al registrar la alerta de pánico: ${alertError.message}`);
  }

  // 2. Cambiar estado del viajero a PANIC
  await supabase
    .from('travelers')
    .update({
      status: 'PANIC',
      last_latitude: latitude,
      last_longitude: longitude,
      last_ping_at: new Date().toISOString(),
    })
    .eq('id', traveler.id);

  // 3. Notificación push prioritaria FCM
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

  // 4. Registrar evento inmutable en public.audit_logs (Trazabilidad DPIA / RGPD Art. 35)
  await logAuditEvent(supabase, {
    organization_id: orgId,
    performed_by: null,
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
      memo: memo || '¡BOTÓN DE PÁNICO ACTIVADO POR EL DISPOSITIVO!',
      trigger_source: 'DEVICE_HARDWARE',
    },
  });

  return alertData;
}
