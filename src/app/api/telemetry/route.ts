// ==============================================================================
// GZN — API ROUTE: TELEMETRÍA TÁCTICA & GEOFENCING (Terminal Móvil)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyDeviceAuth, processVerifiedTelemetry } from '@/lib/auth/device';

// POST /api/telemetry — Ingesta de telemetría de viajero y evaluación de geofencing
export async function POST(request: NextRequest) {
  try {
    const deviceSecret = request.headers.get('x-device-secret');

    // 1. Verificación obligatoria de cabecera de dispositivo
    if (!deviceSecret || deviceSecret.trim() === '') {
      return NextResponse.json(
        { error: 'No autorizado: Se requiere cabecera de autenticación de dispositivo (x-device-secret).' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo de la petición JSON inválido o malformado' }, { status: 400 });
    }

    const { traveler_id, latitude, longitude, battery_level, speed_kmh } = body;

    if (!traveler_id || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios: traveler_id, latitude (number), longitude (number)' },
        { status: 400 }
      );
    }

    // 2. Autenticación criptográfica del dispositivo contra el secreto registrado
    const deviceAuth = await verifyDeviceAuth(request, traveler_id);

    if (!deviceAuth.authenticated || !deviceAuth.traveler) {
      return NextResponse.json(
        { error: `No autorizado: ${deviceAuth.error || 'Credencial de dispositivo inválida para el viajero'}` },
        { status: 401 }
      );
    }

    // 3. Procesamiento seguro de telemetría y geofencing PostGIS
    const result = await processVerifiedTelemetry(
      deviceAuth.traveler,
      latitude,
      longitude,
      battery_level,
      speed_kmh
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
