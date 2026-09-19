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
  CheckCircle2,
  Layers,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import {
  buildHereMultiLayerStyle,
  setHereActiveLayer,
  type HereMapStyleId,
} from '@/lib/geo/hereMapStyles';
import {
  getSeverityColor,
  buildSeverityMatchExpression,
  calculatePolygonCentroid,
  TACTICAL_ZONE_ZOOM_500M,
} from '@/lib/geo/tactical-zones';
import { TacticalLayerSelector } from '@/components/map/TacticalLayerSelector';
import { TacticalHud } from '@/components/map/TacticalHud';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';
import { TravelerDrawer } from '@/components/industry/TravelerDrawer';
import { Traveler } from '@/types/database';

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
  lat: number | null;
  lon: number | null;
  battery: number;
  lastPing: string;
  assigned_zone_id?: string | null;
  assigned_zone_name?: string | null;
  assigned_zone_color?: string | null;
  assigned_rso_name?: string | null;
  rawTraveler?: Traveler;
}

interface TerrenoScreenProps {
  onAlertTriggered?: (count: number) => void;
  canManageZones?: boolean;
  canManageTravelers?: boolean;
  onOpenCreateZone?: () => void;
  onOpenCreateTraveler?: () => void;
  onEditZone?: (zone: any) => void;
  refreshTrigger?: number;
  focusZoneId?: string | null;
  onFocusZoneConsumed?: () => void;
  onRegisterNavigationHandlers?: (handlers: {
    centerFleet: () => void;
    centerRedZone: () => void;
    centerSafeHaven: () => void;
    getMapCenter: () => { lat: number; lon: number };
  }) => void;
}

