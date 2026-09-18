'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { Search, Loader2, Navigation2, RotateCcw, Trash2, Crosshair, AlertCircle, CheckCircle2 } from 'lucide-react';
import { buildHereMultiLayerStyle } from '@/lib/geo/hereMapStyles';
import { getSeverityColor } from '@/lib/geo/tactical-zones';
import { buildHereGeocodeUrl, parseHereGeocodeResponse, GeocodeResult } from '@/lib/geo/geocoding';
import { ZoneSeverity, ZoneType } from '@/types/database';

export interface ZoneMiniMapProps {
  mode: 'country' | 'radius' | 'freehand';
  centerLng: number;
  centerLat: number;
  radiusKm: number;
  activeGeometry: GeoJSON.Polygon | null;
  rawCoordinatesText: string;
  severity: ZoneSeverity | string;
  zoneType: ZoneType | string;
  onCenterChange: (lng: number, lat: number) => void;
  onAddPoint: (point: [number, number]) => void;
  onClearPoints?: () => void;
  onUndoPoint?: () => void;
}

export const ZoneMiniMap: React.FC<ZoneMiniMapProps> = ({
  mode,
  centerLng,
  centerLat,
  radiusKm,
  activeGeometry,
  rawCoordinatesText,
  severity,
  zoneType,
  onCenterChange,
  onAddPoint,
  onClearPoints,
  onUndoPoint,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Estado desacoplado de carga del motor cartográfico (Evita condición de carrera)
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Estado del buscador toponímico (HERE Geocoding v7)
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'info';
  } | null>(null);

  const hereApiKey = process.env.NEXT_PUBLIC_HERE_API_KEY;

  // Color canónico derivado de la severidad y tipología para WebGL
  const hexColor = useMemo(
    () => getSeverityColor(severity, zoneType, 'hex'),
    [severity, zoneType]
  );

  // Inicializar instancia de MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const mapStyle = hereApiKey
      ? buildHereMultiLayerStyle(hereApiKey, 'explore.night')
      : (process.env.NEXT_PUBLIC_MAP_STYLE || 'https://demotiles.maplibre.org/style.json');

    // Inicializar mapa centrado en coordenadas iniciales
    const initialLng = !isNaN(centerLng) ? centerLng : -3.7038;
    const initialLat = !isNaN(centerLat) ? centerLat : 40.4168;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [initialLng, initialLat],
      zoom: mode === 'country' ? 3 : 10.5,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true,
      }),
      'top-right'
    );

    map.on('load', () => {
      // Activar flag reactivo una vez que el estilo base y canvas están listos
      setIsMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      setIsMapLoaded(false);
      map.remove();
      mapRef.current = null;
    };
  }, [hereApiKey]);

  // Forzar resize al cambiar de modo o montar para corregir dimensiones en contenedor modal
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [mode]);

  // Configuración del cursor dinámico según modalidad
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    if (mode === 'radius' || mode === 'freehand') {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [mode]);

  // Listener desacoplado de clics sobre el canvas
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const lng = Number(e.lngLat.lng.toFixed(5));
      const lat = Number(e.lngLat.lat.toFixed(5));

      if (mode === 'radius') {
        onCenterChange(lng, lat);
        setSearchFeedback({
          text: `Centro reubicado manualmente: [${lng}, ${lat}]`,
          type: 'info',
        });
      } else if (mode === 'freehand') {
        onAddPoint([lng, lat]);
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [mode, onCenterChange, onAddPoint]);

  // Construcción reactiva de la colección GeoJSON (Polígono + Vértices / Marcadores)
  const previewFeatureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];

    // 1. Polígono activo (Buffer circular, País o Polígono libre cerrado)
    if (activeGeometry && activeGeometry.coordinates && activeGeometry.coordinates.length > 0) {
      features.push({
        type: 'Feature',
        id: 'active-polygon',
        geometry: activeGeometry,
        properties: { role: 'zone-polygon' },
      });
    }

    // 2. Marcador del centro en modo Radio
    if (mode === 'radius' && !isNaN(centerLng) && !isNaN(centerLat)) {
      features.push({
        type: 'Feature',
        id: 'radius-center-point',
        geometry: {
          type: 'Point',
          coordinates: [centerLng, centerLat],
        },
        properties: { role: 'center-marker' },
      });
    }

    // 3. Vértices individuales en modo Polígono Libre para retroalimentación visual inmediata
    if (mode === 'freehand' && rawCoordinatesText.trim()) {
      const lines = rawCoordinatesText.split('\n').map((l) => l.trim()).filter(Boolean);
      lines.forEach((line, idx) => {
        const parts = line.split(/[,\s]+/).map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          features.push({
            type: 'Feature',
            id: `vertex-${idx}`,
            geometry: {
              type: 'Point',
              coordinates: [parts[0], parts[1]],
            },
            properties: { role: 'vertex-marker', index: idx + 1 },
          });
        }
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [activeGeometry, mode, centerLng, centerLat, rawCoordinatesText]);

  // Sincronización de capas y fuentes GeoJSON gateada por isMapLoaded (Mandato Claude / TerrenoScreen)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const sourceId = 'mini-zone-preview-source';
    const fillLayerId = 'mini-zone-preview-fill';
    const lineLayerId = 'mini-zone-preview-line';
    const pointsLayerId = 'mini-zone-preview-points';

    let source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;

    if (!source) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: previewFeatureCollection,
      });

      // Capa de Relleno translúcido
      map.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': hexColor,
          'fill-opacity': zoneType === 'RESPONSIBILITY' ? 0.12 : 0.28,
        },
      });

      // Capa de Contorno perimetral
      map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'line-color': hexColor,
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });

      // Capa de Puntos (centro de radio o vértices libres)
      map.addLayer({
        id: pointsLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': hexColor,
        },
      });
    } else {
      source.setData(previewFeatureCollection);

      // Actualizar colores dinámicos si cambia la severidad o tipología
      if (map.getLayer(fillLayerId)) {
        map.setPaintProperty(fillLayerId, 'fill-color', hexColor);
        map.setPaintProperty(
          fillLayerId,
          'fill-opacity',
          zoneType === 'RESPONSIBILITY' ? 0.12 : 0.28
        );
      }
      if (map.getLayer(lineLayerId)) {
        map.setPaintProperty(lineLayerId, 'line-color', hexColor);
      }
      if (map.getLayer(pointsLayerId)) {
        map.setPaintProperty(pointsLayerId, 'circle-stroke-color', hexColor);
      }
    }
  }, [isMapLoaded, previewFeatureCollection, hexColor, zoneType]);

  // Auto-ajuste de cámara (fitBounds) al cambiar país o geometría activa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeGeometry || !activeGeometry.coordinates || activeGeometry.coordinates.length === 0) {
      return;
    }

    if (mode === 'country') {
      const ring = activeGeometry.coordinates[0];
      if (ring && ring.length > 2) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }

        if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
          map.fitBounds(
            [
              [minX, minY],
              [maxX, maxY],
            ],
            { padding: 30, maxZoom: 7, duration: 600 }
          );
        }
      }
    }
  }, [mode, activeGeometry]);

  // Ejecutar búsqueda toponímica con HERE Geocoding v7 (Toma determinísticamente el primer resultado)
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    if (!hereApiKey) {
      setSearchFeedback({
        text: 'Clave de HERE API no configurada en cliente. Puede situar el centro clicando directamente en el mapa.',
        type: 'warning',
      });
      return;
    }

    setIsSearching(true);
    setSearchFeedback(null);

    try {
      const url = buildHereGeocodeUrl(query, hereApiKey);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status} en HERE Geocoding`);
      }

      const json = await res.json();
      const results: GeocodeResult[] = parseHereGeocodeResponse(json);

      if (results.length === 0) {
        setSearchFeedback({
          text: `No se encontraron resultados para "${query}". Intente con un nombre más general o haga clic en el mapa.`,
          type: 'warning',
        });
        return;
      }

      // Decisión consciente documentada: se toma el primer resultado canónico (items[0])
      const topResult = results[0];
      setSearchFeedback({
        text: `Ubicado: ${topResult.title} [${topResult.lng}, ${topResult.lat}]`,
        type: 'success',
      });

      onCenterChange(topResult.lng, topResult.lat);

      const map = mapRef.current;
      if (map) {
        map.flyTo({
          center: [topResult.lng, topResult.lat],
          zoom: 11,
          essential: true,
          duration: 1000,
        });
      }
    } catch (err: any) {
      console.error('Error en HERE Geocoding:', err);
      setSearchFeedback({
        text: 'Fallo al consultar HERE Geocoding. Puede reubicar el centro clicando directamente en el mapa.',
        type: 'warning',
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Barra de Búsqueda Toponímica para Modo Radio */}
      {mode === 'radius' && (
        <form onSubmit={handleSearchSubmit} className="space-y-1.5">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--color-text)] opacity-50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar lugar (ej: Bamako, Malí / Gao / Tombuctú)..."
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-1.5 bg-[var(--color-accent)] text-white text-xs font-heading font-semibold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Buscando</span>
                </>
              ) : (
                <>
                  <Navigation2 className="w-3.5 h-3.5" />
                  <span>Ubicar</span>
                </>
              )}
            </button>
          </div>

          {searchFeedback && (
            <div
              className={`px-2.5 py-1 text-[11px] font-mono flex items-center gap-1.5 border ${
                searchFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : searchFeedback.type === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] border-[var(--color-accent)]/30 text-[var(--color-accent)]'
              }`}
            >
              {searchFeedback.type === 'success' ? (
                <CheckCircle2 className="w-3 h-3 shrink-0" />
              ) : (
                <AlertCircle className="w-3 h-3 shrink-0" />
              )}
              <span className="truncate">{searchFeedback.text}</span>
            </div>
          )}
        </form>
      )}

      {/* Controles de Ayuda para Modo Polígono Libre */}
      {mode === 'freehand' && (
        <div className="flex items-center justify-between text-[11px] font-mono bg-[var(--color-bg)] px-2.5 py-1.5 border border-[var(--color-divider)]">
          <span className="opacity-70 flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-[var(--color-accent)]" />
            Haga clic en el mapa para situar vértices sucesivamente.
          </span>
          <div className="flex items-center gap-2">
            {onUndoPoint && (
              <button
                type="button"
                onClick={onUndoPoint}
                className="px-2 py-0.5 border border-[var(--color-divider)] hover:border-[var(--color-text)] text-[10px] uppercase tracking-wider flex items-center gap-1 transition-colors"
                title="Deshacer último vértice"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Deshacer</span>
              </button>
            )}
            {onClearPoints && (
              <button
                type="button"
                onClick={onClearPoints}
                className="px-2 py-0.5 border border-[var(--color-divider)] hover:border-red-500 hover:text-red-400 text-[10px] uppercase tracking-wider flex items-center gap-1 transition-colors"
                title="Limpiar todos los vértices"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Contenedor DOM de MapLibre GL */}
      <div className="relative border border-[var(--color-divider)] overflow-hidden bg-[#0c121e]">
        <div ref={mapContainerRef} className="w-full h-64" />

        {/* HUD informativo sutil sobreimpreso en el mapa */}
        <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-black/70 backdrop-blur-sm border border-white/10 text-[9px] font-mono text-white/80 pointer-events-none flex items-center gap-2">
          <span>MODALIDAD: {mode.toUpperCase()}</span>
          {mode === 'radius' && (
            <span>
              CENTRO: [{centerLng.toFixed(4)}, {centerLat.toFixed(4)}] · {radiusKm} KM
            </span>
          )}
          {mode === 'freehand' && (
            <span>
              VÉRTICES:{' '}
              {rawCoordinatesText.split('\n').map((l) => l.trim()).filter(Boolean).length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
