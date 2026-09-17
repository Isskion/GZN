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

export interface ZoneItem {
  id: string;
  name: string;
  zone_type: 'RESPONSIBILITY' | 'THREAT';
  severity: 'RED' | 'AMBER' | 'SAFE_HAVEN' | 'CORRIDOR' | 'OPERATIONAL';
  color: string;
  description?: string;
  center?: [number, number];
  buffer_meters?: number;
  is_curfew?: boolean;
  curfew_start?: string | null;
  curfew_end?: string | null;
  contact_phone?: string | null;
  radio_frequency?: string | null;
  gate_access_protocol?: string | null;
  assigned_rso_id?: string | null;
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
  canManageZones?: boolean;
  onOpenCreateZone?: () => void;
  onEditZone?: (zone: any) => void;
  refreshTrigger?: number;
}

export const TerrenoScreen: React.FC<TerrenoScreenProps> = ({
  onAlertTriggered,
  canManageZones = false,
  onOpenCreateZone,
  onEditZone,
  refreshTrigger = 0,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

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

  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState<boolean>(true);
  const [zonesGeoJson, setZonesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);

  // Cargar zonas reales desde la API (GET /api/zones)
  useEffect(() => {
    let isMounted = true;
    const fetchZones = async () => {
      try {
        setIsLoadingZones(true);
        const res = await fetch('/api/zones');
        if (!res.ok) return;
        const data: GeoJSON.FeatureCollection = await res.json();
        if (!isMounted) return;

        setZonesGeoJson(data);

        const mapped: ZoneItem[] = (data.features || []).map((f: any) => {
          let center: [number, number] | undefined = undefined;
          if (f.geometry?.type === 'Polygon' && f.geometry.coordinates?.[0]?.length > 0) {
            const ring = f.geometry.coordinates[0];
            let sumLng = 0;
            let sumLat = 0;
            for (let i = 0; i < ring.length - 1; i++) {
              sumLng += ring[i][0];
              sumLat += ring[i][1];
            }
            const count = ring.length - 1;
            center = [Number((sumLng / count).toFixed(6)), Number((sumLat / count).toFixed(6))];
          }

          const zType = (f.properties?.zone_type || 'THREAT') as 'RESPONSIBILITY' | 'THREAT';
          const sev = (f.properties?.severity || (zType === 'RESPONSIBILITY' ? 'OPERATIONAL' : 'RED')) as ZoneItem['severity'];
          const defaultColor =
            zType === 'RESPONSIBILITY'
              ? 'var(--color-accent)'
              : sev === 'RED'
              ? 'var(--risk-crit)'
              : sev === 'AMBER'
              ? 'var(--risk-high)'
              : sev === 'SAFE_HAVEN'
              ? 'var(--risk-stable)'
              : 'var(--risk-watch)';

          return {
            id: String(f.properties?.id || f.id),
            name: f.properties?.name || 'Zona táctica',
            zone_type: zType,
            severity: sev,
            color: f.properties?.color || defaultColor,
            description: f.properties?.description,
            center,
            buffer_meters: f.properties?.buffer_meters,
            is_curfew: f.properties?.is_curfew,
            curfew_start: f.properties?.curfew_start,
            curfew_end: f.properties?.curfew_end,
            contact_phone: f.properties?.contact_phone,
            radio_frequency: f.properties?.radio_frequency,
            gate_access_protocol: f.properties?.gate_access_protocol,
            assigned_rso_id: f.properties?.assigned_rso_id,
          };
        });

        setZones(mapped);
      } catch (err) {
        console.error('Error cargando zonas de la base de datos:', err);
      } finally {
        if (isMounted) setIsLoadingZones(false);
      }
    };

    fetchZones();

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

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

      // Notificar que el estilo y mapa base están listos
      setIsMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      setIsMapLoaded(false);
      map.remove();
      mapRef.current = null;
    };
  }, [hereApiKey]);

  // Sincronización desacoplada de Zonas Tácticas con MapLibre GL (Resuelve condición de carrera)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const emptyCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    const dataToSet = zonesGeoJson || emptyCollection;

    const source = map.getSource('gzn-tactical-zones') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(dataToSet);
    } else {
      map.addSource('gzn-tactical-zones', {
        type: 'geojson',
        data: dataToSet,
      });

      if (!map.getLayer('gzn-tactical-zones-fill')) {
        map.addLayer({
          id: 'gzn-tactical-zones-fill',
          type: 'fill',
          source: 'gzn-tactical-zones',
          paint: {
            'fill-color': [
              'match',
              ['get', 'zone_type'],
              'RESPONSIBILITY',
              '#5980a6',
              [
                'match',
                ['get', 'severity'],
                'RED',
                '#e07a6a',
                'AMBER',
                '#d8a84f',
                'SAFE_HAVEN',
                '#63b598',
                'CORRIDOR',
                '#94bce3',
                '#5980a6',
              ],
            ],
            'fill-opacity': [
              'match',
              ['get', 'zone_type'],
              'RESPONSIBILITY',
              0.08,
              0.28,
            ],
          },
        });
      }

      if (!map.getLayer('gzn-tactical-zones-line')) {
        map.addLayer({
          id: 'gzn-tactical-zones-line',
          type: 'line',
          source: 'gzn-tactical-zones',
          paint: {
            'line-color': [
              'match',
              ['get', 'zone_type'],
              'RESPONSIBILITY',
              '#5980a6',
              [
                'match',
                ['get', 'severity'],
                'RED',
                '#e07a6a',
                'AMBER',
                '#d8a84f',
                'SAFE_HAVEN',
                '#63b598',
                'CORRIDOR',
                '#94bce3',
                '#5980a6',
              ],
            ],
            'line-width': [
              'match',
              ['get', 'zone_type'],
              'RESPONSIBILITY',
              1.5,
              2,
            ],
          },
        });
      }

      // Evento de clic en zona dinámica para desplegar Popup Táctico
      map.on('click', 'gzn-tactical-zones-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const f = e.features[0];
        const p = f.properties || {};
        const isResp = p.zone_type === 'RESPONSIBILITY';

        new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: var(--font-heading, sans-serif); padding: 4px; color: #1d1f20;">
              <div style="font-size: 9px; font-family: monospace; color: ${isResp ? '#2f4a63' : '#a5762d'}; font-weight: 700; text-transform: uppercase;">
                ${isResp ? '🛡️ ZONA DE CONTROL OPERATIVO' : `⚠️ ÁREA DE PELIGRO [${p.severity || 'ZONA'}]`}
              </div>
              <div style="font-weight: 700; font-size: 13px; text-transform: uppercase; margin-top: 2px;">
                ${p.name || 'Sin nombre'}
              </div>
              ${p.description ? `<p style="font-size: 11px; opacity: 0.8; margin: 4px 0 0 0; line-height: 1.3;">${p.description}</p>` : ''}
              ${p.is_curfew ? `<div style="margin-top: 4px; font-size: 10px; color: #a5762d; font-family: monospace;">⚠️ TOQUE DE QUEDA: ${p.curfew_start || ''} - ${p.curfew_end || ''} UTC</div>` : ''}
              ${p.radio_frequency ? `<div style="font-size: 10px; font-family: monospace; opacity: 0.7; margin-top: 2px;">RADIO: ${p.radio_frequency}</div>` : ''}
            </div>
          `)
          .addTo(map);
      });
    }
  }, [isMapLoaded, zonesGeoJson]);

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
    if (!mapRef.current) return;
    if (z.center) {
      const isMacro = z.name.toLowerCase().includes('teatro') || z.name.toLowerCase().includes('país') || z.name.toLowerCase().includes('operativo');
      mapRef.current.flyTo({
        center: z.center,
        zoom: isMacro ? 5.5 : z.severity === 'RED' ? 13.5 : 14.5,
        pitch: isMacro ? 0 : 20,
        duration: 1200,
      });
      setSimulationLog(`Enfocando ${z.name} [${z.severity}]`);
    }
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
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono opacity-50">{zones.length} ZONAS</span>
              {canManageZones && onOpenCreateZone && (
                <button
                  type="button"
                  onClick={onOpenCreateZone}
                  className="text-[10px] font-heading font-semibold uppercase px-2 py-0.5 border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] transition-colors cursor-pointer"
                >
                  + DELIMITAR
                </button>
              )}
            </div>
          </div>
          {isLoadingZones ? (
            <div className="py-3 text-center text-xs font-mono opacity-50">Cargando zonas de PostGIS...</div>
          ) : zones.length === 0 ? (
            <div className="py-3 text-center text-xs opacity-60">
              <span>No hay áreas tácticas activas.</span>
              {canManageZones && onOpenCreateZone && (
                <button
                  type="button"
                  onClick={onOpenCreateZone}
                  className="block mx-auto mt-1.5 text-xs font-heading font-semibold uppercase text-[var(--color-accent)] hover:underline cursor-pointer"
                >
                  + Delimitar primera zona
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[color-mix(in_srgb,var(--color-text)_8%,transparent)] max-h-56 overflow-y-auto">
              {zones.map((z) => {
                const isResp = z.zone_type === 'RESPONSIBILITY';
                return (
                  <div
                    key={z.id}
                    onClick={() => handleSelectZone(z)}
                    className="py-2 px-1 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isResp ? (
                          <Shield className="w-3 h-3 text-[var(--color-accent)] shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: z.color }} />
                        )}
                        <span className="text-xs font-medium truncate max-w-[155px]">{z.name}</span>
                      </div>
                      <span
                        className="tag text-[9px]"
                        style={{
                          borderColor: isResp ? 'var(--color-accent)' : z.color,
                          color: isResp ? 'var(--color-accent)' : z.color,
                        }}
                      >
                        {isResp ? 'CONTROL' : z.severity}
                      </span>
                    </div>
                    {z.description && (
                      <p className="text-[11px] opacity-65 m-0 mt-0.5 leading-snug line-clamp-2">{z.description}</p>
                    )}
                    <div className="flex items-center justify-between text-[9px] font-mono opacity-50 mt-1">
                      <span>{isResp ? 'TEATRO OPERATIVO' : (z.is_curfew ? '⚠️ TOQUE DE QUEDA' : 'PERÍMETRO TÁCTICO')}</span>
                      {canManageZones && onEditZone && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditZone({
                              id: z.id,
                              geometry: { type: 'Polygon', coordinates: [] },
                              properties: {
                                id: z.id,
                                name: z.name,
                                description: z.description,
                                zone_type: z.zone_type,
                                severity: z.severity,
                                assigned_rso_id: z.assigned_rso_id,
                                buffer_meters: z.buffer_meters,
                                is_curfew: z.is_curfew,
                                curfew_start: z.curfew_start,
                                curfew_end: z.curfew_end,
                                contact_phone: z.contact_phone,
                                radio_frequency: z.radio_frequency,
                                gate_access_protocol: z.gate_access_protocol,
                              },
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[var(--color-accent)] hover:underline uppercase text-[9px] font-heading font-semibold"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
