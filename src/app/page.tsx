'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Shield, AlertTriangle, Radio, Navigation, Users, MapPin, Battery, CheckCircle, Bell, RefreshCw } from 'lucide-react';
import maplibregl from 'maplibre-gl';

interface ZoneItem {
  id: string;
  name: string;
  severity: 'RED' | 'AMBER' | 'SAFE_HAVEN';
  color: string;
  description?: string;
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

export default function RsoDashboard() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});

  const [activeAlertsCount, setActiveAlertsCount] = useState(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  // Datos tácticos iniciales para visualización
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
    }
  ]);

  const zones: ZoneItem[] = [
    { id: 'z-01', name: 'Distrito Norte - Zona de Conflicto', severity: 'RED', color: '#EF4444', description: 'Combates activos reportados' },
    { id: 'z-02', name: 'Corredor Sur - Toque de Queda', severity: 'AMBER', color: '#F59E0B', description: 'Restricción de tránsito 20:00 - 06:00' },
    { id: 'z-03', name: 'Embajada y Base Segura', severity: 'SAFE_HAVEN', color: '#10B981', description: 'Punto de reunión y extracción' },
  ];

  // Inicializar MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE || 'https://demotiles.maplibre.org/style.json',
      center: [-3.7038, 40.4168],
      zoom: 12.5,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // 1. Capa de Zona Roja (Polígono de prueba en Madrid Centro/Norte)
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
          properties: { name: 'Zona Roja - Conflicto' },
        },
      });

      map.addLayer({
        id: 'red-zone-fill',
        type: 'fill',
        source: 'red-zone',
        paint: {
          'fill-color': '#EF4444',
          'fill-opacity': 0.25,
        },
      });

      map.addLayer({
        id: 'red-zone-line',
        type: 'line',
        source: 'red-zone',
        paint: {
          'line-color': '#EF4444',
          'line-width': 2,
        },
      });

      // 2. Capa de Safe Haven (Embajada / Refugio)
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
          properties: { name: 'Safe Haven - Embajada' },
        },
      });

      map.addLayer({
        id: 'safe-haven-fill',
        type: 'fill',
        source: 'safe-haven',
        paint: {
          'fill-color': '#10B981',
          'fill-opacity': 0.25,
        },
      });

      map.addLayer({
        id: 'safe-haven-line',
        type: 'line',
        source: 'safe-haven',
        paint: {
          'line-color': '#10B981',
          'line-width': 2,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar marcadores de viajeros en el mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    travelers.forEach((t) => {
      if (markersRef.current[t.id]) {
        markersRef.current[t.id].setLngLat([t.lon, t.lat]);
      } else {
        const el = document.createElement('div');
        el.className = 'w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-lg cursor-pointer';
        el.style.backgroundColor =
          t.status === 'PANIC' ? '#EF4444' : t.status === 'DANGER' ? '#EF4444' : t.status === 'WARNING' ? '#F59E0B' : '#10B981';

        if (t.status === 'PANIC' || t.status === 'DANGER') {
          el.classList.add('panic-pulse');
        }

        el.innerText = t.callsign.charAt(0);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([t.lon, t.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(`
              <div class="p-2 text-slate-900">
                <div class="font-bold">${t.name}</div>
                <div class="text-xs text-slate-500">${t.callsign} · Estado: ${t.status}</div>
                <div class="text-xs text-slate-500">Batería: ${t.battery}%</div>
              </div>
            `)
          )
          .addTo(map);

        markersRef.current[t.id] = marker;
      }
    });
  }, [travelers]);

  // Simulación: Incursión de viajero en Zona Roja (Test Geofencing)
  const handleSimulateIntrusion = () => {
    setIsSimulating(true);
    setSimulationLog('Simulando desplazamiento de CONVOY-ALFA hacia el interior de la Zona Roja (40.4280, -3.7050)...');

    setTimeout(() => {
      setTravelers((prev) =>
        prev.map((t) =>
          t.id === 't-01'
            ? { ...t, lat: 40.4280, lon: -3.7050, status: 'DANGER', lastPing: 'Ahora mismo' }
            : t
        )
      );
      setActiveAlertsCount((c) => c + 1);
      setSimulationLog('🚨 GEOPROTECT TRIGGER: CONVOY-ALFA ha violado el perímetro de ZONA ROJA. Alerta crítica emitida al RSO y push enviada.');
      setIsSimulating(false);
    }, 1200);
  };

  // Simulación: Activación de Botón de Pánico
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
      setActiveAlertsCount((c) => c + 1);
      setSimulationLog('🚨 SOS CRÍTICO: ¡Botón de pánico activado por VIP-BRAVO! Protocolo de rescate en curso.');
      setIsSimulating(false);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Top Tactical Navigation Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold tracking-wide flex items-center gap-2 text-base">
              GZN <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">RSO CONSOLE</span>
            </div>
            <div className="text-[11px] text-slate-400">Green Zone Network · Secure Route v1.0</div>
          </div>
        </div>

        {/* Tactical Status Badges */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-300 font-mono">PostGIS + RLS: ACTIVO</span>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span className="text-slate-300 font-mono">FCM Push: LISTO</span>
          </div>

          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-lg text-red-400 text-xs font-semibold">
            <Bell className="w-4 h-4" />
            <span>{activeAlertsCount} Alertas Abiertas</span>
          </div>
        </div>
      </header>

      {/* Main Tactical Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Rebaño & Zonas */}
        <aside className="w-96 border-r border-slate-800 bg-slate-900/40 flex flex-col z-10 overflow-y-auto">
          {/* Action Simulation Panel */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/80">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
              <span>Simulador de Misión Crítica</span>
              {isSimulating && <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSimulateIntrusion}
                disabled={isSimulating}
                className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-medium text-amber-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Test Incursión</span>
              </button>
              <button
                onClick={handleSimulatePanic}
                disabled={isSimulating}
                className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-xs font-medium text-red-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Test Pánico SOS</span>
              </button>
            </div>

            {simulationLog && (
              <div className="mt-3 p-2.5 bg-slate-950/80 border border-slate-800 rounded text-[11px] font-mono text-slate-300">
                {simulationLog}
              </div>
            )}
          </div>

          {/* El Rebaño (Travelers List) */}
          <div className="p-4 border-b border-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                El Rebaño ({travelers.length})
              </span>
              <span className="text-[10px] text-slate-500">Telemetría en Vivo</span>
            </div>

            <div className="space-y-2">
              {travelers.map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 rounded-xl transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-sm text-slate-200">{t.name}</div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.status === 'PANIC'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40 panic-pulse'
                          : t.status === 'DANGER'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : t.status === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>{t.callsign}</span>
                    <span className="flex items-center gap-1">
                      <Battery className="w-3.5 h-3.5" /> {t.battery}%
                    </span>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
                    <span>{t.lastPing}</span>
                    <span>{t.lat.toFixed(4)}, {t.lon.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Catálogo de Zonas */}
          <div className="p-4 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-400" />
              Zonas y Refugios Activos ({zones.length})
            </div>

            <div className="space-y-2">
              {zones.map((z) => (
                <div key={z.id} className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
                    <span className="font-semibold text-slate-200 truncate">{z.name}</span>
                  </div>
                  {z.description && <div className="text-slate-400 text-[11px] pl-4.5">{z.description}</div>}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Tactical Map Container */}
        <main className="flex-1 relative">
          <div ref={mapContainer} className="w-full h-full" />

          {/* Tactical Overlay Badge */}
          <div className="absolute top-4 left-4 bg-slate-900/90 border border-slate-800 backdrop-blur-md p-3 rounded-xl shadow-xl z-10 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200">Sector Operativo Madrid Norte</div>
              <div className="text-[11px] text-slate-400 font-mono">Geofencing: 3 zonas cargadas · Coordenadas WGS84</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
