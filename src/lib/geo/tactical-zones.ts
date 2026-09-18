// ==============================================================================
// GZN — GENERACIÓN Y ADAPTACIÓN DE GEOMETRÍAS TÁCTICAS (PostGIS / GeoJSON)
// ==============================================================================

import { ZoneType, ZoneSeverity } from '@/types/database';

export interface ExtractedCountryGeometry {
  polygon: GeoJSON.Polygon;
  excludedCount: number;
  isSimplified: boolean;
}

// -----------------------------------------------------------------------------
// PALETA CANÓNICA DE COLORES DE SEVERIDAD Y TIPOLOGÍA TÁCTICA
// -----------------------------------------------------------------------------

export const SEVERITY_HEX_COLORS: Record<string, string> = {
  OPERATIONAL: '#5980a6',
  RED: '#e07a6a',
  AMBER: '#d8a84f',
  SAFE_HAVEN: '#63b598',
  CORRIDOR: '#94bce3',
};

export const SEVERITY_CSS_COLORS: Record<string, string> = {
  OPERATIONAL: 'var(--color-accent)',
  RED: 'var(--risk-crit)',
  AMBER: 'var(--risk-high)',
  SAFE_HAVEN: 'var(--risk-stable)',
  CORRIDOR: 'var(--risk-watch)',
};

/**
 * Obtiene el color canónico asociado a la severidad táctica y tipología de una zona.
 * Fuente única de verdad para la cartografía (MapLibre/WebGL) y componentes C2.
 *
 * @param severity Nivel de severidad o régimen táctico
 * @param zoneType Tipología de zona ('RESPONSIBILITY' | 'THREAT')
 * @param format Formato deseado ('css' para variables CSS o 'hex' para WebGL/MapLibre)
 */
export function getSeverityColor(
  severity: ZoneSeverity | string,
  zoneType: ZoneType | string = 'THREAT',
  format: 'css' | 'hex' = 'css'
): string {
  if (zoneType === 'RESPONSIBILITY') {
    return format === 'hex' ? SEVERITY_HEX_COLORS.OPERATIONAL : SEVERITY_CSS_COLORS.OPERATIONAL;
  }
  const colorMap = format === 'hex' ? SEVERITY_HEX_COLORS : SEVERITY_CSS_COLORS;
  const fallback = format === 'hex' ? SEVERITY_HEX_COLORS.CORRIDOR : SEVERITY_CSS_COLORS.CORRIDOR;
  return colorMap[severity] || fallback;
}

/**
 * Genera la expresión declarativa 'match' de MapLibre para colorear zonas
 * según su tipología (RESPONSIBILITY) y severidad (RED, AMBER, etc.) en WebGL.
 */
export function buildSeverityMatchExpression(): any {
  return [
    'match',
    ['get', 'zone_type'],
    'RESPONSIBILITY',
    SEVERITY_HEX_COLORS.OPERATIONAL,
    [
      'match',
      ['get', 'severity'],
      'RED',
      SEVERITY_HEX_COLORS.RED,
      'AMBER',
      SEVERITY_HEX_COLORS.AMBER,
      'SAFE_HAVEN',
      SEVERITY_HEX_COLORS.SAFE_HAVEN,
      'CORRIDOR',
      SEVERITY_HEX_COLORS.CORRIDOR,
      SEVERITY_HEX_COLORS.OPERATIONAL,
    ],
  ];
}

// -----------------------------------------------------------------------------
// CONSTANTES GEODÉSICAS WGS84
// -----------------------------------------------------------------------------

export const EARTH_RADIUS_KM = 6371.0088; // Radio medio volumétrico WGS84

/**
 * Genera un polígono geodésico regular aproximando un círculo sobre WGS84.
 *
 * @param centerLng Longitud del centro en grados [-180, 180]
 * @param centerLat Latitud del centro en grados [-90, 90]
 * @param radiusKm Radio en kilómetros
 * @param numPoints Número de vértices del polígono (por defecto 64)
 * @returns Objeto GeoJSON.Polygon válido y cerrado (numPoints + 1 coordenadas)
 */
