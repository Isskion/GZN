'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Radio,
  Users,
  Shield,
  RefreshCw,
  Clock,
  Eye,
  Crosshair,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import {
  buildHereMultiLayerStyle,
  setHereActiveLayer,
  type HereMapStyleId,
} from '@/lib/geo/hereMapStyles';
import { TacticalLayerSelector } from '@/components/map/TacticalLayerSelector';
import { TacticalHud } from '@/components/map/TacticalHud';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';

interface ZoneItem {
  id: string;
  name: string;
  severity: 'RED' | 'AMBER' | 'SAFE_HAVEN';
  color: string;
  description?: string;
  center?: [number, number];
}

interface TravelerItem {
  id: string;
  name: string;
  callsign: string;
  status: 'SAFE' | 'WARNING' | 'DANGER' | 'PANIC' | 'INCOMMUNICADO';
  lat: number;
  lon: number;
  battery: number;
  lastPing: string;
}

interface TerrenoScreenProps {
  onAlertTriggered?: (count: number) => void;
}

export const TerrenoScreen: React.FC<TerrenoScreenProps> = ({ onAlertTriggered }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  // Motor Cartográfico HERE (Módulo 2)
  const [activeLayer, setActiveLayer] = useState<HereMapStyleId>('explore.night');
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  // NOTA OPSEC / TELEMETRÍA DE MUESTRA:
  // Coordenadas de muestra para evaluación técnica de geocercas y capas tácticas.
  // La ubicación inicial es un dato de demostración y no un requisito fijo de producto.
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lon: number }>({
    lat: 40.4168,
    lon: -3.7038,
  });
  const [zoom, setZoom] = useState<number>(12.5);
  const [bearing, setBearing] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [selectedTravelerId, setSelectedTravelerId] = useState<string | null>(null);

  const hereApiKey = process.env.NEXT_PUBLIC_HERE_API_KEY;
  const isHereConfigured = !!hereApiKey;

  // Sujetos tácticos en el sector
  const [travelers, setTravelers] = useState<TravelerItem[]>([
    {
      id: 't-01',
      name: 'Carlos Mendoza',
      callsign: 'CONVOY-ALFA',
      status: 'SAFE',
      lat: 40.4168,
      lon: -3.7038,
      battery: 84,
      lastPing: 'Hace 30 seg',
    },
    {
      id: 't-02',
      name: 'Sofía Valdés',
      callsign: 'VIP-BRAVO',
      status: 'WARNING',
      lat: 40.4220,
      lon: -3.6920,
      battery: 42,
      lastPing: 'Hace 1 min',
    },
    {
      id: 't-03',
      name: 'Javier Castillo',
      callsign: 'LOG-CHARLIE',
      status: 'SAFE',
      lat: 40.4050,
      lon: -3.6880,
      battery: 95,
      lastPing: 'Hace 10 seg',
    },
  ]);

  const zones: ZoneItem[] = [
    {
      id: 'z-01',
      name: 'Distrito Norte - Conflicto Táctico',
      severity: 'RED',
      color: 'var(--risk-crit)',
      description: 'Combates activos reportados · Acceso vetado',
      center: [-3.7050, 40.4300],
    },
    {
      id: 'z-02',
      name: 'Corredor Sur - Toque de Queda',
      severity: 'AMBER',
      color: 'var(--risk-high)',
      description: 'Restricción de tránsito 20:00 - 06:00',
      center: [-3.7040, 40.4168],
    },
    {
      id: 'z-03',
      name: 'Embajada y Base Segura',
      severity: 'SAFE_HAVEN',
      color: 'var(--risk-stable)',
      description: 'Punto de reunión y extracción segura',
      center: [-3.7040, 40.4040],
    },
  ];

  // Inicializar MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const mapStyle = hereApiKey
      ? buildHereMultiLayerStyle(hereApiKey, 'explore.night')
      : (process.env.NEXT_PUBLIC_MAP_STYLE || 'https://demotiles.maplibre.org/style.json');

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [-3.7038, 40.4168],
      zoom: 12.5,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      'top-right'
    );
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: 'metric' }), 'bottom-left');

    map.on('mousemove', (e) => {
      setCursorCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    map.on('mouseout', () => {
      setCursorCoords(null);
    });

    map.on('move', () => {
      const c = map.getCenter();
      setCenterCoords({ lat: c.lat, lon: c.lng });
      setZoom(map.getZoom());
      setBearing(map.getBearing());
      setPitch(map.getPitch());
    });

    map.on('load', () => {
      // 1. Capa de Zona Roja
      map.addSource('red-zone', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-3.7150, 40.4250],
              [-3.6950, 40.4250],
              [-3.6950, 40.4350],
              [-3.7150, 40.4350],
              [-3.7150, 40.4250],
            ]],
          },
          properties: { name: 'Zona Roja - Conflicto Táctico' },
        },
      });

      map.addLayer({
        id: 'red-zone-fill',
        type: 'fill',
        source: 'red-zone',
        paint: {
          'fill-color': '#e07a6a',
          'fill-opacity': 0.32,
        },
      });

      map.addLayer({
        id: 'red-zone-line',
        type: 'line',
        source: 'red-zone',
        paint: {
          'line-color': '#e07a6a',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });

      // 2. Capa de Safe Haven
      map.addSource('safe-haven', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-3.7100, 40.4000],
              [-3.6980, 40.4000],
              [-3.6980, 40.4080],
              [-3.7100, 40.4080],
              [-3.7100, 40.4000],
            ]],
          },
          properties: { name: 'Safe Haven - Embajada Táctica' },
        },
      });

      map.addLayer({
        id: 'safe-haven-fill',
        type: 'fill',
        source: 'safe-haven',
        paint: {
          'fill-color': '#63b598',
          'fill-opacity': 0.28,
        },
      });

      map.addLayer({
        id: 'safe-haven-line',
        type: 'line',
        source: 'safe-haven',
        paint: {
          'line-color': '#63b598',
          'line-width': 2,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [hereApiKey]);

  // Actualizar marcadores tácticos
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    travelers.forEach((t) => {
      if (markersRef.current[t.id]) {
        markersRef.current[t.id].setLngLat([t.lon, t.lat]);
      } else {
        const el = document.createElement('div');
        el.className =
          'tmarker w-6 h-6 rounded-full border border-[var(--color-bg)] flex items-center justify-center text-[10px] font-mono font-bold text-white shadow-lg cursor-pointer transition-transform hover:scale-110';
        
        el.style.backgroundColor =
          t.status === 'PANIC' || t.status === 'DANGER'
            ? 'var(--risk-crit)'
            : t.status === 'WARNING'
            ? 'var(--risk-high)'
            : 'var(--risk-stable)';

        if (t.status === 'PANIC' || t.status === 'DANGER') {
          el.classList.add('panic-pulse');
        }

        el.innerText = t.callsign.charAt(0);

        const popup = new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(`
          <div class="p-2 bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-divider)] font-mono text-xs shadow-xl">
            <div class="font-bold text-sm text-[var(--color-accent)] flex items-center justify-between">
              <span>${t.name}</span>
              <span class="text-[9px] px-1 py-0.5 border border-[var(--color-divider)]">${t.status}</span>
            </div>
            <div class="text-[11px] opacity-75 mt-1">Indicativo: <b>${t.callsign}</b></div>
            <div class="text-[11px] opacity-75">Batería: <b>${t.battery}%</b></div>
            <div class="text-[10px] opacity-50 mt-1 border-t border-[var(--color-divider)] pt-1">
              ${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([t.lon, t.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current[t.id] = marker;
      }
    });
  }, [travelers]);

  const handleSelectLayer = (layerId: HereMapStyleId) => {
    setActiveLayer(layerId);
    if (mapRef.current && isHereConfigured) {
      setHereActiveLayer(mapRef.current, layerId);
    }
  };

  const handleSelectTraveler = (t: TravelerItem) => {
    setSelectedTravelerId(t.id);
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [t.lon, t.lat],
      zoom: 15,
      pitch: 30,
      duration: 1200,
    });
    markersRef.current[t.id]?.togglePopup();
  };

  const handleSelectZone = (z: ZoneItem) => {
    if (!mapRef.current || !z.center) return;
    mapRef.current.flyTo({
      center: z.center,
      zoom: z.severity === 'RED' ? 14 : 15,
      pitch: 25,
      duration: 1200,
    });
  };

  const handleCenterFleet = () => {
    if (!mapRef.current || travelers.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    travelers.forEach((t) => bounds.extend([t.lon, t.lat]));
    mapRef.current.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 1200 });
  };

  const handleCenterRedZone = () => {
    mapRef.current?.flyTo({ center: [-3.7050, 40.4300], zoom: 14, duration: 1200 });
  };

  const handleCenterSafeHaven = () => {
    mapRef.current?.flyTo({ center: [-3.7040, 40.4040], zoom: 15, duration: 1200 });
  };

  const handleSimulateIntrusion = () => {
    setIsSimulating(true);
    setSimulationLog('Simulando desplazamiento de CONVOY-ALFA hacia el interior de la Zona Roja...');

    setTimeout(() => {
      setTravelers((prev) =>
        prev.map((t) =>
          t.id === 't-01'
            ? { ...t, lat: 40.4280, lon: -3.7050, status: 'DANGER', lastPing: 'Ahora mismo' }
            : t
        )
      );
      onAlertTriggered?.(2);
      setSimulationLog('🚨 GEOPROTECT TRIGGER: CONVOY-ALFA ha violado el perímetro de ZONA ROJA.');
      setIsSimulating(false);
      mapRef.current?.flyTo({ center: [-3.7050, 40.4280], zoom: 15, pitch: 35, duration: 1000 });
    }, 1200);
  };

  const handleSimulatePanic = () => {
    setIsSimulating(true);
    setSimulationLog('Simulando pulsación de BOTÓN DE PÁNICO por VIP-BRAVO...');

    setTimeout(() => {
      setTravelers((prev) =>
        prev.map((t) =>
          t.id === 't-02'
            ? { ...t, status: 'PANIC', lastPing: 'Ahora mismo' }
            : t
        )
      );
      onAlertTriggered?.(2);
      setSimulationLog('🚨 SOS CRÍTICO: ¡Botón de pánico activado por VIP-BRAVO! Protocolo RSO activo.');
      setIsSimulating(false);
      mapRef.current?.flyTo({ center: [-3.6920, 40.4220], zoom: 15.5, pitch: 40, duration: 1000 });
    }, 1000);
  };

  return (
    <div className="terreno flex h-full min-h-0 overflow-hidden">
      {/* Columna Lateral Izquierda (Panel Táctico) */}
      <aside className="w-80 border-r border-[var(--color-divider)] flex flex-col min-h-0 bg-[var(--color-bg)] overflow-y-auto">
        {/* Barra de Simulación Táctica */}
        <div className="simbar p-3 border-b border-[var(--color-divider)] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="kicker">Simulador Operativo</span>
            {isSimulating && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)]" />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSimulateIntrusion}
              disabled={isSimulating}
              className="btn btn-secondary text-xs flex items-center justify-center gap-1 py-1.5"
            >
              <AlertTriangle className="w-3 h-3 text-[var(--risk-high)]" />
              <span>Incursión</span>
            </button>
            <button
              type="button"
              onClick={handleSimulatePanic}
              disabled={isSimulating}
              className="btn btn-secondary text-xs flex items-center justify-center gap-1 py-1.5 border-[var(--risk-crit)] text-[var(--risk-crit)]"
            >
              <Radio className="w-3 h-3 text-[var(--risk-crit)]" />
              <span>Pánico SOS</span>
            </button>
          </div>
        </div>

        {/* En el sector (Travelers) */}
        <div className="p-3 border-b border-[var(--color-divider)]">
          <div className="flex items-center justify-between mb-2">
            <span className="kicker">En el Sector ({travelers.length})</span>
            <span className="text-[10px] font-mono opacity-50">TELEMETRÍA</span>
          </div>
          <div className="divide-y divide-[color-mix(in_srgb,var(--color-text)_8%,transparent)]">
            {travelers.map((t) => {
              const isCrit = t.status === 'PANIC' || t.status === 'DANGER';
              const isWarn = t.status === 'WARNING';
              const tierColor = isCrit
                ? 'var(--risk-crit)'
                : isWarn
                ? 'var(--risk-high)'
                : 'var(--risk-stable)';

              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectTraveler(t)}
                  className="grid grid-cols-[3px_1fr_auto] gap-2.5 py-2 px-1 items-center cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] transition-colors"
                >
                  <i className="self-stretch rounded-sm" style={{ backgroundColor: tierColor }} />
                  <div>
                    <strong className="text-xs font-semibold block">{t.callsign}</strong>
                    <small className="text-[10px] opacity-60 block">{t.name}</small>
                  </div>
                  <div className="text-right">
                    <span
                      className="tag text-[9px]"
                      style={{
                        borderColor: tierColor,
                        color: tierColor,
                      }}
                    >
                      {t.status}
                    </span>
                    <span className="font-mono text-[9px] opacity-50 block mt-0.5">{t.battery}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Zonas y Perímetros Activos */}
        <div className="p-3 border-b border-[var(--color-divider)]">
          <div className="flex items-center justify-between mb-2">
            <span className="kicker">Zonas y Perímetros</span>
            <span className="text-[10px] font-mono opacity-50">{zones.length} REGLAS</span>
          </div>
          <div className="divide-y divide-[color-mix(in_srgb,var(--color-text)_8%,transparent)]">
            {zones.map((z) => (
              <div
                key={z.id}
                onClick={() => handleSelectZone(z)}
                className="py-2 px-1 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{z.name}</span>
                  <span
                    className="tag text-[9px]"
                    style={{
                      borderColor: z.color,
                      color: z.color,
                    }}
                  >
                    {z.severity}
                  </span>
                </div>
                {z.description && (
                  <p className="text-[11px] opacity-65 m-0 mt-0.5 leading-snug">{z.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Log de Campo Táctico */}
        <div className="p-3 mt-auto border-t border-[var(--color-divider)] bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker">Log de Campo</span>
          <div className="font-mono text-[11px] mt-1.5 opacity-80 leading-relaxed min-h-[40px]">
            {simulationLog ? (
              <span className="text-[var(--color-text)]">{simulationLog}</span>
            ) : (
              <span className="opacity-50">Todos los enlaces activos. Esperando evento...</span>
            )}
          </div>
        </div>
      </aside>

      {/* Espacio Cartográfico Central */}
      <main className="flex-1 relative min-h-0 bg-[var(--color-surface)]">
        {/* Selector de Capa HERE v3 Flotante */}
        <div className="absolute top-4 right-14 z-20">
          <TacticalLayerSelector
            activeLayer={activeLayer}
            onSelectLayer={handleSelectLayer}
            isHereConfigured={isHereConfigured}
          />
        </div>

        {/* Mapa MapLibre GL */}
        <div ref={mapContainer} className="w-full h-full" />

        {/* HUD Táctico Inferior */}
        <TacticalHud
          cursorCoords={cursorCoords}
          centerCoords={centerCoords}
          zoom={zoom}
          bearing={bearing}
          pitch={pitch}
          isHereActive={isHereConfigured}
          onCenterFleet={handleCenterFleet}
          onCenterRedZone={handleCenterRedZone}
          onCenterSafeHaven={handleCenterSafeHaven}
        />
      </main>
    </div>
  );
};
