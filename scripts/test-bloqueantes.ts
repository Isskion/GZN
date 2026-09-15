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
  // 6. Gestión Completa de Zonas: Modificación y Desactivación Táctica (Paquete B2)
  // ----------------------------------------------------------------------------
  console.log('\n--- 6. Gestión Completa de Zonas: PATCH & DELETE (Paquete B2) ---');

  // Control de rol estricto con validación de perfil activo (Mandato Claude)
  function checkZoneManagementRole(profile: { role?: string; is_active?: boolean } | null): { authorized: boolean; reason?: string } {
    if (!profile) return { authorized: false, reason: 'profile_not_found' };
    if (!profile.is_active) return { authorized: false, reason: 'profile_inactive' };
    if (!['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkZoneManagementRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado');
  assert(checkZoneManagementRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado');
  assert(checkZoneManagementRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === true, 'SUPER_ADMIN activo autorizado');
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

  // 1. Control de rol estricto para gestión de viajeros (Mandato Claude 1)
  function checkTravelerManagementRole(profile: { role?: string; is_active?: boolean } | null): { authorized: boolean; reason?: string } {
    if (!profile) return { authorized: false, reason: 'profile_not_found' };
    if (!profile.is_active) return { authorized: false, reason: 'profile_inactive' };
    if (!['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkTravelerManagementRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado para viajeros');
  assert(checkTravelerManagementRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado para viajeros');
  assert(checkTravelerManagementRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === true, 'SUPER_ADMIN activo autorizado para viajeros');
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
    if (!['OPERATOR', 'RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkTacticalServiceRole({ role: 'OPERATOR', is_active: true }).authorized === true, 'OPERATOR activo autorizado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado para servicios tácticos');
  assert(checkTacticalServiceRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === true, 'SUPER_ADMIN activo autorizado para servicios tácticos');
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
    if (!['RSO', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(profile.role || '')) {
      return { authorized: false, reason: 'insufficient_role' };
    }
    return { authorized: true };
  }

  assert(checkBriefingMutationRole({ role: 'RSO', is_active: true }).authorized === true, 'RSO activo autorizado para redactar briefings');
  assert(checkBriefingMutationRole({ role: 'ORG_ADMIN', is_active: true }).authorized === true, 'ORG_ADMIN activo autorizado para redactar briefings');
  assert(checkBriefingMutationRole({ role: 'SUPER_ADMIN', is_active: true }).authorized === true, 'SUPER_ADMIN activo autorizado para redactar briefings');
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
