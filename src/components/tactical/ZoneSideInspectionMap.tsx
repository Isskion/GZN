'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { Maximize2, X, Shield, AlertTriangle, Crosshair } from 'lucide-react';
import { buildHereMultiLayerStyle } from '@/lib/geo/hereMapStyles';
import {
  getSeverityColor,
  calculatePolygonCentroid,
  calculateRingAreaKm2,
  TACTICAL_ZONE_ZOOM_500M,
} from '@/lib/geo/tactical-zones';
import { ZoneSeverity, ZoneType } from '@/types/database';

export interface ZoneSideInspectionMapProps {
  zone: any; // GeoJSON Feature
  onClose: () => void;
  onExpand: () => void;
}

export const ZoneSideInspectionMap: React.FC<ZoneSideInspectionMapProps> = ({
  zone,
  onClose,
  onExpand,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Estado desacoplado de carga del motor cartográfico (Evita condición de carrera)
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const hereApiKey = process.env.NEXT_PUBLIC_HERE_API_KEY;

  // Propiedades de la zona seleccionada
  const p = zone?.properties || {};
  const zType: ZoneType = (p.zone_type || 'THREAT') as ZoneType;
  const isResp = zType === 'RESPONSIBILITY';
  const severity: ZoneSeverity = p.severity || (isResp ? 'OPERATIONAL' : 'RED');

  // Color canónico derivado para WebGL y variables CSS
  const hexColor = useMemo(
    () => getSeverityColor(severity, zType, 'hex'),
    [severity, zType]
  );
  const cssColor = useMemo(
    () => getSeverityColor(severity, zType, 'css'),
    [severity, zType]
  );

  // Centroide canónico WGS84 de la zona
  const center = useMemo<[number, number]>(() => {
    if (zone?.geometry?.coordinates?.[0]?.length > 0) {
      return calculatePolygonCentroid(zone.geometry.coordinates[0]);
    }
    return [-3.7038, 40.4168];
  }, [zone]);

  // Superficie aproximada en km²
  const approxAreaKm2 = useMemo(() => {
    if (zone?.geometry?.coordinates?.[0]?.length > 0) {
      return calculateRingAreaKm2(zone.geometry.coordinates[0]);
    }
    return 0;
  }, [zone]);

  // Inicialización del mapa MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const mapStyle = hereApiKey
      ? buildHereMultiLayerStyle(hereApiKey, 'explore.night')
      : (process.env.NEXT_PUBLIC_MAP_STYLE || 'https://demotiles.maplibre.org/style.json');

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center,
      zoom: TACTICAL_ZONE_ZOOM_500M,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: false,
      }),
      'top-right'
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
      'bottom-left'
    );

    map.on('load', () => {
      // 1. Fuente GeoJSON de la zona inspeccionada
      map.addSource('inspect-zone-source', {
        type: 'geojson',
        data: zone,
      });

      // 2. Capa de relleno con color canónico
      map.addLayer({
        id: 'inspect-zone-fill',
        type: 'fill',
        source: 'inspect-zone-source',
        paint: {
          'fill-color': hexColor,
          'fill-opacity': 0.35,
        },
      });

      // 3. Capa de contorno perimetral
      map.addLayer({
        id: 'inspect-zone-line',
        type: 'line',
        source: 'inspect-zone-source',
        paint: {
          'line-color': hexColor,
          'line-width': 2.5,
        },
      });

      // 4. Marcador de centroide táctico
      map.addSource('inspect-zone-center', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: center,
          },
          properties: {},
        },
      });

      map.addLayer({
        id: 'inspect-zone-center-point',
        type: 'circle',
        source: 'inspect-zone-center',
        paint: {
          'circle-radius': 5,
          'circle-color': hexColor,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      setIsMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      setIsMapLoaded(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar geometría y volar a la zona cuando cambie la selección
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !zone) return;

    // Actualizar datos del polígono
    const source = map.getSource('inspect-zone-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(zone);
    }

    // Actualizar posición del centroide
    const centerSource = map.getSource('inspect-zone-center') as maplibregl.GeoJSONSource;
    if (centerSource) {
      centerSource.setData({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: center,
        },
        properties: {},
      });
    }

    // Actualizar colores dinámicamente
    if (map.getLayer('inspect-zone-fill')) {
      map.setPaintProperty('inspect-zone-fill', 'fill-color', hexColor);
    }
    if (map.getLayer('inspect-zone-line')) {
      map.setPaintProperty('inspect-zone-line', 'line-color', hexColor);
    }
    if (map.getLayer('inspect-zone-center-point')) {
      map.setPaintProperty('inspect-zone-center-point', 'circle-color', hexColor);
    }

    // Centrar con zoom táctico a 500 metros
    map.flyTo({
      center,
      zoom: TACTICAL_ZONE_ZOOM_500M,
      duration: 1000,
    });
  }, [zone, isMapLoaded, center, hexColor]);

  // Observador de redimensionamiento para evitar renderizado parcial en split-view
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border border-[var(--color-divider)] overflow-hidden shadow-md">
      {/* Cabecera del Panel Lateral de Inspección */}
      <div className="p-3 border-b border-[var(--color-divider)] bg-[var(--color-surface)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isResp ? (
            <Shield className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="font-heading font-bold text-xs uppercase text-[var(--color-text)] truncate">
              {p.name || 'Zona sin nombre'}
            </div>
            <div className="text-[10px] font-mono text-[var(--color-text-muted)] flex items-center gap-1.5">
              <span>{isResp ? 'CONTROL' : 'PELIGRO'}</span>
              <span>·</span>
              <span style={{ color: cssColor }} className="font-bold">
                {severity}
              </span>
            </div>
          </div>
        </div>

        {/* Botones de acción del panel: Ampliar y Cerrar (Mandato Daniel) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onExpand}
            title="Ampliar a pantalla completa en Terreno"
            className="px-2.5 py-1 border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/15 text-[11px] font-heading font-semibold uppercase tracking-wider flex items-center gap-1 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ampliar</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar mapa lateral"
            className="p-1 border border-[var(--color-divider)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenedor del Mapa MapLibre */}
      <div className="flex-1 min-h-[300px] relative overflow-hidden bg-black/40">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* Retícula central táctica */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
          <Crosshair className="w-10 h-10 text-[var(--color-accent)]" />
        </div>
      </div>

      {/* HUD Telemetría Inferior */}
      <div className="p-2.5 border-t border-[var(--color-divider)] bg-[var(--color-bg)]/80 text-[10px] font-mono flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <span>Lat: {center[1].toFixed(4)}°</span>
          <span>Lon: {center[0].toFixed(4)}°</span>
          {approxAreaKm2 > 0 && <span>· {approxAreaKm2.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km²</span>}
        </div>
        <div className="text-[9px] opacity-60">
          Zoom táctico: 500m · Rueda: +/-
        </div>
      </div>
    </div>
  );
};
