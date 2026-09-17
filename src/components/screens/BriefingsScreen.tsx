'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Shield,
  HeartPulse,
  Building2,
  Flag,
  Crosshair,
  AlertTriangle,
  Search,
  RefreshCw,
  Compass,
  MapPin,
  Clock,
  User,
  ShieldAlert,
} from 'lucide-react';

export interface BriefingPoi {
  id: string;
  name: string;
  category: 'EXTRACTION_POINT' | 'HOSPITAL' | 'POLICE' | 'SAFE_HOUSE' | 'CHECKPOINT' | 'DANGER_POINT';
  latitude: number;
  longitude: number;
  notes?: string | null;
}

export interface BriefingItem {
  id: string;
  title: string;
  welcome_message: string;
  protocol_instructions: string;
  created_at: string;
  updated_at?: string;
  author?: {
    id: string;
    full_name: string;
    role: string;
    phone?: string;
  };
  pois: BriefingPoi[];
}

// Datos de muestra explícitos para evaluación técnica en caso de entorno desacoplado
const SAMPLE_BRIEFINGS: BriefingItem[] = [
  {
    id: 'br-eval-01',
    title: 'Protocolo de Seguridad y Tránsito — Sector Metropolitano Centro',
    welcome_message: 'Bienvenido al sector operativo. Mantenga telemetría activa en todo momento y no se desvíe de las arterias autorizadas sin previo aviso al centro de control.',
    protocol_instructions: '1. Verificación obligatoria de radio cada 60 minutos.\n2. En caso de corte de comunicaciones o hostilidad, proceda de inmediato al Safe Haven Embajada.\n3. Queda prohibido el acceso a la Zona de Conflicto Táctico Norte tras las 20:00 UTC.',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    author: {
      id: 'usr-rso-01',
      full_name: 'Comandancia RSO',
      role: 'RSO',
      phone: '+34 910 000 001',
    },
    pois: [
      {
        id: 'poi-01',
        name: 'Embajada y Punto de Reunión Alfa',
        category: 'SAFE_HOUSE',
        latitude: 40.4040,
        longitude: -3.7040,
        notes: 'Seguridad perimetral 24/7 y enlace satelital BGAN de alta disponibilidad.',
      },
      {
        id: 'poi-02',
        name: 'Hospital de Emergencias Clínicas',
        category: 'HOSPITAL',
        latitude: 40.4120,
        longitude: -3.6990,
        notes: 'Unidad de trauma y soporte vital avanzado acordada con protocolo diplomático.',
      },
      {
        id: 'poi-03',
        name: 'Punto de Evacuación Primario — Helipad Aeroclub',
        category: 'EXTRACTION_POINT',
        latitude: 40.3950,
        longitude: -3.7150,
        notes: 'Coordinado con control aéreo. Solo utilizable con autorización explícita de mando.',
      },
      {
        id: 'poi-04',
        name: 'Puesto de Control y Retén Policial',
        category: 'CHECKPOINT',
        latitude: 40.4200,
        longitude: -3.7010,
        notes: 'Identificación obligatoria mediante salvoconducto GZN oficial.',
      },
      {
        id: 'poi-05',
        name: 'Sector de Inestabilidad y Bloqueo',
        category: 'DANGER_POINT',
        latitude: 40.4300,
        longitude: -3.7050,
        notes: 'Zona no autorizada para personal no protegido.',
      },
    ],
  },
  {
    id: 'br-eval-02',
    title: 'Directiva Táctica — Corredor Logístico y Abastecimiento',
    welcome_message: 'Instrucciones para convoyes de aprovisionamiento y transporte de material de asistencia.',
    protocol_instructions: 'Ruta obligatoria por arterias principales. Mantener velocidad constante de convoy (40-50 km/h). Prohibidas las paradas no programadas en vía pública.',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    author: {
      id: 'usr-rso-02',
      full_name: 'Oficial de Logística Táctica',
      role: 'OPERATOR',
      phone: '+34 910 000 002',
    },
    pois: [
      {
        id: 'poi-06',
        name: 'Comisaría Central de Distrito',
        category: 'POLICE',
        latitude: 40.4180,
        longitude: -3.7090,
        notes: 'Enlace directo con fuerzas locales de intervención rápida.',
      },
      {
        id: 'poi-07',
        name: 'Refugio de Contingencia Secundario',
        category: 'SAFE_HOUSE',
        latitude: 40.4080,
        longitude: -3.6890,
        notes: 'Depósito de víveres y botiquín de soporte táctico para 72 horas.',
      },
    ],
  },
];

const POI_CATEGORY_META: Record<BriefingPoi['category'], { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  SAFE_HOUSE: { label: 'Refugio Seguro', icon: Shield, color: 'var(--risk-stable)' },
  HOSPITAL: { label: 'Centro Médico', icon: HeartPulse, color: 'var(--risk-high)' },
  EXTRACTION_POINT: { label: 'Punto de Extracción', icon: Flag, color: 'var(--color-accent)' },
  POLICE: { label: 'Fuerzas de Seguridad', icon: Building2, color: 'var(--color-accent-2)' },
  CHECKPOINT: { label: 'Control de Paso', icon: Crosshair, color: 'var(--risk-watch)' },
  DANGER_POINT: { label: 'Punto Hostil', icon: AlertTriangle, color: 'var(--risk-crit)' },
};

