import type { StyleSpecification } from 'maplibre-gl';

export type HereMapStyleId = 'explore.night' | 'satellite.day' | 'explore.day' | 'logistics.day';

export interface HereMapLayerConfig {
  id: HereMapStyleId;
  label: string;
  sublabel: string;
  badge: string;
  format: 'png' | 'jpeg';
  description: string;
}

export const HERE_MAP_LAYERS: HereMapLayerConfig[] = [
  {
    id: 'explore.night',
    label: 'Táctico Oscuro',
    sublabel: 'C2 / SOC Night',
    badge: 'TAC-NIGHT',
    format: 'png',
    description: 'Modo nocturno de alto contraste para centros de mando y operaciones tácticas.',
  },
  {
    id: 'satellite.day',
    label: 'Satélite HD',
    sublabel: 'Óptica Satelital',
    badge: 'SAT-HD',
    format: 'jpeg',
    description: 'Imágenes satelitales de alta resolución de HERE para zonas remotas o de conflicto.',
  },
  {
    id: 'explore.day',
    label: 'Calles Diurno',
    sublabel: 'Toponimia Urbana',
    badge: 'STREETS',
    format: 'png',
    description: 'Detalle vial y toponimia urbana para navegación diurna y accesos urbanos.',
  },
  {
    id: 'logistics.day',
    label: 'Logística Táctica',
    sublabel: 'Red de Convoyes',
    badge: 'LOG-FLEET',
    format: 'png',
    description: 'Red vial optimizada para rutas de convoyes, corredores de transporte y evacuación.',
  },
];

export const HERE_LAYER_PREFIX = 'gzn-here-layer-';
export const HERE_SOURCE_PREFIX = 'gzn-here-source-';

/**
 * Genera la especificación de estilo MapLibre multi-capa con HERE Technologies.
 * Incluye todas las capas en el mismo estilo para permitir alternar entre
 * Táctico, Satélite y Calles al instante sin recargas del mapa ni parpadeos.
 */
export function buildHereMultiLayerStyle(
  apiKey: string,
  defaultStyleId: HereMapStyleId = 'explore.night'
): StyleSpecification {
  const sources: Record<string, any> = {};
  const layers: any[] = [];

  for (const layer of HERE_MAP_LAYERS) {
    const sourceId = `${HERE_SOURCE_PREFIX}${layer.id.replace('.', '-')}`;
    const layerId = `${HERE_LAYER_PREFIX}${layer.id.replace('.', '-')}`;
    const tileUrl = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/${layer.format}?apiKey=${apiKey}&style=${layer.id}`;

    sources[sourceId] = {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: 20,
      attribution: '© HERE Technologies | GZN Tactical C2',
    };

    layers.push({
      id: layerId,
      type: 'raster',
      source: sourceId,
      minzoom: 0,
      maxzoom: 22,
      layout: {
        visibility: layer.id === defaultStyleId ? 'visible' : 'none',
      },
    });
  }

  return {
    version: 8,
    name: 'GZN HERE Tactical Multi-Layer Style',
    sources,
    layers,
  };
}

/**
 * Conmuta la visibilidad de las capas base HERE en caliente en una instancia activa de MapLibre GL.
 */
export function setHereActiveLayer(map: any, targetStyleId: HereMapStyleId): void {
  if (!map) return;

  for (const layer of HERE_MAP_LAYERS) {
    const layerId = `${HERE_LAYER_PREFIX}${layer.id.replace('.', '-')}`;
    if (map.getLayer(layerId)) {
      const isVisible = layer.id === targetStyleId;
      map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
    }
  }
}

/**
 * Formatea coordenadas en notación militar táctica WGS84:
 * Grados, Minutos, Segundos + Hemisferio y Decimal.
 */
export function formatTacticalCoordinates(lat: number, lon: number): {
  dms: string;
  decimal: string;
  hemispheres: { latHem: string; lonHem: string };
} {
  const latHem = lat >= 0 ? 'N' : 'S';
  const lonHem = lon >= 0 ? 'E' : 'W';

  const absLat = Math.abs(lat);
  const absLon = Math.abs(lon);

  const latDeg = Math.floor(absLat);
  const latMin = Math.floor((absLat - latDeg) * 60);
  const latSec = ((absLat - latDeg - latMin / 60) * 3600).toFixed(1);

  const lonDeg = Math.floor(absLon);
  const lonMin = Math.floor((absLon - lonDeg) * 60);
  const lonSec = ((absLon - lonDeg - lonMin / 60) * 3600).toFixed(1);

  const dms = `${String(latDeg).padStart(2, '0')}°${String(latMin).padStart(2, '0')}'${latSec.padStart(4, '0')}"${latHem}  ${String(lonDeg).padStart(3, '0')}°${String(lonMin).padStart(2, '0')}'${lonSec.padStart(4, '0')}"${lonHem}`;
  const decimal = `${lat >= 0 ? '+' : ''}${lat.toFixed(6)}°, ${lon >= 0 ? '+' : ''}${lon.toFixed(6)}°`;

  return {
    dms,
    decimal,
    hemispheres: { latHem, lonHem },
  };
}
