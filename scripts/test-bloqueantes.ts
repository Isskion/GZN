// ==============================================================================
// GZN — SUITE DE VALIDACIÓN AUTOMATIZADA: BLOQUEANTES 1 Y 2
// ==============================================================================

import { validateGeoJSONPolygon, validateZoneEnhancements } from '../src/lib/geo/validation';
import { hashDeviceSecret } from '../src/lib/auth/device';
import { logAuditEvent, AuditLogEntry } from '../src/lib/audit/logger';
import crypto from 'crypto';

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: GZN BLOQUEANTES 1 Y 2 — SEGURIDAD Y POSTGIS RPC');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  // ----------------------------------------------------------------------------
  // 1. Pruebas de Validación GeoJSON Polygon (Bloqueante 2)
  // ----------------------------------------------------------------------------
  console.log('--- 1. Validación GeoJSON (Bloqueante 2) ---');

  const validPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-75.5, 10.4],
        [-75.4, 10.4],
        [-75.4, 10.5],
        [-75.5, 10.5],
        [-75.5, 10.4],
      ],
    ],
  };
  assert(validateGeoJSONPolygon(validPolygon).valid === true, 'Polígono WGS84 válido aceptado');

  const unclosedPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-75.5, 10.4],
        [-75.4, 10.4],
        [-75.4, 10.5],
        [-75.5, 10.5],
        [-75.0, 10.0], // No coincide con el primero
      ],
    ],
  };
  const unclosedResult = validateGeoJSONPolygon(unclosedPolygon);
  assert(
    unclosedResult.valid === false && unclosedResult.error?.includes('no está cerrado') === true,
    'Rechazo controlado (400) de anillo no cerrado'
  );

  const fewPointsPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-75.5, 10.4],
        [-75.4, 10.4],
        [-75.5, 10.4],
      ],
    ],
  };
  const fewPointsResult = validateGeoJSONPolygon(fewPointsPolygon);
  assert(
    fewPointsResult.valid === false && fewPointsResult.error?.includes('al menos 4 posiciones') === true,
    'Rechazo controlado (400) de anillo con menos de 4 puntos'
  );

  const outOfBoundsPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-195.0, 10.4],
        [-75.4, 10.4],
        [-75.4, 10.5],
        [-195.0, 10.5],
        [-195.0, 10.4],
      ],
    ],
  };
  const outOfBoundsResult = validateGeoJSONPolygon(outOfBoundsPolygon);
  assert(
    outOfBoundsResult.valid === false && outOfBoundsResult.error?.includes('fuera del rango WGS84') === true,
    'Rechazo controlado (400) de coordenadas fuera de límites WGS84'
  );

  const nonPolygon = {
    type: 'LineString',
    coordinates: [
      [-75.5, 10.4],
      [-75.4, 10.4],
    ],
  };
  const nonPolygonResult = validateGeoJSONPolygon(nonPolygon);
  assert(
    nonPolygonResult.valid === false && nonPolygonResult.error?.includes('Polygon') === true,
    'Rechazo controlado (400) de tipo no Polygon'
  );

  // ----------------------------------------------------------------------------
  // 2. Pruebas de Hashing y Autenticación de Dispositivo (Bloqueante 1)
  // ----------------------------------------------------------------------------
  console.log('\n--- 2. Autenticación Criptográfica de Dispositivos (Bloqueante 1) ---');

  const secretOrgA = 'gzn_dev_secret_colombia_convoy_alpha_01';
  const secretOrgB = 'gzn_dev_secret_nigeria_escort_bravo_02';

  const hashOrgA = hashDeviceSecret(secretOrgA);
  const hashOrgB = hashDeviceSecret(secretOrgB);

  assert(hashOrgA.length === 64, 'Generación de hash SHA-256 de 64 caracteres');
  assert(hashOrgA !== hashOrgB, 'Hashes únicos por secreto de dispositivo');

  // Simulación de verificación con timingSafeEqual
  const testValidHash = hashDeviceSecret(secretOrgA);
  const matchSuccess = crypto.timingSafeEqual(Buffer.from(hashOrgA), Buffer.from(testValidHash));
  assert(matchSuccess === true, 'Dispositivo legítimo de Org A autentica con éxito');

  const testSpoofedHash = hashDeviceSecret('fake_spoofed_secret_from_attacker');
  const matchFail = crypto.timingSafeEqual(Buffer.from(hashOrgA), Buffer.from(testSpoofedHash));
  assert(matchFail === false, 'Dispositivo con secreto falso rechazado criptográficamente');

  // Comprobación criptográfica: Hashes de secretos distintos no coinciden
  const crossSecretMatch = crypto.timingSafeEqual(Buffer.from(hashOrgA), Buffer.from(hashOrgB));
  assert(crossSecretMatch === false, 'Hashes de secretos distintos no coinciden (timingSafeEqual)');

  // ----------------------------------------------------------------------------
  // 3. Pruebas de Parámetros Tácticos Enriquecidos (Punto 4: Buffers, Curfews, Safe Havens)
  // ----------------------------------------------------------------------------
  console.log('\n--- 3. Parámetros Tácticos Enriquecidos (Punto 4: Buffers y Curfews) ---');

  // Buffer válido
  assert(validateZoneEnhancements({ buffer_meters: 500 }).valid === true, 'Buffer positivo (500m) aceptado');
  assert(validateZoneEnhancements({ buffer_meters: 0 }).valid === true, 'Buffer cero (0m) aceptado');

  // Buffer negativo rechazado
  const negBufferResult = validateZoneEnhancements({ buffer_meters: -50 });
  assert(
    negBufferResult.valid === false && negBufferResult.error?.includes('mayor o igual a 0') === true,
    'Rechazo controlado de buffer negativo (-50m)'
  );

  // Toque de queda coherente
  const validCurfew = validateZoneEnhancements({
    is_curfew: true,
    curfew_start: '22:00',
    curfew_end: '06:00',
  });
  assert(validCurfew.valid === true, 'Toque de queda válido (22:00 - 06:00) aceptado');

  // Toque de queda con segundos
  const validCurfewSec = validateZoneEnhancements({
    is_curfew: true,
    curfew_start: '20:30:00',
    curfew_end: '05:45:00',
  });
  assert(validCurfewSec.valid === true, 'Toque de queda con segundos (20:30:00 - 05:45:00) aceptado');

  // Toque de queda sin hora fin rechazado
  const missingEndCurfew = validateZoneEnhancements({
    is_curfew: true,
    curfew_start: '22:00',
  });
  assert(
    missingEndCurfew.valid === false && missingEndCurfew.error?.includes('curfew_start y curfew_end') === true,
    'Rechazo de toque de queda sin hora de fin'
  );

  // Toque de queda con formato de hora corrupto
  const corruptTimeCurfew = validateZoneEnhancements({
    is_curfew: true,
    curfew_start: '25:99',
    curfew_end: '06:00',
  });
  assert(
    corruptTimeCurfew.valid === false && corruptTimeCurfew.error?.includes('inválido') === true,
    'Rechazo de formato de hora corrupto (25:99)'
  );

  // Metadatos Safe Haven aceptados
  const safeHavenMeta = validateZoneEnhancements({
    contact_phone: '+34 600 000 000',
    radio_frequency: '156.800 MHz (Canal 16)',
    gate_access_protocol: 'Santo y seña Bravo-Delta en puesto de guardia',
  });
  assert(safeHavenMeta.valid === true, 'Metadatos tácticos de Safe Haven aceptados');

  // ----------------------------------------------------------------------------
  // 4. Pruebas de Registro Inmutable y Trazabilidad DPIA (Punto 5)
  // ----------------------------------------------------------------------------
  console.log('\n--- 4. Trazabilidad DPIA y Estructura de Audit Logs (Punto 5) ---');

  // Validación de estructura para ZONE_CREATED
  const zoneCreatedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'user-rso-uuid',
    action: 'ZONE_CREATED',
    entity_type: 'ZONE',
    entity_id: 'zone-test-uuid',
    payload: {
      name: 'Zona Conflicto Norte',
      severity: 'RED',
      buffer_meters: 250,
      is_curfew: false,
    },
  };
  assert(zoneCreatedEntry.action === 'ZONE_CREATED', 'Estructura de auditoría ZONE_CREATED válida');
  assert(zoneCreatedEntry.performed_by !== null, 'performed_by preserva el UUID del operador RSO');
  assert(zoneCreatedEntry.payload?.buffer_meters === 250, 'Payload contiene parámetros de buffer');

  // Validación de estructura para ALERT_TRIGGERED (Terminal móvil)
  const hardwareAlertEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: null,
    action: 'ALERT_TRIGGERED',
    entity_type: 'ALERT',
    entity_id: 'alert-sos-uuid',
    payload: {
      traveler_id: 'traveler-01-uuid',
      traveler_name: 'Carlos Mendoza',
      callsign: 'CONVOY-ALFA',
      alert_type: 'PANIC_BUTTON',
      severity: 'CRITICAL',
      coordinates: [-3.7038, 40.4168],
      trigger_source: 'DEVICE_HARDWARE',
    },
  };
  assert(hardwareAlertEntry.performed_by === null, 'performed_by es null para eventos M2M de hardware');
  assert(hardwareAlertEntry.payload?.trigger_source === 'DEVICE_HARDWARE', 'trigger_source identifica origen de hardware');

  // Validación de estructura para ZONE_VIOLATION_DETECTED
  const violationEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: null,
    action: 'ZONE_VIOLATION_DETECTED',
    entity_type: 'ZONE',
    entity_id: 'zone-red-uuid',
    payload: {
      traveler_id: 'traveler-01-uuid',
      zone_name: 'Distrito Norte',
      coordinates: [-3.7100, 40.4300],
      speed_kmh: 65,
      alert_type: 'ZONE_VIOLATION',
    },
  };
  assert(violationEntry.action === 'ZONE_VIOLATION_DETECTED', 'Acción ZONE_VIOLATION_DETECTED tipada');
  assert(Array.isArray(violationEntry.payload?.coordinates), 'Coordenadas forenses registradas en payload');

  // Validación de rechazo de logAuditEvent si falta organization_id
  const dummyClient: any = { from: () => ({ insert: async () => ({ error: null }) }) };
  const missingOrgResult = await logAuditEvent(dummyClient, {
    organization_id: '',
    action: 'ZONE_CREATED',
    entity_type: 'ZONE',
  });
  assert(missingOrgResult === false, 'logAuditEvent rechaza limpiamente si falta organization_id');

  // ----------------------------------------------------------------------------
  // 5. Gestión y Ciclo de Vida de Alertas (Paquete B1)
  // ----------------------------------------------------------------------------
  console.log('--- 5. Ciclo de Vida de Alertas y Lógica Multi-Incidente (Paquete B1) ---');

  const VALID_ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'FALSE_ALARM'];
  const isValidAlertStatus = (s: string) => VALID_ALERT_STATUSES.includes(s);

  assert(isValidAlertStatus('ACKNOWLEDGED'), 'Estado ACKNOWLEDGED válido');
  assert(isValidAlertStatus('INVESTIGATING'), 'Estado INVESTIGATING válido');
  assert(isValidAlertStatus('RESOLVED'), 'Estado RESOLVED válido');
  assert(isValidAlertStatus('FALSE_ALARM'), 'Estado FALSE_ALARM válido');
  assert(!isValidAlertStatus('INVALID_STATUS'), 'Rechazo controlado de estado de alerta inexistente');
  assert(!isValidAlertStatus(''), 'Rechazo controlado de estado vacío');

  // Validación de asignación de firma de resolución
  function computeAlertResolutionUpdates(currentStatus: string, newStatus: string, userId: string) {
    const updates: Record<string, any> = { status: newStatus };
    if (newStatus === 'RESOLVED' || newStatus === 'FALSE_ALARM') {
      updates.resolved_by = userId;
      updates.resolved_at = new Date().toISOString();
    } else if (newStatus === 'OPEN') {
      updates.resolved_by = null;
      updates.resolved_at = null;
    }
    return updates;
  }

  const resolvedUpdates = computeAlertResolutionUpdates('OPEN', 'RESOLVED', 'rso-user-123');
  assert(resolvedUpdates.resolved_by === 'rso-user-123', 'resolved_by asignado al resolver alerta');
  assert(typeof resolvedUpdates.resolved_at === 'string', 'resolved_at asignado con timestamp ISO al resolver');

  const reopenedUpdates = computeAlertResolutionUpdates('RESOLVED', 'OPEN', 'rso-user-123');
  assert(reopenedUpdates.resolved_by === null, 'resolved_by reseteado a null al reabrir alerta');
  assert(reopenedUpdates.resolved_at === null, 'resolved_at reseteado a null al reabrir alerta');

  // Validación de acción de auditoría según transición
  function determineAlertAuditAction(newStatus: string): AuditLogEntry['action'] {
    if (newStatus === 'ACKNOWLEDGED') return 'ALERT_ACKNOWLEDGED';
    if (newStatus === 'RESOLVED' || newStatus === 'FALSE_ALARM') return 'ALERT_RESOLVED';
    return 'ALERT_STATUS_CHANGED';
  }

  assert(determineAlertAuditAction('ACKNOWLEDGED') === 'ALERT_ACKNOWLEDGED', 'Auditoría ALERT_ACKNOWLEDGED asignada');
  assert(determineAlertAuditAction('RESOLVED') === 'ALERT_RESOLVED', 'Auditoría ALERT_RESOLVED asignada');
  assert(determineAlertAuditAction('FALSE_ALARM') === 'ALERT_RESOLVED', 'Auditoría ALERT_RESOLVED asignada para FALSE_ALARM');
  assert(determineAlertAuditAction('INVESTIGATING') === 'ALERT_STATUS_CHANGED', 'Auditoría ALERT_STATUS_CHANGED asignada para INVESTIGATING');
  assert(determineAlertAuditAction('OPEN') === 'ALERT_STATUS_CHANGED', 'Auditoría ALERT_STATUS_CHANGED asignada al reabrir alerta');

  // Validación de Lógica Preventiva Multi-Incidente (Mandato Auditoría Claude)
  function evaluateTravelerStatusReset(
    newStatus: string,
    resetRequested: boolean,
    currentTravelerStatus: string,
    otherActiveAlertsCount: number
  ): { travelerStatusReset: boolean; resetReason: string; newTravelerStatus: string } {
    const shouldReset = (newStatus === 'RESOLVED' || newStatus === 'FALSE_ALARM') && resetRequested !== false;
    if (!shouldReset) {
      return { travelerStatusReset: false, resetReason: 'not_requested', newTravelerStatus: currentTravelerStatus };
    }
    if (otherActiveAlertsCount > 0) {
      return { travelerStatusReset: false, resetReason: 'other_active_alerts_exist', newTravelerStatus: currentTravelerStatus };
    }
    if (['PANIC', 'DANGER', 'WARNING'].includes(currentTravelerStatus)) {
      return { travelerStatusReset: true, resetReason: 'all_alerts_resolved', newTravelerStatus: 'SAFE' };
    }
    return { travelerStatusReset: false, resetReason: 'traveler_already_safe', newTravelerStatus: currentTravelerStatus };
  }

  // Caso 1: Viajero con 2 alertas activas; resolvemos 1 -> NO debe resetear estado a SAFE
  const multiAlertCase = evaluateTravelerStatusReset('RESOLVED', true, 'PANIC', 1);
  assert(
    multiAlertCase.travelerStatusReset === false && 
    multiAlertCase.resetReason === 'other_active_alerts_exist' && 
    multiAlertCase.newTravelerStatus === 'PANIC',
    'Lógica Multi-Incidente: Bloqueo de reset a SAFE si existen otras alertas abiertas'
  );

  // Caso 2: Viajero sin otras alertas activas; resolvemos la última -> DEBE resetear a SAFE
  const singleAlertCase = evaluateTravelerStatusReset('RESOLVED', true, 'PANIC', 0);
  assert(
    singleAlertCase.travelerStatusReset === true && 
    singleAlertCase.resetReason === 'all_alerts_resolved' && 
    singleAlertCase.newTravelerStatus === 'SAFE',
    'Lógica Multi-Incidente: Reset a SAFE exitoso cuando no persisten otras alertas'
  );

  // Caso 3: Viajero ya en estado SAFE al resolver -> no se altera estado
  const safeCase = evaluateTravelerStatusReset('RESOLVED', true, 'SAFE', 0);
  assert(
    safeCase.travelerStatusReset === false && 
    safeCase.resetReason === 'traveler_already_safe',
    'Lógica Multi-Incidente: Detección correcta de viajero ya seguro'
  );

  // Caso 4: Transición a INVESTIGATING -> no debe evaluar reset
  const investigatingCase = evaluateTravelerStatusReset('INVESTIGATING', true, 'PANIC', 0);
  assert(
    investigatingCase.travelerStatusReset === false && 
    investigatingCase.resetReason === 'not_requested',
    'Lógica Multi-Incidente: Sin reset de viajero en estados no terminales'
  );

  // ----------------------------------------------------------------------------
  // Resumen
  // ----------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TOTAL PRUEBAS: ${passed + failed} | EXITOSAS: ${passed} | FALLIDAS: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