export const BriefingsScreen: React.FC = () => {
  const [briefings, setBriefings] = useState<BriefingItem[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<BriefingItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchBriefingsFromApi = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/briefings');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.briefings || [];
      setBriefings(list);
      setIsDemoMode(false);
      if (list.length > 0) {
        setSelectedBriefing(list[0]);
      } else {
        setSelectedBriefing(null);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Error al conectar con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefingsFromApi();
  }, []);

  const handleLoadDemoSample = () => {
    setBriefings(SAMPLE_BRIEFINGS);
    setSelectedBriefing(SAMPLE_BRIEFINGS[0]);
    setIsDemoMode(true);
    setFetchError(null);
  };

  const filteredBriefings = briefings.filter((b) =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="briefings-screen flex flex-col h-full min-h-0 bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden font-body">
      {/* Banner de Simulación / Modo Demo cuando aplique */}
      {isDemoMode && (
        <div className="bg-[color-mix(in_srgb,var(--risk-watch)_15%,transparent)] border-b border-[var(--risk-watch)] px-4 py-1.5 flex items-center justify-between text-xs font-mono text-[var(--risk-watch)]">
          <div className="flex items-center gap-2 font-semibold">
            <span className="w-2 h-2 rounded-full bg-[var(--risk-watch)] animate-pulse" />
            <span>VISTA DE BRIEFINGS: DATOS DE MUESTRA (SIMULACIÓN OPSEC / EVALUACIÓN)</span>
          </div>
          <button
            type="button"
            onClick={fetchBriefingsFromApi}
            className="hover:underline text-[11px] uppercase tracking-wider"
          >
            Reconectar con API real
          </button>
        </div>
      )}

      {/* Banner de Error Real si la API falla */}
      {fetchError && (
        <div className="bg-[color-mix(in_srgb,var(--risk-crit)_12%,transparent)] border-b border-[var(--risk-crit)] px-4 py-2 flex items-center justify-between text-xs text-[var(--color-text)]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--risk-crit)] flex-none" />
            <span>
              <b>Error de conexión con Paquete B5:</b> {fetchError} (Se requiere sesión RSO autenticada).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchBriefingsFromApi}
              className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reintentar</span>
            </button>
            <button
              type="button"
              onClick={handleLoadDemoSample}
              className="btn btn-primary text-xs py-1 px-2.5"
            >
              Cargar Muestra Local [DEMO]
            </button>
          </div>
        </div>
      )}

      {/* Cabecera Técnica de Pantalla */}
      <div className="border-b border-[var(--color-divider)] px-6 py-3 flex flex-wrap items-center justify-between gap-4 bg-[var(--color-surface)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="kicker">MÓDULO B5 / GESTIÓN DE MISIÓN</span>
            {isDemoMode && (
              <span className="tag text-[9px] border-[var(--risk-watch)] text-[var(--risk-watch)]">
                MUESTRA
              </span>
            )}
          </div>
          <h1 className="font-heading font-bold text-lg tracking-wide uppercase">
            Sala de Briefings Tácticos y POIs
          </h1>
        </div>

        {/* KPIs de la Sala */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="border-l border-[var(--color-divider)] pl-3">
            <div className="text-[9px] opacity-60 font-heading uppercase">Briefings Activos</div>
            <div className="font-bold text-sm text-[var(--color-accent)]">{briefings.length}</div>
          </div>
          <div className="border-l border-[var(--color-divider)] pl-3">
            <div className="text-[9px] opacity-60 font-heading uppercase">POIs Registrados</div>
            <div className="font-bold text-sm text-[var(--risk-stable)]">
              {briefings.reduce((acc, b) => acc + (b.pois?.length || 0), 0)}
            </div>
          </div>
          <div className="border-l border-[var(--color-divider)] pl-3">
            <div className="text-[9px] opacity-60 font-heading uppercase">Soporte Offline</div>
            <div className="font-bold text-sm text-[var(--color-text)]">RAMA HARDWARE B5</div>
          </div>
        </div>
      </div>

      {/* Cuerpo en dos columnas (Lista y Detalle Blueprint) */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Columna Izquierda: Listado y Búsqueda */}
        <div className="w-full md:w-80 lg:w-96 border-r border-[var(--color-divider)] flex flex-col min-h-0 bg-[var(--color-bg)]">
          {/* Campo de búsqueda */}
          <div className="p-3 border-b border-[var(--color-divider)]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar briefings por título..."
                className="input pl-8 text-xs"
              />
            </div>
          </div>

          {/* Lista de briefings */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--color-divider)]">
            {isLoading && (
              <div className="p-6 text-center text-xs opacity-60 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[var(--color-accent)]" />
                <span>Consultando briefings en base de datos...</span>
              </div>
            )}

            {!isLoading && filteredBriefings.length === 0 && !fetchError && (
              <div className="p-6 text-center text-xs opacity-60">
                No se encontraron briefings que coincidan con la búsqueda.
              </div>
            )}

            {filteredBriefings.map((b) => {
              const isSelected = selectedBriefing?.id === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedBriefing(b)}
                  className={`p-3 cursor-pointer transition-colors border-l-2 ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
                      : 'border-transparent hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono opacity-60 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(b.created_at).toLocaleDateString()}
                    </span>
                    <span className="tag text-[9px]">
                      {b.pois?.length || 0} POIs
                    </span>
                  </div>
                  <h3 className="text-xs font-semibold font-heading uppercase tracking-wide line-clamp-2">
                    {b.title}
                  </h3>
                  {b.author && (
                    <div className="text-[10px] opacity-60 mt-1 flex items-center gap-1">
                      <User className="w-2.5 h-2.5" />
                      <span>{b.author.full_name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Columna Derecha: Ficha Técnica Blueprint */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 bg-[var(--color-bg)]">
          {selectedBriefing ? (
            <div className="blueprint plate p-6 max-w-4xl bg-[var(--color-surface)] border border-[var(--color-divider)] shadow-[var(--shadow-md)]">
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />

              {/* Título y metadatos */}
              <div className="border-b border-[var(--color-divider)] pb-4 mb-5">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="tag border-[var(--color-accent)] text-[var(--color-accent)] text-[10px]">
                      DIRECTIVA RSO
                    </span>
                    <span className="text-[10px] font-mono opacity-50">ID: {selectedBriefing.id}</span>
                  </div>
                  <div className="text-[10px] font-mono opacity-70">
                    Emitido: {new Date(selectedBriefing.created_at).toLocaleString()}
                  </div>
                </div>
                <h2 className="font-heading font-bold text-xl uppercase tracking-wide text-[var(--color-text)]">
                  {selectedBriefing.title}
                </h2>
                {selectedBriefing.author && (
                  <div className="text-xs opacity-75 mt-1 flex items-center gap-2">
                    <span>Autor: <b>{selectedBriefing.author.full_name}</b> ({selectedBriefing.author.role})</span>
                    {selectedBriefing.author.phone && (
                      <span className="font-mono text-[11px] opacity-75">· Tel: {selectedBriefing.author.phone}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Mensaje de Bienvenida */}
              {selectedBriefing.welcome_message && (
                <div className="mb-5 p-3 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs leading-relaxed">
                  <span className="kicker block mb-1">Mensaje de Bienvenida / Directriz</span>
                  <p className="opacity-90">{selectedBriefing.welcome_message}</p>
                </div>
              )}

              {/* Instrucciones de Protocolo */}
              {selectedBriefing.protocol_instructions && (
                <div className="mb-6 p-3.5 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs leading-relaxed">
                  <span className="kicker block mb-1.5 flex items-center gap-1.5 text-[var(--color-accent)]">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Protocolo de Actuación y Seguridad</span>
                  </span>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] opacity-90">
                    {selectedBriefing.protocol_instructions}
                  </pre>
                </div>
              )}

              {/* Puntos de Interés (POIs) Compartidos */}
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-[var(--color-divider)] pb-2">
                  <span className="kicker flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    <span>Puntos de Interés Tácticos ({selectedBriefing.pois?.length || 0})</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-50">COORDENADAS WGS84</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedBriefing.pois && selectedBriefing.pois.length > 0 ? (
                    selectedBriefing.pois.map((poi) => {
                      const meta = POI_CATEGORY_META[poi.category] || {
                        label: poi.category,
                        icon: MapPin,
                        color: 'var(--color-text)',
                      };
                      const Icon = meta.icon;

                      return (
                        <div
                          key={poi.id}
                          className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-divider)] flex flex-col justify-between gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center border"
                                style={{
                                  borderColor: meta.color,
                                  color: meta.color,
                                  backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                                }}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-semibold text-xs leading-snug">{poi.name}</span>
                            </div>
                            <span
                              className="tag text-[9px] flex-none"
                              style={{ borderColor: meta.color, color: meta.color }}
                            >
                              {meta.label}
                            </span>
                          </div>

                          {poi.notes && (
                            <p className="text-[11px] opacity-75 font-body leading-tight">
                              {poi.notes}
                            </p>
                          )}

                          <div className="text-[10px] font-mono opacity-60 border-t border-[var(--color-divider)] pt-1.5 flex items-center justify-between">
                            <span>{poi.latitude.toFixed(4)}°, {poi.longitude.toFixed(4)}°</span>
                            <span className="opacity-50">B5 POI</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 p-4 text-center text-xs opacity-60 border border-dashed border-[var(--color-divider)]">
                      Este briefing no cuenta con POIs adicionales asignados.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs opacity-50">
              Seleccione un briefing de la columna izquierda para visualizar su ficha.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
