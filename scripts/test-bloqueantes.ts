// ==============================================================================
// GZN — SUITE DE VALIDACIÓN AUTOMATIZADA: BLOQUEANTES 1 Y 2
// ==============================================================================

import { validateGeoJSONPolygon } from '../src/lib/geo/validation';
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
