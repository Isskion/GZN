// ==============================================================================
// GZN — SERVICIO Y PARSER DE GEOCODIFICACIÓN (HERE Geocoding & Search API v7)
// ==============================================================================

export interface GeocodeResult {
  title: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // [west, south, east, north]
}

/**
 * Construye la URL canónica de petición para HERE Geocoding & Search API v7.
 */
export function buildHereGeocodeUrl(query: string, apiKey: string): string {
  return `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(query.trim())}&apiKey=${encodeURIComponent(apiKey.trim())}`;
}

/**
 * Parsea y normaliza de forma determinística la respuesta JSON de HERE Geocoding v7.
 * Función pura y resiliente frente a respuestas vacías, anómalas o con campos ausentes.
 *
 * @param data Carga JSON devuelta por la API de HERE
 * @returns Lista de resultados estructurados { title, lat, lng, bbox }
 */
export function parseHereGeocodeResponse(data: any): GeocodeResult[] {
  if (!data || typeof data !== 'object') return [];
  if (!Array.isArray(data.items)) return [];

  const results: GeocodeResult[] = [];

  for (const item of data.items) {
    if (!item || typeof item !== 'object') continue;

    const pos = item.position;
    if (
      !pos ||
      typeof pos.lat !== 'number' ||
      typeof pos.lng !== 'number' ||
      isNaN(pos.lat) ||
      isNaN(pos.lng)
    ) {
      continue;
    }

    // Validar rango WGS84
    if (pos.lat < -90 || pos.lat > 90 || pos.lng < -180 || pos.lng > 180) {
      continue;
    }

    const title =
      item.title ||
      item.address?.label ||
      (item.address?.city && item.address?.countryName
        ? `${item.address.city}, ${item.address.countryName}`
        : `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`);

    const result: GeocodeResult = {
      title,
      lat: Number(pos.lat.toFixed(6)),
      lng: Number(pos.lng.toFixed(6)),
    };

    if (
      item.mapView &&
      typeof item.mapView.west === 'number' &&
      typeof item.mapView.south === 'number' &&
      typeof item.mapView.east === 'number' &&
      typeof item.mapView.north === 'number'
    ) {
      result.bbox = [
        item.mapView.west,
        item.mapView.south,
        item.mapView.east,
        item.mapView.north,
      ];
    }

    results.push(result);
  }

  return results;
}