export function generateGeodesicCircle(
  centerLng: number,
  centerLat: number,
  radiusKm: number,
  numPoints: number = 64
): GeoJSON.Polygon {
  const coordinates: [number, number][] = [];

  const latRad = (centerLat * Math.PI) / 180;
  const lngRad = (centerLng * Math.PI) / 180;
  const angularDist = radiusKm / EARTH_RADIUS_KM;

  for (let i = 0; i < numPoints; i++) {
    const bearing = (i * 2 * Math.PI) / numPoints;

    const ptLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDist) +
        Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing)
    );

    const ptLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad),
        Math.cos(angularDist) - Math.sin(latRad) * Math.sin(ptLat)
      );

    const degLat = (ptLat * 180) / Math.PI;
    let degLng = (ptLng * 180) / Math.PI;

    // Normalizar longitud a [-180, 180]
    while (degLng > 180) degLng -= 360;
    while (degLng < -180) degLng += 360;

    coordinates.push([Number(degLng.toFixed(6)), Number(degLat.toFixed(6))]);
  }

  // Cerrar el anillo lineal (primer punto idéntico al último)
  coordinates.push([coordinates[0][0], coordinates[0][1]]);

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
}

/**
 * Calcula el área superficial aproximada de un anillo de coordenadas usando
 * la fórmula de la proyección esférica / shoelace en km².
 */
export function calculateRingAreaKm2(ring: number[][]): number {
  if (ring.length < 3) return 0;

  let total = 0;

  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[i + 1];

    const lambda1 = (p1[0] * Math.PI) / 180;
    const phi1 = (p1[1] * Math.PI) / 180;
    const lambda2 = (p2[0] * Math.PI) / 180;
    const phi2 = (p2[1] * Math.PI) / 180;

    total += (lambda2 - lambda1) * (2 + Math.sin(phi1) + Math.sin(phi2));
  }

  const area = Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
  return Number(area.toFixed(2));
}

/**
 * Extrae el polígono principal (territorio continental de mayor área)
 * en caso de que una entidad geográfica sea un MultiPolygon.
 *
 * Cumple con la restricción actual de Base de Datos: GEOMETRY(Polygon, 4326).
 */
export function extractMainContinentPolygon(geometry: any): ExtractedCountryGeometry | null {
  if (!geometry || typeof geometry !== 'object') return null;

  if (geometry.type === 'Polygon') {
    return {
      polygon: geometry as GeoJSON.Polygon,
      excludedCount: 0,
      isSimplified: false,
    };
  }

  if (geometry.type === 'MultiPolygon') {
    const multiCoords: number[][][][] = geometry.coordinates;
    if (!Array.isArray(multiCoords) || multiCoords.length === 0) return null;

    let maxArea = -1;
    let mainPolygonCoords: number[][][] = multiCoords[0];

    for (let i = 0; i < multiCoords.length; i++) {
      const poly = multiCoords[i];
      if (poly && poly[0]) {
        const area = calculateRingAreaKm2(poly[0]);
        if (area > maxArea) {
          maxArea = area;
          mainPolygonCoords = poly;
        }
      }
    }

    return {
      polygon: {
        type: 'Polygon',
        coordinates: mainPolygonCoords as any,
      },
      excludedCount: multiCoords.length - 1,
      isSimplified: multiCoords.length > 1,
    };
  }

  return null;
}

/**
 * Convierte un array de puntos marcados interactivamente en un GeoJSON.Polygon válido.
 * Garantiza el cierre del anillo y un mínimo de 4 coordenadas.
 */
export function closeDrawnPolygon(points: [number, number][]): GeoJSON.Polygon | null {
  if (!points || points.length < 3) return null;

  const closed = [...points];
  const first = closed[0];
  const last = closed[closed.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    closed.push([first[0], first[1]]);
  }

  if (closed.length < 4) return null;

  return {
    type: 'Polygon',
    coordinates: [closed],
  };
}

// -----------------------------------------------------------------------------
// INTROSPECCIÓN, CENTROIDES E INFERENCIA GEOMÉTRICA CANÓNICA
// -----------------------------------------------------------------------------

/**
 * Calcula el centroide geométrico promedio de un anillo de coordenadas poligonales (WGS84).
 * Si el anillo está cerrado (último vértice idéntico al primero), excluye el punto duplicado.
 */
export function calculatePolygonCentroid(coordinates: number[][]): [number, number] {
  if (!coordinates || coordinates.length === 0) return [0, 0];

  const count = coordinates.length;
  const isClosed =
    count > 1 &&
    coordinates[0][0] === coordinates[count - 1][0] &&
    coordinates[0][1] === coordinates[count - 1][1];

  const verticesCount = isClosed ? count - 1 : count;
  if (verticesCount === 0) {
    return [Number(coordinates[0][0].toFixed(6)), Number(coordinates[0][1].toFixed(6))];
  }

  let sumLng = 0;
  let sumLat = 0;
  for (let i = 0; i < verticesCount; i++) {
    sumLng += coordinates[i][0];
    sumLat += coordinates[i][1];
  }

  return [
    Number((sumLng / verticesCount).toFixed(6)),
    Number((sumLat / verticesCount).toFixed(6)),
  ];
}

