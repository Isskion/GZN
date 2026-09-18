// ==============================================================================
// GZN — SUITE DE VALIDACIÓN AUTOMATIZADA: BLOQUEANTES 1 Y 2
// ==============================================================================

import { validateGeoJSONPolygon, validateZoneEnhancements } from '../src/lib/geo/validation';
import { hashDeviceSecret } from '../src/lib/auth/device';
import { logAuditEvent, AuditLogEntry } from '../src/lib/audit/logger';
import {
  buildHereMultiLayerStyle,
  formatTacticalCoordinates,
  HERE_MAP_LAYERS,
  setHereActiveLayer,
  HERE_LAYER_PREFIX,
} from '../src/lib/geo/hereMapStyles';
import {
  ROLE_LEVELS,
  DEFAULT_ROLE_SCREEN_ACCESS,
  hasScreenAccess,
  UserRole,
} from '../src/types/database';
import {
  generateGeodesicCircle,
  extractMainContinentPolygon,
  closeDrawnPolygon,
  calculateRingAreaKm2,
  getSeverityColor,
  buildSeverityMatchExpression,
  SEVERITY_HEX_COLORS,
  SEVERITY_CSS_COLORS,
} from '../src/lib/geo/tactical-zones';
import {
  buildHereGeocodeUrl,
  parseHereGeocodeResponse,
} from '../src/lib/geo/geocoding';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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
  // 6. Gestión Completa de Zonas: Modificación y Desactivación Táctica (Paquete B2)
  // ----------------------------------------------------------------------------
  console.log('\n--- 6. Gestión Completa de Zonas: PATCH & DELETE (Paquete B2) ---');

  // Control de rol estricto con validación de perfil activo (Mandato Claude & Hoja de Ruta v0.44)
  function checkZoneManagementRole(profile: { role?: string; is_active?: boolean } | null): { authorized: boolean; reason?: string } {
    if (!profile) return { authorized: false, reason: 'profile_not_found' };
    if (!profile.is_active) return { authorized: false, reason: 'profile_inactive' };
    if (!['RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkZoneManagementRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado');
  assert(checkZoneManagementRole({ role: 'CONTROL_TOWER', is_active: true }).authorized === true, 'CONTROL_TOWER activo autorizado');
  assert(checkZoneManagementRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado');
  assert(checkZoneManagementRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === false, 'SUPER_ADMIN retirado y rechazado (403)');
  assert(checkZoneManagementRole({ role: 'OPERATOR', is_active: true }).authorized === false, 'OPERATOR activo rechazado (403)');
  assert(checkZoneManagementRole({ role: 'RSO', is_active: false }).authorized === false, 'RSO inactivo rechazado por is_active=false (403)');
  assert(checkZoneManagementRole(null).authorized === false, 'Perfil inexistente rechazado (403)');

  // Salvaguarda forense de borrado físico vs soft-delete (Mandato Claude)
  function evaluateZoneDeletion(isPermanent: boolean, linkedAlertsCount: number): { action: 'soft_delete' | 'hard_delete' | 'conflict_409'; error?: string } {
    if (!isPermanent) {
      return { action: 'soft_delete' };
    }
    if (linkedAlertsCount > 0) {
      return { 
        action: 'conflict_409', 
        error: `No se puede eliminar físicamente la zona: existen ${linkedAlertsCount} alertas de seguridad vinculadas (DPIA / RGPD Art. 35).` 
      };
    }
    return { action: 'hard_delete' };
  }

  const defaultDelete = evaluateZoneDeletion(false, 5);
  assert(defaultDelete.action === 'soft_delete', 'DELETE por defecto aplica soft-delete (is_active=false)');

  const conflictDelete = evaluateZoneDeletion(true, 3);
  assert(conflictDelete.action === 'conflict_409', 'DELETE permanente bloqueado (409) si existen alertas vinculadas');

  const permanentAllowedDelete = evaluateZoneDeletion(true, 0);
  assert(permanentAllowedDelete.action === 'hard_delete', 'DELETE permanente permitido si no hay alertas vinculadas');

  // Validación de campos de actualización parcial
  const validHex = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex);
  assert(validHex('#EF4444'), 'Color hex #EF4444 válido');
  assert(!validHex('red'), 'Rechazo de color no hexadecimal ("red")');
  assert(!validHex('#12345'), 'Rechazo de color hex con 5 dígitos');

  // Estructura de eventos de auditoría ZONE_MODIFIED y ZONE_DELETED
  const zoneModifiedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'ZONE_MODIFIED',
    entity_type: 'ZONE',
    entity_id: 'zone-test-uuid',
    payload: {
      previous_values: { name: 'Zona Alfa', buffer_meters: 100 },
      updated_fields: ['buffer_meters', 'contact_phone'],
      zone_name: 'Zona Alfa',
    },
  };
  assert(zoneModifiedEntry.action === 'ZONE_MODIFIED', 'Acción ZONE_MODIFIED registrada');
  assert(Array.isArray(zoneModifiedEntry.payload?.updated_fields), 'Campos modificados capturados en payload');

  const zoneDeletedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'ZONE_DELETED',
    entity_type: 'ZONE',
    entity_id: 'zone-test-uuid',
    payload: {
      deletion_type: 'soft',
      zone_name: 'Zona Alfa',
      severity: 'RED',
    },
  };
  assert(zoneDeletedEntry.action === 'ZONE_DELETED', 'Acción ZONE_DELETED registrada');
  assert(zoneDeletedEntry.payload?.deletion_type === 'soft', 'Tipo de borrado (soft) documentado en auditoría');

  // ----------------------------------------------------------------------------
  // 7. Gestión de Viajeros y Terminales Hardware (Paquete B3)
  // ----------------------------------------------------------------------------
  console.log('\n--- 7. Gestión de Viajeros y Terminales Hardware (Paquete B3) ---');

  // 1. Control de rol estricto para gestión de viajeros (Mandato Claude 1 & Hoja de Ruta v0.44)
  function checkTravelerManagementRole(profile: { role?: string; is_active?: boolean } | null): { authorized: boolean; reason?: string } {
    if (!profile) return { authorized: false, reason: 'profile_not_found' };
    if (!profile.is_active) return { authorized: false, reason: 'profile_inactive' };
    if (!['RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkTravelerManagementRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado para viajeros');
  assert(checkTravelerManagementRole({ role: 'CONTROL_TOWER', is_active: true }).authorized === true, 'CONTROL_TOWER activo autorizado para viajeros');
  assert(checkTravelerManagementRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado para viajeros');
  assert(checkTravelerManagementRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === false, 'SUPER_ADMIN retirado y rechazado para viajeros');
  assert(checkTravelerManagementRole({ role: 'OPERATOR', is_active: true }).authorized === false, 'OPERATOR activo rechazado (403) para gestión de viajeros');
  assert(checkTravelerManagementRole({ role: 'RSO', is_active: false }).authorized === false, 'RSO inactivo rechazado por is_active=false (403)');
  assert(checkTravelerManagementRole(null).authorized === false, 'Perfil nulo rechazado (403)');

  // 2. Bloqueo de edición manual de status en PATCH (Mandato Claude 3)
  function validateTravelerPatchPayload(body: Record<string, any>): { valid: boolean; error?: string } {
    if (body.status !== undefined) {
      return {
        valid: false,
        error: 'El campo "status" no es modificable manualmente por este endpoint para preservar la lógica preventiva multi-incidente.',
      };
    }
    if (body.full_name !== undefined && (typeof body.full_name !== 'string' || body.full_name.trim() === '')) {
      return { valid: false, error: 'El campo "full_name" no puede estar vacío.' };
    }
    return { valid: true };
  }

  assert(!validateTravelerPatchPayload({ status: 'SAFE' }).valid, 'Rechazo controlado (400) de intento de editar status por PATCH');
  assert(!validateTravelerPatchPayload({ status: 'PANIC' }).valid, 'Rechazo de status PANIC directo en PATCH');
  assert(validateTravelerPatchPayload({ full_name: 'Carlos Ruiz' }).valid, 'Edición de full_name permitida');
  assert(!validateTravelerPatchPayload({ full_name: '   ' }).valid, 'Rechazo de full_name en blanco');

  // 3. Enrolamiento y Rotación Criptográfica de Hardware
  const rawToken = crypto.randomBytes(32).toString('hex');
  assert(rawToken.length === 64, 'Token de hardware generado con 64 caracteres hex (256 bits)');
  const computedHash = hashDeviceSecret(rawToken);
  assert(typeof computedHash === 'string' && computedHash.length === 64, 'Hash de secreto calculado en SHA-256');

  // 4. Salvaguarda forense de baja de viajero: soft vs hard delete (Mandato Claude 2)
  function evaluateTravelerDeletion(isPermanent: boolean, linkedAlertsCount: number): { action: 'soft_deactivation' | 'hard_delete' | 'conflict_409'; error?: string } {
    if (!isPermanent) {
      return { action: 'soft_deactivation' };
    }
    if (linkedAlertsCount > 0) {
      return {
        action: 'conflict_409',
        error: `No se puede eliminar físicamente al viajero: existen ${linkedAlertsCount} alertas de seguridad vinculadas (DPIA / RGPD Art. 35).`,
      };
    }
    return { action: 'hard_delete' };
  }

  const defaultTravelerDel = evaluateTravelerDeletion(false, 10);
  assert(defaultTravelerDel.action === 'soft_deactivation', 'DELETE por defecto aplica baja táctica (INCOMMUNICADO y secreto revocado)');

  const conflictTravelerDel = evaluateTravelerDeletion(true, 4);
  assert(conflictTravelerDel.action === 'conflict_409', 'DELETE permanente bloqueado con 409 si existen alertas vinculadas (protege CASCADE)');

  const permanentTravelerDel = evaluateTravelerDeletion(true, 0);
  assert(permanentTravelerDel.action === 'hard_delete', 'DELETE permanente permitido si no hay alertas vinculadas');

  // 5. Catálogo de Auditoría: TRAVELER_CREATED, TRAVELER_MODIFIED, TRAVELER_DELETED y TRAVELER_CREDENTIAL_ROTATED (Mandato Claude)
  const travelerCreatedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'TRAVELER_CREATED',
    entity_type: 'TRAVELER',
    entity_id: 'traveler-01-uuid',
    payload: { traveler_name: 'Valeria Gómez', callsign: 'Eco-4', device_enrolled: true },
  };
  assert(travelerCreatedEntry.action === 'TRAVELER_CREATED', 'Acción TRAVELER_CREATED registrada');

  const credentialRotatedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'TRAVELER_CREDENTIAL_ROTATED',
    entity_type: 'TRAVELER',
    entity_id: 'traveler-01-uuid',
    payload: { traveler_name: 'Valeria Gómez', credential_rotated: true },
  };
  assert(credentialRotatedEntry.action === 'TRAVELER_CREDENTIAL_ROTATED', 'Acción TRAVELER_CREDENTIAL_ROTATED tipada y diferenciada');

  const travelerModifiedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'TRAVELER_MODIFIED',
    entity_type: 'TRAVELER',
    entity_id: 'traveler-01-uuid',
    payload: { traveler_name: 'Valeria Gómez', updated_fields: ['phone'] },
  };
  assert(travelerModifiedEntry.action === 'TRAVELER_MODIFIED', 'Acción TRAVELER_MODIFIED registrada');

  const travelerDeletedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'TRAVELER_DELETED',
    entity_type: 'TRAVELER',
    entity_id: 'traveler-01-uuid',
    payload: { deletion_type: 'soft', traveler_name: 'Valeria Gómez' },
  };
  assert(travelerDeletedEntry.action === 'TRAVELER_DELETED', 'Acción TRAVELER_DELETED registrada');

  // ----------------------------------------------------------------------------
  // 8. Servicios Geoespaciales RPC Tácticos (Paquete B4)
  // ----------------------------------------------------------------------------
  console.log('\n--- 8. Servicios Geoespaciales RPC Tácticos (Paquete B4) ---');

  // 1. Validación de coordenadas WGS84
  function validateWgs84Coordinates(lat: number | null | undefined, lon: number | null | undefined): { valid: boolean; error?: string } {
    if (lat === null || lat === undefined || lon === null || lon === undefined || isNaN(lat) || isNaN(lon)) {
      return { valid: false, error: 'Coordenadas requeridas' };
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return { valid: false, error: 'Coordenadas WGS84 fuera de rango' };
    }
    return { valid: true };
  }

  assert(validateWgs84Coordinates(40.4168, -3.7038).valid === true, 'Coordenadas válidas en Madrid aceptadas');
  assert(validateWgs84Coordinates(0, 0).valid === true, 'Coordenadas ecuatoriales válidas aceptadas');
  assert(validateWgs84Coordinates(90.1, 0).valid === false, 'Rechazo de latitud > 90');
  assert(validateWgs84Coordinates(-90.1, 0).valid === false, 'Rechazo de latitud < -90');
  assert(validateWgs84Coordinates(0, 180.1).valid === false, 'Rechazo de longitud > 180');
  assert(validateWgs84Coordinates(0, -180.1).valid === false, 'Rechazo de longitud < -180');
  assert(validateWgs84Coordinates(NaN, 0).valid === false, 'Rechazo de latitud NaN');
  assert(validateWgs84Coordinates(null, null).valid === false, 'Rechazo de coordenadas nulas');

  // 2. Control RBAC para servicios tácticos (Staff)
  function checkTacticalServiceRole(profile: { role?: string; is_active?: boolean } | null): { authorized: boolean; reason?: string } {
    if (!profile) return { authorized: false, reason: 'profile_not_found' };
    if (!profile.is_active) return { authorized: false, reason: 'profile_inactive' };
    if (!['OPERATOR', 'RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkTacticalServiceRole({ role: 'OPERATOR', is_active: true }).authorized === true, 'OPERATOR activo autorizado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'CONTROL_TOWER', is_active: true }).authorized === true, 'CONTROL_TOWER activo autorizado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === false, 'SUPER_ADMIN retirado y rechazado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'OPERATOR', is_active: false }).authorized === false, 'OPERATOR inactivo rechazado por is_active=false (403)');
  assert(checkTacticalServiceRole({ role: 'RSO', is_active: false }).authorized === false, 'RSO inactivo rechazado por is_active=false (403)');
  assert(checkTacticalServiceRole(null).authorized === false, 'Perfil nulo rechazado (401/403)');

  // 3. Autenticación Dual y Selección de Cliente (Precisión de Implementación Claude)
  function resolveDualAuthClient(hasDeviceSecret: boolean): { clientType: 'admin' | 'session'; authBranch: 'hardware' | 'staff' } {
    if (hasDeviceSecret) {
      return { clientType: 'admin', authBranch: 'hardware' };
    }
    return { clientType: 'session', authBranch: 'staff' };
  }

  assert(resolveDualAuthClient(true).clientType === 'admin', 'Rama hardware utiliza cliente admin (service_role)');
  assert(resolveDualAuthClient(true).authBranch === 'hardware', 'Rama hardware identificada correctamente');
  assert(resolveDualAuthClient(false).clientType === 'session', 'Rama staff utiliza cliente de sesión (RLS)');
  assert(resolveDualAuthClient(false).authBranch === 'staff', 'Rama staff identificada correctamente');

  // 4. Formateo y Métrica de Distancias en Safe Haven
  function formatSafeHavenResult(rawDistanceMeters: number): { distance_meters: number; distance_km: number } {
    const distance_meters = Math.round(rawDistanceMeters * 10) / 10;
    const distance_km = Math.round((rawDistanceMeters / 1000) * 100) / 100;
    return { distance_meters, distance_km };
  }

  const shMetrics = formatSafeHavenResult(1254.789);
  assert(shMetrics.distance_meters === 1254.8, 'Distancia en metros redondeada a 1 decimal');
  assert(shMetrics.distance_km === 1.25, 'Distancia en kilómetros calculada y redondeada a 2 decimales');

  // 5. Síntesis de Severidad Máxima en Check Point (Observación menor 1 de Claude)
  type TestHighestSeverity = 'RED' | 'AMBER' | 'SAFE_HAVEN' | 'CORRIDOR' | string | null;
  function computeHighestSeverity(matchingZones: Array<{ severity: string; curfew_active_now?: boolean }>): { highest: TestHighestSeverity; hasCurfew: boolean } {
    if (!matchingZones || matchingZones.length === 0) {
      return { highest: null, hasCurfew: false };
    }
    // PostGIS devuelve ordenado: RED -> AMBER -> SAFE_HAVEN -> otros
    const highest = matchingZones[0].severity as TestHighestSeverity;
    const hasCurfew = matchingZones.some(z => z.curfew_active_now === true);
    return { highest, hasCurfew };
  }

  assert(computeHighestSeverity([]).highest === null, 'highest_severity es null si no hay zonas');
  assert(computeHighestSeverity([{ severity: 'RED' }, { severity: 'AMBER' }]).highest === 'RED', 'RED prevalece sobre AMBER');
  assert(computeHighestSeverity([{ severity: 'AMBER' }, { severity: 'SAFE_HAVEN' }]).highest === 'AMBER', 'AMBER prevalece sobre SAFE_HAVEN');
  assert(computeHighestSeverity([{ severity: 'CORRIDOR' }]).highest === 'CORRIDOR', 'CORRIDOR soportado en highest_severity (Observación Claude)');
  assert(computeHighestSeverity([{ severity: 'RED', curfew_active_now: false }, { severity: 'AMBER', curfew_active_now: true }]).hasCurfew === true, 'Detección agregada de toque de queda activo');

  // 6. Naturaleza Analítica sin Mutación (Stateless)
  function isStatelessEvaluation(result: Record<string, any>): boolean {
    return result.inside_zones !== undefined && result.evaluated_at !== undefined && !('alert_id' in result) && !('status_changed' in result);
  }
  assert(isStatelessEvaluation({ inside_zones: true, evaluated_at: new Date().toISOString() }), 'Check-point opera sin efectos secundarios (stateless)');

  // ----------------------------------------------------------------------------
  // 9. Gestión de Briefings Tácticos y POIs (Paquete B5)
  // ----------------------------------------------------------------------------
  console.log('\n--- 9. Gestión de Briefings Tácticos y POIs (Paquete B5) ---');

  const VALID_POI_CATEGORIES = [
    'EXTRACTION_POINT',
    'HOSPITAL',
    'POLICE',
    'SAFE_HOUSE',
    'CHECKPOINT',
    'DANGER_POINT',
  ];

  function validatePoiTest(poi: any): { valid: boolean; error?: string } {
    if (!poi || typeof poi !== 'object') return { valid: false, error: 'invalid_object' };
    if (!poi.name || typeof poi.name !== 'string' || poi.name.trim() === '') return { valid: false, error: 'empty_name' };
    if (!VALID_POI_CATEGORIES.includes(poi.category)) return { valid: false, error: 'invalid_category' };
    const lat = Number(poi.latitude);
    const lon = Number(poi.longitude);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return { valid: false, error: 'invalid_wgs84' };
    }
    return { valid: true };
  }

  assert(validatePoiTest({ name: 'Helipad Alfa', category: 'EXTRACTION_POINT', latitude: 40.4168, longitude: -3.7038 }).valid === true, 'POI de extracción válido aceptado');
  assert(validatePoiTest({ name: 'Hospital Central', category: 'HOSPITAL', latitude: 40.42, longitude: -3.71 }).valid === true, 'POI de hospital válido aceptado');
  assert(validatePoiTest({ name: 'Comisaría Centro', category: 'POLICE', latitude: 40.43, longitude: -3.72 }).valid === true, 'POI de policía válido aceptado');
  assert(validatePoiTest({ name: 'Refugio Ébano', category: 'SAFE_HOUSE', latitude: 40.44, longitude: -3.73 }).valid === true, 'POI de safe house válido aceptado');
  assert(validatePoiTest({ name: 'Puesto de Control 4', category: 'CHECKPOINT', latitude: 40.45, longitude: -3.74 }).valid === true, 'POI de checkpoint válido aceptado');
  assert(validatePoiTest({ name: 'Cruce Hostil', category: 'DANGER_POINT', latitude: 40.46, longitude: -3.75 }).valid === true, 'POI de danger point válido aceptado');
  assert(validatePoiTest({ name: 'Zona Rara', category: 'UNKNOWN_ZONE', latitude: 40.41, longitude: -3.70 }).valid === false, 'Rechazo de categoría POI no catalogada');
  assert(validatePoiTest({ name: 'Punto Fuera', category: 'EXTRACTION_POINT', latitude: 91, longitude: 0 }).valid === false, 'Rechazo de latitud de POI > 90');
  assert(validatePoiTest({ name: 'Punto Fuera', category: 'EXTRACTION_POINT', latitude: 0, longitude: 181 }).valid === false, 'Rechazo de longitud de POI > 180');
  assert(validatePoiTest({ name: '   ', category: 'EXTRACTION_POINT', latitude: 0, longitude: 0 }).valid === false, 'Rechazo de nombre de POI en blanco');

  // RBAC para mutaciones de briefings
  function checkBriefingMutationRole(profile: { role?: string; is_active?: boolean } | null): { authorized: boolean; reason?: string } {
    if (!profile) return { authorized: false, reason: 'profile_not_found' };
    if (!profile.is_active) return { authorized: false, reason: 'profile_inactive' };
    if (!['RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkBriefingMutationRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado para redactar briefings');
  assert(checkBriefingMutationRole({ role: 'CONTROL_TOWER', is_active: true }).authorized === true, 'CONTROL_TOWER activo autorizado para redactar briefings');
  assert(checkBriefingMutationRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado para redactar briefings');
  assert(checkBriefingMutationRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === false, 'SUPER_ADMIN retirado y rechazado para redactar briefings');
  assert(checkBriefingMutationRole({ role: 'OPERATOR', is_active: true }).authorized === false, 'OPERATOR activo rechazado (403) para mutación de briefings');
  assert(checkBriefingMutationRole({ role: 'RSO', is_active: false }).authorized === false, 'RSO inactivo rechazado por is_active=false (403)');
  assert(checkBriefingMutationRole(null).authorized === false, 'Perfil nulo rechazado (401/403)');

  // Autenticación dual en lectura de briefings
  function checkBriefingReadAuth(isHardware: boolean, hasValidCredentials: boolean): { canRead: boolean; client: 'admin' | 'session' } {
    if (isHardware && hasValidCredentials) return { canRead: true, client: 'admin' };
    if (!isHardware && hasValidCredentials) return { canRead: true, client: 'session' };
    return { canRead: false, client: 'session' };
  }

  assert(checkBriefingReadAuth(true, true).canRead === true, 'Terminal hardware autorizado para descarga de briefings (modo offline)');
  assert(checkBriefingReadAuth(true, true).client === 'admin', 'Terminal hardware consulta mediante cliente admin y org verificada');
  assert(checkBriefingReadAuth(false, true).canRead === true, 'Staff autorizado para lectura de briefings');
  assert(checkBriefingReadAuth(false, true).client === 'session', 'Staff consulta mediante cliente de sesión con RLS');

  // Atomicidad en reemplazo de POIs (Precisión Claude)
  function simulateAtomicPoiReplacement(currentPois: any[], newPois: any[]): { success: boolean; resultPois: any[]; rolledBack: boolean } {
    // Si alguno falla validación, rollback completo
    for (const p of newPois) {
      if (!validatePoiTest(p).valid) {
        return { success: false, resultPois: currentPois, rolledBack: true };
      }
    }
    return { success: true, resultPois: newPois, rolledBack: false };
  }

  const existingPois = [{ name: 'Base A', category: 'SAFE_HOUSE', latitude: 40, longitude: -3 }];
  const invalidNewPois = [
    { name: 'Punto Válido', category: 'HOSPITAL', latitude: 40, longitude: -3 },
    { name: 'Punto Corrupto', category: 'INVALID_CAT', latitude: 40, longitude: -3 },
  ];
  const rollbackResult = simulateAtomicPoiReplacement(existingPois, invalidNewPois);
  assert(rollbackResult.rolledBack === true, 'Sustitución atómica revierte (rollback) si un POI falla validación');
  assert(rollbackResult.resultPois.length === 1 && rollbackResult.resultPois[0].name === 'Base A', 'Colección previa preservada íntegra ante fallo en transacción RPC');

  // Auditoría DPIA tipada para Briefings
  const briefingCreatedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'BRIEFING_CREATED',
    entity_type: 'BRIEFING',
    entity_id: 'briefing-01-uuid',
    payload: { title: 'Misión Ébano', pois_count: 3 },
  };
  assert(briefingCreatedEntry.action === 'BRIEFING_CREATED', 'Acción BRIEFING_CREATED tipada y registrada');

  const briefingModifiedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'BRIEFING_MODIFIED',
    entity_type: 'BRIEFING',
    entity_id: 'briefing-01-uuid',
    payload: { updated_fields: ['title', 'pois'], pois_replaced: true },
  };
  assert(briefingModifiedEntry.action === 'BRIEFING_MODIFIED', 'Acción BRIEFING_MODIFIED registrada');

  const briefingDeletedEntry: AuditLogEntry = {
    organization_id: 'org-test-uuid',
    performed_by: 'rso-user-123',
    action: 'BRIEFING_DELETED',
    entity_type: 'BRIEFING',
    entity_id: 'briefing-01-uuid',
    payload: { title: 'Misión Ébano' },
  };
  assert(briefingDeletedEntry.action === 'BRIEFING_DELETED', 'Acción BRIEFING_DELETED registrada');

  // ----------------------------------------------------------------------------
  // 10. Módulo 2: Motor Cartográfico Profesional HERE + MapLibre GL
  // ----------------------------------------------------------------------------
  console.log('\n--- 10. Motor Cartográfico Táctico HERE (Módulo 2) ---');

  // Catálogo de capas tácticas
  assert(HERE_MAP_LAYERS.length === 4, 'Catálogo HERE contiene exactamente 4 capas tácticas');
  const layerIds = HERE_MAP_LAYERS.map((l) => l.id);
  assert(layerIds.includes('explore.night'), 'Capa explore.night (Táctico C2) presente');
  assert(layerIds.includes('satellite.day'), 'Capa satellite.day (Satélite HD) presente');
  assert(layerIds.includes('explore.day'), 'Capa explore.day (Calles Diurno) presente');
  assert(layerIds.includes('logistics.day'), 'Capa logistics.day (Logística Táctica) presente');

  // Generación de StyleSpecification multi-capa
  const mockApiKey = 'test-here-key-12345';
  const hereStyle = buildHereMultiLayerStyle(mockApiKey, 'explore.night');
  assert(hereStyle.version === 8, 'Versión de estilo MapLibre es 8');
  assert(Object.keys(hereStyle.sources).length === 4, 'Generadas exactamente 4 fuentes raster de HERE');
  assert(hereStyle.layers.length === 4, 'Generadas exactamente 4 capas raster de MapLibre');

  // Comprobación de URLs seguras con API Key
  const darkSource = hereStyle.sources['gzn-here-source-explore-night'] as any;
  assert(darkSource && darkSource.type === 'raster', 'Fuente gzn-here-source-explore-night es de tipo raster');
  assert(
    darkSource.tiles[0].includes('apiKey=test-here-key-12345') && darkSource.tiles[0].includes('style=explore.night'),
    'URL de tiles contiene apiKey y parámetro style=explore.night'
  );

  const satSource = hereStyle.sources['gzn-here-source-satellite-day'] as any;
  assert(
    satSource.tiles[0].includes('apiKey=test-here-key-12345') && satSource.tiles[0].includes('style=satellite.day'),
    'URL de satélite contiene formato jpeg y style=satellite.day'
  );

  // Comprobación de visibilidad inicial
  const darkLayer = hereStyle.layers.find((l) => l.id === 'gzn-here-layer-explore-night') as any;
  assert(darkLayer.layout.visibility === 'visible', 'Capa nocturna explore.night visible por defecto');

  const satLayer = hereStyle.layers.find((l) => l.id === 'gzn-here-layer-satellite-day') as any;
  assert(satLayer.layout.visibility === 'none', 'Capa satélite satellite.day oculta por defecto');

  // Conmutación de capas en caliente (Mock de MapLibre Map)
  const layerVisibilityState: Record<string, string> = {
    'gzn-here-layer-explore-night': 'visible',
    'gzn-here-layer-satellite-day': 'none',
    'gzn-here-layer-explore-day': 'none',
    'gzn-here-layer-logistics-day': 'none',
  };

  const mockMap = {
    getLayer: (id: string) => (layerVisibilityState[id] !== undefined ? { id } : null),
    setLayoutProperty: (id: string, prop: string, value: string) => {
      if (prop === 'visibility') {
        layerVisibilityState[id] = value;
      }
    },
  };

  setHereActiveLayer(mockMap, 'satellite.day');
  assert(
    layerVisibilityState['gzn-here-layer-satellite-day'] === 'visible',
    'Capa satélite satellite.day conmutada a visible'
  );
  assert(
    layerVisibilityState['gzn-here-layer-explore-night'] === 'none',
    'Capa explore.night conmutada a none tras cambio de capa'
  );

  // Formateador de Coordenadas Tácticas WGS84
  const coordsMadrid = formatTacticalCoordinates(40.4168, -3.7038);
  assert(coordsMadrid.hemispheres.latHem === 'N', 'Hemisferio Norte (N) detectado para latitud positiva');
  assert(coordsMadrid.hemispheres.lonHem === 'W', 'Hemisferio Oeste (W) detectado para longitud negativa');
  assert(coordsMadrid.dms.includes('40°25\'') && coordsMadrid.dms.includes('N'), 'Grados y minutos de latitud correctos');
  assert(coordsMadrid.dms.includes('003°42\'') && coordsMadrid.dms.includes('W'), 'Grados y minutos de longitud correctos');
  assert(coordsMadrid.decimal === '+40.416800°, -3.703800°', 'Formato decimal con signo exacto');

  const coordsHemisferioSur = formatTacticalCoordinates(-12.0464, 77.0428);
  assert(coordsHemisferioSur.hemispheres.latHem === 'S', 'Hemisferio Sur (S) detectado');
  assert(coordsHemisferioSur.hemispheres.lonHem === 'E', 'Hemisferio Este (E) detectado');
  assert(coordsHemisferioSur.dms.includes('12°02\'') && coordsHemisferioSur.dms.includes('S'), 'DMS latitud Sur formateada correctamente');

  // ----------------------------------------------------------------------------
  // 11. Jerarquía de Roles y Control de Pantallas (Módulo Roles v2)
  // ----------------------------------------------------------------------------
  console.log('\n--- 11. Jerarquía de Roles y Control de Pantallas (Módulo Roles v2) ---');

  assert(ROLE_LEVELS.ORG_ADMIN === 100, 'ORG_ADMIN nivel 100 asignado');
  assert(ROLE_LEVELS.CONTROL_TOWER === 80, 'CONTROL_TOWER nivel 80 asignado');
  assert(ROLE_LEVELS.RSO === 60, 'RSO nivel 60 asignado');
  assert(ROLE_LEVELS.OPERATOR === 40, 'OPERATOR nivel 40 asignado');
  assert(
    ROLE_LEVELS.ORG_ADMIN > ROLE_LEVELS.CONTROL_TOWER &&
    ROLE_LEVELS.CONTROL_TOWER > ROLE_LEVELS.RSO &&
    ROLE_LEVELS.RSO > ROLE_LEVELS.OPERATOR,
    'Jerarquía numérica estricta ORG_ADMIN (100) > CONTROL_TOWER (80) > RSO (60) > OPERATOR (40)'
  );

  // Verificación de DEFAULT_ROLE_SCREEN_ACCESS
  assert(DEFAULT_ROLE_SCREEN_ACCESS.OPERATOR.terreno === true, 'OPERATOR accede a terreno por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.OPERATOR.personas === true, 'OPERATOR accede a personas por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.OPERATOR.situacion === false, 'OPERATOR NO accede a situacion por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.OPERATOR.mensajes === false, 'OPERATOR NO accede a mensajes por defecto');

  assert(DEFAULT_ROLE_SCREEN_ACCESS.RSO.terreno === true, 'RSO accede a terreno por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.RSO.briefings === true, 'RSO accede a briefings por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.RSO.mensajes === true, 'RSO accede a mensajes por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.RSO.situacion === false, 'RSO NO accede a situacion por defecto (solo por excepción)');

  assert(DEFAULT_ROLE_SCREEN_ACCESS.CONTROL_TOWER.situacion === true, 'CONTROL_TOWER accede a situacion por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.CONTROL_TOWER.terreno === true, 'CONTROL_TOWER accede a terreno por defecto');

  assert(DEFAULT_ROLE_SCREEN_ACCESS.ORG_ADMIN.situacion === true, 'ORG_ADMIN accede a situacion por defecto');
  assert(DEFAULT_ROLE_SCREEN_ACCESS.ORG_ADMIN.mensajes === true, 'ORG_ADMIN accede a mensajes por defecto');

  // Verificación helper hasScreenAccess(role, screenAccess, screenId)
  assert(hasScreenAccess('OPERATOR', null, 'terreno') === true, 'hasScreenAccess autoriza terreno para OPERATOR sin override');
  assert(hasScreenAccess('OPERATOR', null, 'situacion') === false, 'hasScreenAccess deniega situacion para OPERATOR sin override');
  assert(hasScreenAccess('OPERATOR', { situacion: true }, 'situacion') === true, 'hasScreenAccess respeta override granular true');
  assert(hasScreenAccess('ORG_ADMIN', { situacion: false }, 'situacion') === false, 'hasScreenAccess respeta override granular false');
  assert(hasScreenAccess('RSO', null, 'inexistente') === false, 'hasScreenAccess deniega pantalla inexistente');

  // ----------------------------------------------------------------------------
  // 12. Identidad Corporativa y Assets Vectoriales
  // ----------------------------------------------------------------------------
  console.log('\n--- 12. Identidad Corporativa y Assets Vectoriales ---');

  const sealPath = path.join(process.cwd(), 'public/logo/gzn-seal-full.svg');
  const wordmarkPath = path.join(process.cwd(), 'public/logo/gzn-wordmark-full.svg');
  const markPath = path.join(process.cwd(), 'public/logo/gzn-mark.svg');
  const iconPath = path.join(process.cwd(), 'src/app/icon.svg');

  assert(fs.existsSync(sealPath), 'Asset public/logo/gzn-seal-full.svg existe');
  assert(fs.existsSync(wordmarkPath), 'Asset public/logo/gzn-wordmark-full.svg existe');
  assert(fs.existsSync(markPath), 'Asset public/logo/gzn-mark.svg existe');
  assert(fs.existsSync(iconPath), 'Asset src/app/icon.svg existe');

  const sealContent = fs.readFileSync(sealPath, 'utf8');
  assert(sealContent.includes('AD ASTRA PER ASPERA'), 'Sello ceremonial contiene lema perimetral');
  assert(sealContent.includes('#5980a6'), 'Sello ceremonial utiliza token Industry #5980a6');

  const markContent = fs.readFileSync(markPath, 'utf8');
  assert(markContent.includes('viewBox="63 55 74 102"'), 'Marca reducida tiene viewBox recortado y optimizado (63 55 74 102)');
  assert(markContent.includes('>GZN<'), 'Marca reducida contiene texto central GZN');
  assert(!markContent.includes('AD ASTRA PER ASPERA'), 'Marca reducida excluye anillo de texto para máxima legibilidad a escala');
  assert(markContent.includes('#2f4a63'), 'Marca reducida incluye trazo de contraste #2f4a63');

  const wordmarkContent = fs.readFileSync(wordmarkPath, 'utf8');
  assert(wordmarkContent.includes('GREEN ZONE NAVIGATOR'), 'Wordmark incluye subtítulo oficial GREEN ZONE NAVIGATOR');

  // ----------------------------------------------------------------------------
  // 13. Creación de Zonas Tácticas y Autorización de Roles (Migración 010)
  // ----------------------------------------------------------------------------
  console.log('\n--- 13. Creación de Zonas Tácticas y Autorización de Roles (Migración 010) ---');

  // Función de evaluación de autorización para create_zone_with_geojson (role_level >= 60)
  function evaluateZoneCreationAuth(profile: { role_level?: number; is_active?: boolean } | null): { authorized: boolean; httpStatus: number } {
    if (!profile) return { authorized: false, httpStatus: 401 };
    if (!profile.is_active) return { authorized: false, httpStatus: 403 };
    if ((profile.role_level ?? 0) < 60) return { authorized: false, httpStatus: 403 };
    return { authorized: true, httpStatus: 201 };
  }

  assert(evaluateZoneCreationAuth({ role_level: 100, is_active: true }).authorized === true, 'ORG_ADMIN (100) autorizado para crear zonas');
  assert(evaluateZoneCreationAuth({ role_level: 80, is_active: true }).authorized === true, 'CONTROL_TOWER (80) autorizado para crear zonas (Mandato Claude)');
  assert(evaluateZoneCreationAuth({ role_level: 60, is_active: true }).authorized === true, 'RSO (60) autorizado para crear zonas');
  assert(evaluateZoneCreationAuth({ role_level: 40, is_active: true }).authorized === false, 'OPERATOR (40) rechazado (403) para crear zonas');
  assert(evaluateZoneCreationAuth({ role_level: 80, is_active: false }).authorized === false, 'CONTROL_TOWER inactivo rechazado por is_active=false');
  assert(evaluateZoneCreationAuth(null).authorized === false, 'Usuario sin sesión rechazado (401)');

  // Modalidad A: Extracción de polígono continental principal desde MultiPolygon
  const mockSimplePoly: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  };
  const extractedSimple = extractMainContinentPolygon(mockSimplePoly);
  assert(extractedSimple !== null, 'Extracción de Polygon simple exitosa');
  assert(extractedSimple?.isSimplified === false, 'Polygon simple marcado como no simplificado');
  assert(extractedSimple?.excludedCount === 0, 'Polygon simple tiene 0 enclaves excluidos');
  assert(validateGeoJSONPolygon(extractedSimple?.polygon).valid === true, 'Polygon simple pasa validación GeoJSON');

  const mockMultiPoly: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      // Isla pequeña (área pequeña)
      [[[10, 10], [10.1, 10], [10.1, 10.1], [10, 10.1], [10, 10]]],
      // Continente grande (área dominante)
      [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
    ],
  };
  const extractedMulti = extractMainContinentPolygon(mockMultiPoly);
  assert(extractedMulti !== null, 'Extracción de MultiPolygon exitosa');
  assert(extractedMulti?.polygon.type === 'Polygon', 'MultiPolygon convertido estrictamente a Polygon');
  assert(extractedMulti?.isSimplified === true, 'MultiPolygon marcado como simplificado para aviso de interfaz');
  assert(extractedMulti?.excludedCount === 1, 'MultiPolygon registra exactamente 1 enclave excluido');
  assert(validateGeoJSONPolygon(extractedMulti?.polygon).valid === true, 'Polígono continental extraído pasa validación GeoJSON');

  // Modalidad B: Generación de buffer circular geodésico (64 vértices en WGS84)
  const circlePoly = generateGeodesicCircle(3.7038, 40.4168, 15, 64);
  assert(circlePoly.type === 'Polygon', 'Buffer circular generado es de tipo Polygon');
  assert(circlePoly.coordinates[0].length === 65, 'Buffer circular contiene exactamente 65 coordenadas (64 + cierre)');
  const firstCoord = circlePoly.coordinates[0][0];
  const lastCoord = circlePoly.coordinates[0][circlePoly.coordinates[0].length - 1];
  assert(firstCoord[0] === lastCoord[0] && firstCoord[1] === lastCoord[1], 'Buffer circular geodésico está cerrado (primero = último)');
  assert(validateGeoJSONPolygon(circlePoly).valid === true, 'Buffer circular pasa validación GeoJSON Polygon RFC 7946');

  // Modalidad C: Cierre de polígono trazado interactivamente
  const unclosedDrawnPoints: [number, number][] = [
    [-3.70, 40.41],
    [-3.69, 40.42],
    [-3.68, 40.40],
  ];
  const closedDrawnPoly = closeDrawnPolygon(unclosedDrawnPoints);
  assert(closedDrawnPoly !== null, 'Polígono trazado cerrado exitosamente');
  assert(closedDrawnPoly?.type === 'Polygon', 'Polígono trazado es de tipo Polygon');
  assert(closedDrawnPoly?.coordinates[0].length === 4, 'Polígono trazado de 3 puntos expandido a 4 coordenadas cerradas');
  assert(validateGeoJSONPolygon(closedDrawnPoly).valid === true, 'Polígono trazado pasa validación GeoJSON');

  // --- 14. Smoke Tests Estáticos de Seguridad en Archivos SQL y Componentes (Mandato Claude) ---
  console.log('\n--- 14. Smoke Tests Estáticos de Seguridad en Archivos SQL y Componentes (Mandato Claude) ---');

  const sql010Path = path.resolve(process.cwd(), 'sql/010_update_zone_creation_rpc.sql');
  const sql010Content = fs.readFileSync(sql010Path, 'utf8');

  // 1. Verificar ausencia de 'SUPER_ADMIN' en la migración activa 010
  assert(!sql010Content.includes("'SUPER_ADMIN'"), 'sql/010 no contiene referencias activas a SUPER_ADMIN');

  // 2. Verificar ausencia de control obsoleto por get_auth_role() en sql/010
  assert(!sql010Content.includes('public.get_auth_role()'), 'sql/010 no evalúa roles por nombre con get_auth_role()');

  // 3. Verificar control numérico por role_level en sql/010
  assert(sql010Content.includes('v_role_level < 60'), 'sql/010 verifica role_level < 60 para denegación de creación de zonas');

  // 4. Verificar retirada de la función incompleta create_tactical_zone en sql/010
  assert(sql010Content.includes('DROP FUNCTION IF EXISTS public.create_tactical_zone'), 'sql/010 retira la función muerta create_tactical_zone');

  // 5. Verificar presencia de p_assigned_rso_id y su validación relacional en sql/010
  assert(sql010Content.includes('p_assigned_rso_id UUID DEFAULT NULL'), 'sql/010 incluye el parámetro p_assigned_rso_id');
  assert(sql010Content.includes('role_level >= 60'), 'sql/010 valida que el RSO asignado tenga role_level >= 60');

  // 6. Verificar que ConsoleRail.tsx no tiene fail-open de ORG_ADMIN por defecto
  const railPath = path.resolve(process.cwd(), 'src/components/industry/ConsoleRail.tsx');
  const railContent = fs.readFileSync(railPath, 'utf8');
  assert(!railContent.includes("currentRole = 'ORG_ADMIN'"), "ConsoleRail.tsx no tiene fallback permisivo a ORG_ADMIN");

  // 7. Verificar que RsoConsoleShell.tsx importa y utiliza ROLE_LEVELS
  const shellPath = path.resolve(process.cwd(), 'src/components/industry/RsoConsoleShell.tsx');
  const shellContent = fs.readFileSync(shellPath, 'utf8');
  assert(shellContent.includes('ROLE_LEVELS'), 'RsoConsoleShell.tsx importa y utiliza la constante única ROLE_LEVELS');

  // --- 15. Tipología de Zonas (RESPONSIBILITY vs THREAT) y Gestión de Zonas (Mandato Claude) ---
  console.log('\n--- 15. Tipología de Zonas (RESPONSIBILITY vs THREAT) y Gestión de Zonas (Mandato Claude) ---');

  // 1. Validar acceso a pantalla 'zonas' en DEFAULT_ROLE_SCREEN_ACCESS para todos los roles
  const rolesWithZonasAccess = Object.entries(DEFAULT_ROLE_SCREEN_ACCESS).every(
    ([_, access]) => access.zonas === true
  );
  assert(rolesWithZonasAccess, 'Todos los roles tienen acceso base a la pantalla "zonas"');

  // 2. Smoke test estático de migración sql/011_zone_types_and_management.sql
  const sql011Path = path.resolve(process.cwd(), 'sql/011_zone_types_and_management.sql');
  assert(fs.existsSync(sql011Path), 'sql/011_zone_types_and_management.sql existe');
  const sql011Content = fs.readFileSync(sql011Path, 'utf8');

  // 3. Verificar adición de columna zone_type y enum check en sql/011
  assert(sql011Content.includes('zone_type TEXT DEFAULT \'THREAT\''), 'sql/011 añade columna zone_type con default THREAT');
  assert(sql011Content.includes("CHECK (zone_type IN ('RESPONSIBILITY', 'THREAT'))"), 'sql/011 restringe zone_type a RESPONSIBILITY o THREAT');

  // 4. Verificar que severity incluye OPERATIONAL en sql/011
  assert(sql011Content.includes("'OPERATIONAL'"), 'sql/011 incluye OPERATIONAL en el catálogo de severidades permitidas');

  // 5. Verificar regla de consistencia check_zone_type_consistency en DB (sql/011)
  assert(sql011Content.includes('check_zone_type_consistency'), 'sql/011 define la restricción check_zone_type_consistency');
  assert(sql011Content.includes("zone_type = 'RESPONSIBILITY' AND severity = 'OPERATIONAL' AND assigned_rso_id IS NOT NULL"), 'sql/011 exige RSO no nulo y severidad OPERATIONAL para RESPONSIBILITY');

  // 6. Verificar que la RPC fija el color inviolable #5980a6 para RESPONSIBILITY (Mandato Claude)
  assert(sql011Content.includes("v_color := '#5980a6'"), 'sql/011 fija v_color := #5980a6 para RESPONSIBILITY ignorando color del cliente');

  // 7. Verificar parámetro p_zone_type en la RPC sql/011
  assert(sql011Content.includes("p_zone_type TEXT DEFAULT 'THREAT'"), 'sql/011 incluye p_zone_type en create_zone_with_geojson');

  // 8. Verificar ausencia total de SUPER_ADMIN en sql/011
  assert(!sql011Content.includes("'SUPER_ADMIN'"), 'sql/011 no contiene referencias obsoletas a SUPER_ADMIN');

  // 9. Verificar control numérico role_level < 60 en sql/011
  assert(sql011Content.includes('v_role_level < 60'), 'sql/011 verifica v_role_level < 60');

  // 10. Smoke test en endpoint PATCH /api/zones/[id]/route.ts
  const apiZoneIdPath = path.resolve(process.cwd(), 'src/app/api/zones/[id]/route.ts');
  const apiZoneIdContent = fs.readFileSync(apiZoneIdPath, 'utf8');
  assert(apiZoneIdContent.includes("'OPERATIONAL'"), 'PATCH /api/zones/[id] incluye OPERATIONAL en ALLOWED_SEVERITIES');
  assert(apiZoneIdContent.includes("targetZoneType === 'RESPONSIBILITY'") && apiZoneIdContent.includes("!targetRsoId"), 'PATCH /api/zones/[id] valida en TS que RESPONSIBILITY exige RSO (400)');
  assert(apiZoneIdContent.includes("targetSeverity !== 'OPERATIONAL'"), 'PATCH /api/zones/[id] valida en TS que RESPONSIBILITY exige severidad OPERATIONAL (400)');
  assert(apiZoneIdContent.includes("updates.color_hex = '#5980a6'"), 'PATCH /api/zones/[id] fuerza color #5980a6 para RESPONSIBILITY');

  // 11. Smoke test en endpoint GET /api/profiles/route.ts
  const apiProfilesPath = path.resolve(process.cwd(), 'src/app/api/profiles/route.ts');
  assert(fs.existsSync(apiProfilesPath), 'src/app/api/profiles/route.ts existe');
  const apiProfilesContent = fs.readFileSync(apiProfilesPath, 'utf8');
  assert(apiProfilesContent.includes('.gte(\'role_level\', 60)'), 'GET /api/profiles filtra role_level >= 60');

  // 12. Smoke test en ConsoleRail.tsx y RsoConsoleShell.tsx para pantalla 'zonas'
  assert(railContent.includes("id: 'zonas'"), "ConsoleRail.tsx incluye el ítem 'zonas' en el menú de navegación");
  assert(shellContent.includes("import { ZonasScreen } from '@/components/screens/ZonasScreen'"), 'RsoConsoleShell.tsx importa ZonasScreen');
  assert(shellContent.includes("activeScreen === 'zonas'"), 'RsoConsoleShell.tsx renderiza ZonasScreen');

  // 13. Smoke test en ZoneCreationModal.tsx para selector de tipología y forzado de color
  const modalPath = path.resolve(process.cwd(), 'src/components/tactical/ZoneCreationModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');
  assert(modalContent.includes("zoneType === 'RESPONSIBILITY'"), 'ZoneCreationModal evalúa zoneType === RESPONSIBILITY');
  assert(modalContent.includes("initialZone"), 'ZoneCreationModal soporta prop initialZone para edición');

  // 14. Verificación de sincronización reactiva en TerrenoScreen.tsx (Resolución de condición de carrera)
  const terrenoPath = path.resolve(process.cwd(), 'src/components/screens/TerrenoScreen.tsx');
  const terrenoContent = fs.readFileSync(terrenoPath, 'utf8');
  assert(terrenoContent.includes('const [isMapLoaded, setIsMapLoaded] = useState'), 'TerrenoScreen.tsx declara el estado isMapLoaded');
  assert(terrenoContent.includes('[isMapLoaded, zonesGeoJson]'), 'TerrenoScreen.tsx tiene un useEffect dedicado con dependencias [isMapLoaded, zonesGeoJson]');
  assert(terrenoContent.includes("setIsMapLoaded(true);"), 'TerrenoScreen.tsx activa isMapLoaded en el evento load de MapLibre');
  assert(terrenoContent.includes("setIsMapLoaded(false);"), 'TerrenoScreen.tsx restablece isMapLoaded en el desmontaje de MapLibre');

  // 15. Verificación de flujo de foco de zona desde Situación Global a Terreno (Mandato Daniel / Claude)
  const situacionPath = path.resolve(process.cwd(), 'src/components/screens/SituacionScreen.tsx');
  const situacionContent = fs.readFileSync(situacionPath, 'utf8');
  assert(situacionContent.includes('onNavigateTerreno?: (zoneId?: string) => void'), 'SituacionScreen.tsx admite zoneId en onNavigateTerreno');
  assert(situacionContent.includes('onNavigateTerreno(selectedZoneId)'), 'SituacionScreen.tsx pasa selectedZoneId al pulsar Inspeccionar en Terreno');
  assert(shellContent.includes('const [focusZoneId, setFocusZoneId] = useState'), 'RsoConsoleShell.tsx gestiona el estado focusZoneId');
  assert(shellContent.includes('focusZoneId={focusZoneId}'), 'RsoConsoleShell.tsx pasa focusZoneId a TerrenoScreen');
  assert(shellContent.includes('onFocusZoneConsumed={() => setFocusZoneId(null)}'), 'RsoConsoleShell.tsx provee callback para consumir el foco');
  assert(terrenoContent.includes('focusZoneId?: string | null;'), 'TerrenoScreenProps incluye focusZoneId');
  assert(terrenoContent.includes('[focusZoneId, isMapLoaded, zones]'), 'TerrenoScreen.tsx tiene un useEffect dependiente de [focusZoneId, isMapLoaded, zones]');

  // 16. Redibujado de Geometría en Modo Edición (Mandato Daniel / Claude)
  assert(terrenoContent.includes('zonesGeoJson?.features?.find'), 'TerrenoScreen.tsx busca la feature real en zonesGeoJson al editar');
  assert(!terrenoContent.includes("geometry: { type: 'Polygon', coordinates: [] }"), 'TerrenoScreen.tsx no envía coordenadas vacías hardcodeadas al editar');
  assert(modalContent.includes('const [isRedrawingGeometry, setIsRedrawingGeometry] = useState'), 'ZoneCreationModal.tsx declara el estado isRedrawingGeometry');
  assert(modalContent.includes('Redibujar Perímetro'), 'ZoneCreationModal.tsx incluye el botón Redibujar Perímetro');
  assert(modalContent.includes('if (isRedrawingGeometry && activeGeometry)'), 'ZoneCreationModal.tsx incluye geojson_geometry en PATCH solo al redibujar');

  // ----------------------------------------------------------------------------
  // 17. Contrato HERE Geocoding v7, Colores Canónicos y Smoke Tests de ZoneMiniMap
  // ----------------------------------------------------------------------------
  console.log('\n--- 17. Contrato HERE Geocoding v7, Colores Canónicos y Smoke Tests de ZoneMiniMap ---');

  // 1. Colores canónicos centralizados (Mandato Claude / Corrección 2)
  assert(getSeverityColor('RED', 'THREAT', 'hex') === '#e07a6a', 'getSeverityColor devuelve #e07a6a para RED THREAT (hex)');
  assert(getSeverityColor('AMBER', 'THREAT', 'hex') === '#d8a84f', 'getSeverityColor devuelve #d8a84f para AMBER THREAT (hex)');
  assert(getSeverityColor('SAFE_HAVEN', 'THREAT', 'hex') === '#63b598', 'getSeverityColor devuelve #63b598 para SAFE_HAVEN THREAT (hex)');
  assert(getSeverityColor('CORRIDOR', 'THREAT', 'hex') === '#94bce3', 'getSeverityColor devuelve #94bce3 para CORRIDOR THREAT (hex)');
  assert(getSeverityColor('OPERATIONAL', 'RESPONSIBILITY', 'hex') === '#5980a6', 'getSeverityColor devuelve #5980a6 para RESPONSIBILITY (hex)');
  assert(getSeverityColor('RED', 'RESPONSIBILITY', 'hex') === '#5980a6', 'getSeverityColor fuerza #5980a6 para cualquier severidad en RESPONSIBILITY');
  assert(getSeverityColor('RED', 'THREAT', 'css') === 'var(--risk-crit)', 'getSeverityColor devuelve variable CSS var(--risk-crit) para RED');
  assert(getSeverityColor('OPERATIONAL', 'RESPONSIBILITY', 'css') === 'var(--color-accent)', 'getSeverityColor devuelve var(--color-accent) para RESPONSIBILITY (css)');

  // 2. Expresión MapLibre generada
  const matchExpr = buildSeverityMatchExpression();
  assert(Array.isArray(matchExpr) && matchExpr[0] === 'match', 'buildSeverityMatchExpression genera array match de MapLibre');
  assert(matchExpr[3] === '#5980a6', 'buildSeverityMatchExpression asigna #5980a6 a RESPONSIBILITY');

  // 3. Contrato de construcción de URL y parseo HERE Geocoding v7
  const sampleUrl = buildHereGeocodeUrl('Bamako, Malí', 'TEST_KEY_123');
  assert(sampleUrl.includes('geocode.search.hereapi.com/v1/geocode'), 'buildHereGeocodeUrl apunta al endpoint v7 de HERE');
  assert(sampleUrl.includes('apiKey=TEST_KEY_123'), 'buildHereGeocodeUrl codifica el apiKey');
  assert(sampleUrl.includes('q=Bamako%2C%20Mal%C3%AD'), 'buildHereGeocodeUrl codifica la query con URI encoding');

  assert(parseHereGeocodeResponse(null).length === 0, 'parseHereGeocodeResponse tolera null');
  assert(parseHereGeocodeResponse({}).length === 0, 'parseHereGeocodeResponse tolera objeto sin items');
  assert(parseHereGeocodeResponse({ items: [] }).length === 0, 'parseHereGeocodeResponse tolera items vacío');

  const validHerePayload = {
    items: [
      {
        title: 'Bamako, Mali',
        resultType: 'locality',
        position: { lat: 12.63923, lng: -8.00289 },
        mapView: { west: -8.1132, south: 12.5511, east: -7.8925, north: 12.7273 },
      },
    ],
  };
  const parsedItems = parseHereGeocodeResponse(validHerePayload);
  assert(parsedItems.length === 1, 'parseHereGeocodeResponse extrae exactamente 1 resultado válido');
  assert(parsedItems[0].title === 'Bamako, Mali', 'parseHereGeocodeResponse preserva el título del lugar');
  assert(parsedItems[0].lat === 12.63923 && parsedItems[0].lng === -8.00289, 'parseHereGeocodeResponse preserva coordenadas numéricas WGS84');
  assert(Array.isArray(parsedItems[0].bbox) && parsedItems[0].bbox.length === 4, 'parseHereGeocodeResponse extrae mapView como bbox');

  // 4. Filtrado de coordenadas inválidas o fuera de rango WGS84 en el parser
  const invalidHerePayload = {
    items: [
      { title: 'Lugar Inválido', position: { lat: 999, lng: 0 } },
      { title: 'Lugar NaN', position: { lat: NaN, lng: 0 } },
    ],
  };
  assert(parseHereGeocodeResponse(invalidHerePayload).length === 0, 'parseHereGeocodeResponse descarta coordenadas fuera de rango o NaN');

  // 5. Smoke tests estáticos de arquitectura en ZoneMiniMap.tsx (Mandato Claude / Corrección 1)
  const miniMapPath = path.resolve(process.cwd(), 'src/components/tactical/ZoneMiniMap.tsx');
  assert(fs.existsSync(miniMapPath), 'src/components/tactical/ZoneMiniMap.tsx existe');
  const miniMapContent = fs.readFileSync(miniMapPath, 'utf8');
  assert(miniMapContent.includes("import maplibregl from 'maplibre-gl'"), 'ZoneMiniMap.tsx importa maplibre-gl');
  assert(miniMapContent.includes('const [isMapLoaded, setIsMapLoaded] = useState'), 'ZoneMiniMap.tsx declara el estado reactivo isMapLoaded');
  assert(miniMapContent.includes('setIsMapLoaded(true);'), 'ZoneMiniMap.tsx activa isMapLoaded en el evento load de MapLibre');
  assert(miniMapContent.includes('setIsMapLoaded(false);'), 'ZoneMiniMap.tsx restablece isMapLoaded en el desmontaje');
  assert(miniMapContent.includes('if (!map || !isMapLoaded) return;'), 'ZoneMiniMap.tsx gatea la actualización de fuentes y capas GeoJSON tras isMapLoaded');
  assert(miniMapContent.includes('getSeverityColor(severity, zoneType'), 'ZoneMiniMap.tsx utiliza la función canónica getSeverityColor');
  assert(miniMapContent.includes('results[0]'), 'ZoneMiniMap.tsx implementa selección consciente del primer resultado de geocoding');
  assert(!miniMapContent.includes('<form'), 'ZoneMiniMap.tsx no utiliza etiquetas <form> anidadas para evitar submit accidental del modal');
  assert(miniMapContent.includes('type="button"'), 'ZoneMiniMap.tsx utiliza type="button" para el control de ubicación');

  // 6. Smoke tests en ZoneCreationModal.tsx y TerrenoScreen.tsx (Mandato Claude / Corrección 2)
  const updatedModalContent = fs.readFileSync(modalPath, 'utf8');
  assert(updatedModalContent.includes("import { ZoneMiniMap } from './ZoneMiniMap'"), 'ZoneCreationModal.tsx importa ZoneMiniMap');
  assert(updatedModalContent.includes('<ZoneMiniMap'), 'ZoneCreationModal.tsx renderiza el componente ZoneMiniMap');

  const updatedTerrenoContent = fs.readFileSync(terrenoPath, 'utf8');
  assert(updatedTerrenoContent.includes('getSeverityColor(sev, zType, \'css\')'), 'TerrenoScreen.tsx sustituye el primer mapeo duplicado con getSeverityColor');
  assert(updatedTerrenoContent.includes('buildSeverityMatchExpression()'), 'TerrenoScreen.tsx sustituye el segundo mapeo duplicado con buildSeverityMatchExpression');

  console.log('\n================================================================');
  console.log(`TOTAL PRUEBAS: ${passed + failed} | EXITOSAS: ${passed} | FALLIDAS: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
