// ==============================================================================
// GZN — VALIDACIÓN Y CONTROL DE INTEGRIDAD GEOESPACIAL (GeoJSON)
// ==============================================================================

export interface GeoValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida de forma estricta un objeto GeoJSON de tipo Polygon antes de enviarlo
 * a la base de datos o motor PostGIS.
 *
 * Comprueba:
 * 1. Existencia del objeto y tipo 'Polygon'.
 * 2. Estructura de coordenadas: Array de linear rings (anillos lineales).
 * 3. Mínimo 4 posiciones por anillo lineal (requisito RFC 7946).
 * 4. Cierre del anillo: la primera posición debe ser idéntica a la última.
 * 5. Coordenadas numéricas dentro de los límites válidos WGS84:
 *    Longitud: [-180, 180] | Latitud: [-90, 90]
 */
export function validateGeoJSONPolygon(geojson: any): GeoValidationResult {
  if (!geojson || typeof geojson !== 'object') {
    return {
      valid: false,
      error: 'El cuerpo de la geometría GeoJSON está vacío o no es un objeto válido.',
    };
  }

  // Soporte si se pasa un GeoJSON Feature directamente
  const geometry = geojson.type === 'Feature' ? geojson.geometry : geojson;

  if (!geometry || typeof geometry !== 'object') {
    return {
      valid: false,
      error: 'Geometría no encontrada en el objeto proporcionado.',
    };
  }

  if (geometry.type !== 'Polygon') {
    return {
      valid: false,
      error: `Tipo de geometría no soportado: '${geometry.type}'. Se requiere exclusivamente 'Polygon'.`,
    };
  }

  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
    return {
      valid: false,
      error: 'Las coordenadas del polígono deben ser un array con al menos un anillo exterior.',
    };
  }

  for (let r = 0; r < geometry.coordinates.length; r++) {
    const ring = geometry.coordinates[r];
    const ringLabel = r === 0 ? 'exterior' : `interior (${r})`;

    if (!Array.isArray(ring)) {
      return {
        valid: false,
        error: `El anillo ${ringLabel} no es una lista de posiciones válida.`,
      };
    }

    if (ring.length < 4) {
      return {
        valid: false,
        error: `El anillo ${ringLabel} tiene ${ring.length} puntos. Un polígono lineal debe tener al menos 4 posiciones para cerrarse.`,
      };
    }

    for (let p = 0; p < ring.length; p++) {
      const pt = ring[p];
      if (!Array.isArray(pt) || pt.length < 2) {
        return {
          valid: false,
          error: `El punto ${p} del anillo ${ringLabel} debe contener al menos 2 valores [longitud, latitud].`,
        };
      }

      const [lon, lat] = pt;

      if (typeof lon !== 'number' || isNaN(lon) || typeof lat !== 'number' || isNaN(lat)) {
        return {
          valid: false,
          error: `Coordenadas inválidas o no numéricas en el punto ${p} del anillo ${ringLabel}: [${lon}, ${lat}].`,
        };
      }

      if (lon < -180 || lon > 180) {
        return {
          valid: false,
          error: `Longitud fuera del rango WGS84 [-180, 180] en el punto ${p}: ${lon}.`,
        };
      }

      if (lat < -90 || lat > 90) {
        return {
          valid: false,
          error: `Latitud fuera del rango WGS84 [-90, 90] en el punto ${p}: ${lat}.`,
        };
      }
    }

    // Comprobación de cierre del anillo
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return {
        valid: false,
        error: `El anillo ${ringLabel} no está cerrado. El primer vértice [${first[0]}, ${first[1]}] debe ser idéntico al último [${last[0]}, ${last[1]}].`,
      };
    }
  }

  return { valid: true };
}

export interface ZoneEnhancementsInput {
  buffer_meters?: number | null;
  is_curfew?: boolean | null;
  curfew_start?: string | null;
  curfew_end?: string | null;
  contact_phone?: string | null;
  radio_frequency?: string | null;
  gate_access_protocol?: string | null;
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

/**
 * Valida los parámetros tácticos enriquecidos de una zona:
 * - buffer_meters: entero >= 0
 * - is_curfew / curfew_start / curfew_end: coherencia horaria y formato HH:MM o HH:MM:SS
 */
export function validateZoneEnhancements(input: ZoneEnhancementsInput): GeoValidationResult {
  if (input.buffer_meters !== undefined && input.buffer_meters !== null) {
    if (typeof input.buffer_meters !== 'number' || isNaN(input.buffer_meters) || input.buffer_meters < 0) {
      return {
        valid: false,
        error: 'El campo buffer_meters debe ser un número entero mayor o igual a 0.',
      };
    }
  }

  if (input.is_curfew) {
    if (!input.curfew_start || !input.curfew_end) {
      return {
        valid: false,
        error: 'Para zonas con toque de queda activo (is_curfew=true), es obligatorio especificar curfew_start y curfew_end.',
      };
    }

    if (!TIME_REGEX.test(input.curfew_start.trim())) {
      return {
        valid: false,
        error: `Formato de hora inválido en curfew_start: '${input.curfew_start}'. Debe ser HH:MM o HH:MM:SS (24h).`,
      };
    }

    if (!TIME_REGEX.test(input.curfew_end.trim())) {
      return {
        valid: false,
        error: `Formato de hora inválido en curfew_end: '${input.curfew_end}'. Debe ser HH:MM o HH:MM:SS (24h).`,
      };
    }
  }

  return { valid: true };
}