/**
 * Calcula la distancia geodésica ortodrómica (Haversine) entre dos puntos en kilómetros.
 */
export function calculateGeodesicDistanceKm(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export interface InferredZoneConfig {
  mode: 'country' | 'radius' | 'freehand';
  centerLng: number;
  centerLat: number;
  radiusKm: number;
  countryName?: string;
  rawCoordinatesText: string;
}

/**
 * Reconstruye determinísticamente la modalidad y parámetros de delimitación
 * de una zona a partir de su geometría y nombre almacenados.
 *
 * Evita la deriva del centro hacia el norte y recupera el modo y radio originales.
 */
export function inferZoneConfiguration(
  geometry: GeoJSON.Polygon | null | undefined,
  zoneName?: string,
  fallbackCenter: [number, number] = [-3.7038, 40.4168]
): InferredZoneConfig {
  if (!geometry || geometry.type !== 'Polygon' || !geometry.coordinates?.[0]?.length) {
    return {
      mode: 'country',
      centerLng: fallbackCenter[0],
      centerLat: fallbackCenter[1],
      radiusKm: 15,
      countryName: undefined,
      rawCoordinatesText: '-3.7100, 40.4200\n-3.6900, 40.4200\n-3.6900, 40.4100\n-3.7100, 40.4100',
    };
  }

  const ring = geometry.coordinates[0];
  const centroid = calculatePolygonCentroid(ring);
  const count = ring.length;

  // 1. Detección de círculo geodésico (64 segmentos generados por GZN -> 65 coordenadas con cierre)
  if (count === 65 || count === 64) {
    const d0 = calculateGeodesicDistanceKm(centroid[0], centroid[1], ring[0][0], ring[0][1]);
    const d16 = calculateGeodesicDistanceKm(centroid[0], centroid[1], ring[16][0], ring[16][1]);
    const d32 = calculateGeodesicDistanceKm(centroid[0], centroid[1], ring[32][0], ring[32][1]);
    const d48 = calculateGeodesicDistanceKm(centroid[0], centroid[1], ring[48][0], ring[48][1]);
    const avgDist = (d0 + d16 + d32 + d48) / 4;

    if (
      avgDist > 0.01 &&
      Math.abs(d0 - avgDist) / avgDist < 0.08 &&
      Math.abs(d16 - avgDist) / avgDist < 0.08 &&
      Math.abs(d32 - avgDist) / avgDist < 0.08 &&
      Math.abs(d48 - avgDist) / avgDist < 0.08
    ) {
      return {
        mode: 'radius',
        centerLng: Number(centroid[0].toFixed(4)),
        centerLat: Number(centroid[1].toFixed(4)),
        radiusKm: Math.round(avgDist),
        countryName: undefined,
        rawCoordinatesText: ring
          .slice(0, count === 65 ? 64 : count)
          .map((p) => `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`)
          .join('\n'),
      };
    }
  }

  // 2. Detección de modo País si coincide con el patrón canónico de denominación
  const countryMatch = zoneName?.match(/^(?:Teatro Operativo|Área Táctica)\s*[-–—:]\s*(.+)$/i);
  if (countryMatch && countryMatch[1]?.trim()) {
    const country = countryMatch[1].trim();
    return {
      mode: 'country',
      centerLng: Number(centroid[0].toFixed(4)),
      centerLat: Number(centroid[1].toFixed(4)),
      radiusKm: 15,
      countryName: country,
      rawCoordinatesText: ring
        .slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] ? ring.length - 1 : ring.length)
        .map((p) => `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`)
        .join('\n'),
    };
  }

  // 3. Fallback: Polígono Libre (Freehand)
  const isClosed = count > 1 && ring[0][0] === ring[count - 1][0] && ring[0][1] === ring[count - 1][1];
  const uniquePoints = isClosed ? ring.slice(0, count - 1) : ring;
  const rawCoords = uniquePoints
    .map((p) => `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`)
    .join('\n');

  return {
    mode: 'freehand',
    centerLng: Number(centroid[0].toFixed(4)),
    centerLat: Number(centroid[1].toFixed(4)),
    radiusKm: 15,
    countryName: undefined,
    rawCoordinatesText: rawCoords,
  };
}