export const TerrenoScreen: React.FC<TerrenoScreenProps> = ({
  onAlertTriggered,
  canManageZones = false,
  canManageTravelers = false,
  onOpenCreateZone,
  onOpenCreateTraveler,
  onEditZone,
  refreshTrigger = 0,
  focusZoneId,
  onFocusZoneConsumed,
  onRegisterNavigationHandlers,
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
  // Coordenadas iniciales del centro táctico
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lon: number }>({
    lat: 40.4168,
    lon: -3.7038,
  });
  const [zoom, setZoom] = useState<number>(12.5);
  const [bearing, setBearing] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [selectedTravelerId, setSelectedTravelerId] = useState<string | null>(null);
  const [selectedDrawerTraveler, setSelectedDrawerTraveler] = useState<Traveler | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const hereApiKey = process.env.NEXT_PUBLIC_HERE_API_KEY;
  const isHereConfigured = !!hereApiKey;

  // Sujetos tácticos en el sector (El Rebaño cargado dinámicamente desde /api/travelers)
  const [travelers, setTravelers] = useState<TravelerItem[]>([]);
  const [isLoadingTravelers, setIsLoadingTravelers] = useState<boolean>(true);

  // Cargar viajeros reales desde la API (GET /api/travelers)
  useEffect(() => {
    let isMounted = true;
    const fetchTravelers = async () => {
      try {
        setIsLoadingTravelers(true);
        const res = await fetch('/api/travelers?limit=100');
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        const rawList = data.travelers || data.data || [];
        const mapped: TravelerItem[] = rawList.map((t: any) => ({
          id: String(t.id),
          name: t.full_name,
          callsign: t.callsign || t.full_name,
          status: t.status || 'SAFE',
          lat: typeof t.last_latitude === 'number' ? t.last_latitude : null,
          lon: typeof t.last_longitude === 'number' ? t.last_longitude : null,
          battery: t.battery_level ?? 100,
          lastPing: t.last_ping_at ? 'Conectado' : 'Sin enlace',
          assigned_zone_id: t.assigned_zone_id || null,
          assigned_zone_name: t.assigned_zone?.name || null,
          assigned_zone_color: t.assigned_zone?.color_hex || null,
          assigned_rso_name: t.assigned_zone?.assigned_rso?.full_name || t.assigned_rso?.full_name || null,
          rawTraveler: t,
        }));

        setTravelers(mapped);
      } catch (err) {
        console.error('Error cargando viajeros de la base de datos:', err);
      } finally {
        if (isMounted) setIsLoadingTravelers(false);
      }
    };

    fetchTravelers();

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

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
            center = calculatePolygonCentroid(f.geometry.coordinates[0]);
          }

          const zType = (f.properties?.zone_type || 'THREAT') as 'RESPONSIBILITY' | 'THREAT';
          const sev = (f.properties?.severity || (zType === 'RESPONSIBILITY' ? 'OPERATIONAL' : 'RED')) as ZoneItem['severity'];
          const defaultColor = getSeverityColor(sev, zType, 'css');

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
      // Notificar que el estilo y mapa base están listos (las zonas se cargan exclusivamente desde PostGIS)
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
            'fill-color': buildSeverityMatchExpression(),
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
            'line-color': buildSeverityMatchExpression(),
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
      if (typeof t.lat !== 'number' || typeof t.lon !== 'number') return;

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
            <div class="text-[11px] opacity-75">Zona: <b>${t.assigned_zone_name || 'En Tránsito'}</b></div>
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

        el.addEventListener('click', () => {
          handleSelectTraveler(t);
        });

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
    setSelectedDrawerTraveler(t.rawTraveler || null);
    setIsDrawerOpen(true);
    if (!mapRef.current) return;
    if (typeof t.lat === 'number' && typeof t.lon === 'number') {
      mapRef.current.flyTo({
        center: [t.lon, t.lat],
        zoom: 15,
        pitch: 30,
        duration: 1200,
      });
      markersRef.current[t.id]?.togglePopup();
    } else if (t.assigned_zone_id) {
      const assignedZone = zones.find((z) => z.id === t.assigned_zone_id);
      if (assignedZone?.center) {
        mapRef.current.flyTo({
          center: assignedZone.center,
          zoom: 14,
          duration: 1000,
        });
      }
    }
  };

  const handleSelectZone = (z: ZoneItem) => {
    if (!mapRef.current) return;
    if (z.center) {
      const isMacro = z.name.toLowerCase().includes('teatro') || z.name.toLowerCase().includes('país') || z.name.toLowerCase().includes('operativo');
      mapRef.current.flyTo({
        center: z.center,
        zoom: TACTICAL_ZONE_ZOOM_500M,
        pitch: isMacro ? 0 : 20,
        duration: 1200,
      });
      setSimulationLog(`Enfocando ${z.name} [${z.severity}] a escala táctica (500m)`);
    }
  };

  // Enfocar automáticamente una zona seleccionada desde otra pantalla (ej. Situación Global)
  useEffect(() => {
    if (!focusZoneId || !isMapLoaded || zones.length === 0) return;
    const target = zones.find((z) => z.id === focusZoneId);
    if (target) {
      handleSelectZone(target);
      onFocusZoneConsumed?.();
    }
  }, [focusZoneId, isMapLoaded, zones]);

  const handleCenterFleet = () => {
    if (!mapRef.current) return;
    const withCoords = travelers.filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number');
    if (withCoords.length === 0) {
      setSimulationLog('No hay viajeros con coordenadas activas en el sector.');
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    withCoords.forEach((t) => bounds.extend([t.lon as number, t.lat as number]));
    mapRef.current.fitBounds(bounds, { padding: 90, maxZoom: 16, duration: 1200 });
    setSimulationLog(`Encuadrando el rebaño (${withCoords.length} activos en el sector).`);
  };

  const handleCenterRedZone = () => {
    if (!mapRef.current) return;
    const redZone = zones.find((z) => z.severity === 'RED') || zones.find((z) => z.zone_type === 'THREAT');
    if (redZone && redZone.center) {
      mapRef.current.flyTo({ center: redZone.center, zoom: TACTICAL_ZONE_ZOOM_500M, pitch: 20, duration: 1200 });
      setSimulationLog(`Enfocando sector crítico: ${redZone.name} [${redZone.severity}] a 500m.`);
    } else {
      setSimulationLog('Sin zonas críticas catalogadas en el teatro.');
    }
  };

  const handleCenterSafeHaven = () => {
    if (!mapRef.current) return;
    const safeHaven = zones.find((z) => z.severity === 'SAFE_HAVEN') || zones.find((z) => z.zone_type === 'RESPONSIBILITY');
    if (safeHaven && safeHaven.center) {
      mapRef.current.flyTo({ center: safeHaven.center, zoom: TACTICAL_ZONE_ZOOM_500M, pitch: 0, duration: 1200 });
      setSimulationLog(`Enfocando refugio seguro: ${safeHaven.name} a 500m.`);
    } else {
      setSimulationLog('Sin refugios seguros catalogados en el teatro.');
    }
  };

  // Registrar handlers de navegación táctica hacia RsoConsoleShell / FloatingRsoButton
  const centerCoordsRef = useRef(centerCoords);
  centerCoordsRef.current = centerCoords;

  useEffect(() => {
    onRegisterNavigationHandlers?.({
      centerFleet: handleCenterFleet,
      centerRedZone: handleCenterRedZone,
      centerSafeHaven: handleCenterSafeHaven,
      getMapCenter: () => {
        if (mapRef.current) {
          const c = mapRef.current.getCenter();
          return { lat: c.lat, lon: c.lng };
        }
        return centerCoordsRef.current;
      },
    });
  }, [travelers, zones]);

  const handleSimulateIntrusion = () => {
    const withCoords = travelers.filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number');
    if (withCoords.length === 0) {
      setSimulationLog('Sin activos reales con coordenadas GPS en el sector para simular incursión.');
      return;
    }
    const target = withCoords[0];
    const redZone = zones.find((z) => z.severity === 'RED');
    const targetCenter: [number, number] = redZone?.center ?? [target.lon! + 0.005, target.lat! + 0.005];

    setIsSimulating(true);
    setSimulationLog(`Simulando desplazamiento de ${target.callsign} hacia ${redZone?.name || 'perímetro táctico'}...`);

    setTimeout(() => {
      setTravelers((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? { ...t, lat: targetCenter[1], lon: targetCenter[0], status: 'DANGER', lastPing: 'Ahora mismo' }
            : t
        )
      );
      onAlertTriggered?.(2);
      setSimulationLog(`🚨 GEOPROTECT TRIGGER: ${target.callsign} ha violado el perímetro de ${redZone?.name || 'peligro'}.`);
      setIsSimulating(false);
      mapRef.current?.flyTo({ center: targetCenter, zoom: 15.5, pitch: 35, duration: 1000 });
    }, 1200);
  };

  const handleSimulatePanic = () => {
    const withCoords = travelers.filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number');
    if (withCoords.length === 0) {
      setSimulationLog('Sin activos reales con coordenadas GPS en el sector para simular pánico SOS.');
      return;
    }
    const target = withCoords[0];
    setIsSimulating(true);
    setSimulationLog(`Simulando pulsación de BOTÓN DE PÁNICO por ${target.callsign}...`);

    setTimeout(() => {
      setTravelers((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? { ...t, status: 'PANIC', lastPing: 'Ahora mismo' }
            : t
        )
      );
      onAlertTriggered?.(2);
      setSimulationLog(`🚨 SOS CRÍTICO: ¡Botón de pánico activado por ${target.callsign}! Protocolo RSO activo.`);
      setIsSimulating(false);
      mapRef.current?.flyTo({ center: [target.lon!, target.lat!], zoom: 15.5, pitch: 40, duration: 1000 });
    }, 1000);
  };

  // Reasignación ágil de zona táctica desde la consola / TravelerDrawer
  const handleReassignTravelerZone = async (travelerId: string, newZoneId: string | null) => {
    try {
      const res = await fetch(`/api/travelers/${travelerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_zone_id: newZoneId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al reasignar zona');
      }
      const data = await res.json();
      const updated = data.traveler;

      setTravelers((prev) =>
        prev.map((t) => {
          if (t.id !== travelerId) return t;
          const assignedZone = zones.find((z) => z.id === newZoneId);
          return {
            ...t,
            assigned_zone_id: newZoneId,
            assigned_zone_name: updated?.assigned_zone?.name || assignedZone?.name || null,
            assigned_zone_color: updated?.assigned_zone?.color_hex || assignedZone?.color || null,
            assigned_rso_name: updated?.assigned_zone?.assigned_rso?.full_name || null,
            rawTraveler: updated || {
              ...t.rawTraveler,
              assigned_zone_id: newZoneId,
              assigned_zone: updated?.assigned_zone || null,
            },
          };
        })
      );

      if (selectedDrawerTraveler && selectedDrawerTraveler.id === travelerId) {
        setSelectedDrawerTraveler(updated || {
          ...selectedDrawerTraveler,
          assigned_zone_id: newZoneId,
          assigned_zone: updated?.assigned_zone || null,
        });
      }

      const targetZoneName = updated?.assigned_zone?.name || 'En Tránsito / Sin Zona';
      setToastMessage(`Viajero reasignado a sector: ${targetZoneName}`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      console.error('Error al reasignar zona:', err);
      alert(err.message || 'Fallo al reasignar zona');
    }
  };

  const gpsReadyTravelersCount = travelers.filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number').length;

  return (
    <div className="terreno flex h-full min-h-0 overflow-hidden relative">
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
              disabled={isSimulating || gpsReadyTravelersCount === 0}
              title={gpsReadyTravelersCount === 0 ? 'Sin activos reales con coordenadas en el sector para simular' : 'Simular incursión en zona hostil'}
              className="btn btn-secondary text-xs flex items-center justify-center gap-1 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AlertTriangle className="w-3 h-3 text-[var(--risk-high)]" />
              <span>Incursión</span>
            </button>
            <button
              type="button"
              onClick={handleSimulatePanic}
              disabled={isSimulating || gpsReadyTravelersCount === 0}
              title={gpsReadyTravelersCount === 0 ? 'Sin activos reales con coordenadas en el sector para simular' : 'Simular pánico de emergencia'}
              className="btn btn-secondary text-xs flex items-center justify-center gap-1 py-1.5 border-[var(--risk-crit)] text-[var(--risk-crit)] disabled:opacity-40 disabled:cursor-not-allowed"
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
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono opacity-50">TELEMETRÍA</span>
              {canManageTravelers && onOpenCreateTraveler && (
                <button
                  type="button"
                  onClick={onOpenCreateTraveler}
                  className="text-[10px] font-heading font-semibold uppercase px-2 py-0.5 border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] transition-colors cursor-pointer"
                  title="Dar de alta nuevo convoy o viajero"
                >
                  + ALTA
                </button>
              )}
            </div>
          </div>
          {isLoadingTravelers ? (
            <div className="py-3 text-center text-xs font-mono opacity-50">Cargando el rebaño desde PostGIS...</div>
          ) : travelers.length === 0 ? (
            <div className="py-3 text-center text-xs opacity-60">
              <span>No hay viajeros registrados en el sector.</span>
              {canManageTravelers && onOpenCreateTraveler && (
                <button
                  type="button"
                  onClick={onOpenCreateTraveler}
                  className="block mx-auto mt-1.5 text-xs font-heading font-semibold uppercase text-[var(--color-accent)] hover:underline cursor-pointer"
                >
                  + Añadir al rebaño
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[color-mix(in_srgb,var(--color-text)_8%,transparent)] max-h-56 overflow-y-auto">
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-xs font-semibold">{t.callsign}</strong>
                        {t.assigned_zone_name ? (
                          <span
                            className="text-[9px] font-mono px-1 py-0.2 border uppercase truncate max-w-[100px]"
                            style={{
                              borderColor: t.assigned_zone_color || 'var(--color-divider)',
                              color: t.assigned_zone_color || 'var(--color-accent)',
                            }}
                          >
                            {t.assigned_zone_name}
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono px-1 py-0.2 bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-divider)] uppercase">
                            TRÁNSITO
                          </span>
                        )}
                      </div>
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
                      <span className="font-mono text-[9px] opacity-50 block mt-0.5">
                        {typeof t.lat === 'number' ? `${t.battery}%` : 'SIN GPS'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                            const realFeature = zonesGeoJson?.features?.find(
                              (f: any) => String(f.id || f.properties?.id) === z.id
                            );
                            onEditZone(
                              realFeature ?? {
                                id: z.id,
                                geometry: null,
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
                              }
                            );
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

        {/* HUD Táctico Inferior (Telemetría e Instrumentación WGS84 limpia) */}
        <TacticalHud
          cursorCoords={cursorCoords}
          centerCoords={centerCoords}
          zoom={zoom}
          bearing={bearing}
          pitch={pitch}
          isHereActive={isHereConfigured}
        />
      </main>

      {/* Drawer Táctico del Viajero con Reasignación Ágil de Zona */}
      <TravelerDrawer
        traveler={selectedDrawerTraveler}
        isOpen={isDrawerOpen && selectedDrawerTraveler !== null}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedDrawerTraveler(null);
        }}
        availableZones={zones.map((z) => ({
          id: z.id,
          name: z.name,
          severity: z.severity,
          color_hex: z.color,
          assigned_rso_id: z.assigned_rso_id,
        }))}
        onReassignZone={handleReassignTravelerZone}
        canManageTravelers={canManageTravelers}
        onViewOnMap={(t) => {
          if (typeof t.last_longitude === 'number' && typeof t.last_latitude === 'number' && mapRef.current) {
            mapRef.current.flyTo({
              center: [t.last_longitude, t.last_latitude],
              zoom: 16,
              duration: 1000,
            });
          }
        }}
      />

      {/* Toast Feedback Táctico */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[1200] bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-accent)] px-4 py-2.5 shadow-2xl flex items-center gap-2 text-xs font-mono animate-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-[var(--risk-stable)] flex-none" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
