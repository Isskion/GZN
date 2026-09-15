// ==============================================================================
// GZN — SUITE DE VALIDACIÓN AUTOMATIZADA: BLOQUEANTES 1 Y 2
// ==============================================================================

import { validateGeoJSONPolygon, validateZoneEnhancements } from '../src/lib/geo/validation';
import { hashDeviceSecret } from '../src/lib/auth/device';
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
