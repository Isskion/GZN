'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Users, RefreshCw, Filter, Search, Battery, MapPin, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { Traveler, TravelerStatus } from '@/types/database';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';
import { TravelerDrawer } from '@/components/industry/TravelerDrawer';

type FilterType = 'ALL' | 'CRIT' | 'WARNING' | 'SAFE' | 'LOW_BATTERY';

export const PersonasScreen: React.FC = () => {
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoData, setIsDemoData] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerToast, setDrawerToast] = useState<string | null>(null);

  // Cargar viajeros desde GET /api/travelers (Backend real Paquete B3)
  const fetchTravelers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/travelers?limit=100');
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('401 No Autorizado: Se requiere sesión de usuario activa para sincronizar /api/travelers.');
        }
        throw new Error(`Error ${res.status}: Fallo al sincronizar el rebaño con el servidor.`);
      }
      const data = await res.json();
      setTravelers(data.data || []);
      setIsDemoData(false);
    } catch (err: any) {
      console.error('Error fetching travelers:', err);
      setError(
        err.message ||
          'No se pudo sincronizar con /api/travelers — sesión no autenticada o error de backend.'
      );
      // NUNCA sustituir silenciosamente por datos inventados ante fallo (mandato Claude)
      setTravelers([]);
      setIsDemoData(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Carga explícita de datos de muestra para desarrollo / demo local
  const loadDemoData = () => {
    setIsDemoData(true);
    setError(null);
    setTravelers([
      {
        id: 'b3-demo-01',
        organization_id: 'org-demo',
        callsign: 'CONVOY-ALFA',
        full_name: 'Carlos Mendoza',
        phone: '+34 600 112 001',
        status: 'SAFE',
        battery_level: 84,
        last_latitude: 40.4168,
        last_longitude: -3.7038,
        last_ping_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'b3-demo-02',
        organization_id: 'org-demo',
        callsign: 'VIP-BRAVO',
        full_name: 'Sofía Valdés',
        phone: '+34 600 112 002',
        status: 'WARNING',
        battery_level: 42,
        last_latitude: 40.4220,
        last_longitude: -3.6920,
        last_ping_at: new Date(Date.now() - 60000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'b3-demo-03',
        organization_id: 'org-demo',
        callsign: 'LOG-CHARLIE',
        full_name: 'Javier Castillo',
        phone: '+34 600 112 003',
        status: 'SAFE',
        battery_level: 95,
        last_latitude: 40.4050,
        last_longitude: -3.6880,
        last_ping_at: new Date(Date.now() - 10000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'b3-demo-04',
        organization_id: 'org-demo',
        callsign: 'MED-DELTA',
        full_name: 'Elena Ramos',
        phone: '+34 600 112 004',
        status: 'INCOMMUNICADO',
        battery_level: 14,
        last_latitude: 40.4350,
        last_longitude: -3.7120,
        last_ping_at: new Date(Date.now() - 3600000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  };

  useEffect(() => {
    fetchTravelers();
  }, []);

  const handleRowClick = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setIsDrawerOpen(true);
  };

  const handleRequestCheckIn = (t: Traveler) => {
    setDrawerToast(`[SIMULACIÓN] Solicitud de check-in enviada a ${t.callsign || t.full_name} — sin conexión a backend todavía`);
    setTimeout(() => setDrawerToast(null), 3500);
  };

  const handleViewOnMap = (t: Traveler) => {
    setDrawerToast(`[SIMULACIÓN] Localizando en mapa a ${t.callsign || t.full_name} — sin conexión a backend todavía`);
    setTimeout(() => setDrawerToast(null), 3500);
  };

  const handleSendAlert = (t: Traveler) => {
    setDrawerToast(`[SIMULACIÓN] Alerta táctica de emergencia emitida hacia ${t.callsign || t.full_name} — sin conexión a backend todavía`);
    setTimeout(() => setDrawerToast(null), 3500);
  };

  // Filtrado reactivo en cliente
  const filteredTravelers = useMemo(() => {
    return travelers.filter((t) => {
      const matchesSearch =
        t.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.callsign && t.callsign.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (activeFilter === 'ALL') return true;
      if (activeFilter === 'CRIT') return t.status === 'PANIC' || t.status === 'DANGER';
      if (activeFilter === 'WARNING') return t.status === 'WARNING';
      if (activeFilter === 'SAFE') return t.status === 'SAFE';
      if (activeFilter === 'LOW_BATTERY') return (t.battery_level ?? 100) < 20;

      return true;
    });
  }, [travelers, activeFilter, searchQuery]);

  const getStatusBadge = (status: TravelerStatus) => {
    switch (status) {
      case 'PANIC':
        return <span className="tag tag-crit">PÁNICO</span>;
      case 'DANGER':
        return <span className="tag tag-crit">PELIGRO</span>;
      case 'WARNING':
        return <span className="tag tag-high">PRECAUCIÓN</span>;
      case 'SAFE':
        return <span className="tag tag-stable">SEGURO</span>;
      case 'INCOMMUNICADO':
        return <span className="tag tag-neutral">INCOMUNICADO</span>;
      default:
        return <span className="tag tag-neutral">{status}</span>;
    }
  };

  return (
    <div className="personas flex flex-col h-full min-h-0 bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden relative">
      {/* Notificación Toast de Acciones */}
      {drawerToast && (
        <div className="fixed bottom-6 right-6 z-[950] bg-[var(--color-text)] text-[var(--color-bg)] px-4 py-2.5 rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] flex items-center gap-2 text-xs font-mono">
          <CheckCircle className="w-4 h-4 text-[var(--risk-stable)] flex-none" />
          <span>{drawerToast}</span>
        </div>
      )}

      {/* Banner de Error Visible (Mandato Claude 1) */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-[color-mix(in_srgb,var(--risk-crit)_12%,transparent)] border border-[var(--risk-crit)] text-[var(--color-text)] rounded-[var(--radius-sm)] flex items-center justify-between gap-3 text-xs flex-wrap flex-none">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--risk-crit)] flex-none" />
            <div>
              <span className="font-heading font-semibold text-[var(--risk-crit)] uppercase tracking-wider">
                Error de Sincronización:{' '}
              </span>
              <span className="opacity-90">{error}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTravelers}
              className="btn btn-secondary text-[11px] py-1 px-2.5"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reintentar</span>
            </button>
            <button
              type="button"
              onClick={loadDemoData}
              className="btn btn-secondary text-[11px] py-1 px-2.5 border-[var(--risk-high)] text-[var(--risk-high)]"
            >
              <span>Cargar Muestra Local [DEMO]</span>
            </button>
          </div>
        </div>
      )}

      {/* Banner de Datos de Muestra cuando se activan explícitamente */}
      {isDemoData && (
        <div className="mx-4 mt-3 p-2.5 bg-[color-mix(in_srgb,var(--risk-high)_12%,transparent)] border border-[var(--risk-high)] text-[var(--color-text)] rounded-[var(--radius-sm)] flex items-center justify-between gap-3 text-xs flex-none">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--risk-high)] flex-none" />
            <span className="font-mono text-[11px]">
              MODO DEMOSTRACIÓN ACTIVO: Mostrando registros de muestra simulados. Telemetría no vinculada a sesión de producción.
            </span>
          </div>
          <button
            type="button"
            onClick={fetchTravelers}
            className="btn btn-secondary text-[10px] py-0.5 px-2 font-mono"
          >
            Volver a Backend Real
          </button>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="filters flex items-center justify-between gap-4 p-3 border-b border-[var(--color-divider)] flex-wrap bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)] flex-none">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="kicker mr-2">Filtrar:</span>
          {(
            [
              { id: 'ALL', label: 'Todos' },
              { id: 'CRIT', label: 'Crítico / Peligro' },
              { id: 'WARNING', label: 'Precaución' },
              { id: 'SAFE', label: 'Seguros' },
              { id: 'LOW_BATTERY', label: 'Batería < 20%' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`font-heading font-semibold text-xs tracking-wider uppercase px-3 py-1 border transition-colors ${
                activeFilter === filter.id
                  ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)]'
                  : 'border-[var(--color-divider)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar indicativo o nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-8 py-1 text-xs w-56"
            />
          </div>

          <button
            type="button"
            onClick={fetchTravelers}
            disabled={isLoading}
            className="btn btn-secondary text-xs flex items-center gap-1.5 py-1"
            title="Sincronizar telemetría de viajeros"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Tabla de Personas con Estética Blueprint */}
      <div className="tablewrap flex-1 overflow-auto p-4">
        <BlueprintPlate
          kicker="Cartera de Personal"
          title={`El Rebaño (${filteredTravelers.length} registros)`}
          headerRight={
            isDemoData ? (
              <span className="tag tag-high text-[10px] font-mono">
                [DATOS DE DEMOSTRACIÓN — MOCK LOCAL]
              </span>
            ) : undefined
          }
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-divider)] text-[10px] uppercase font-heading tracking-widest text-muted bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)]">
                <th className="p-3">Indicativo</th>
                <th className="p-3">Nombre Completo</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Destino / Zona</th>
                <th className="p-3">Coordenadas (WGS84)</th>
                <th className="p-3">Batería</th>
                <th className="p-3">Último Ping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color-mix(in_srgb,var(--color-divider)_60%,transparent)]">
              {filteredTravelers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted font-mono">
                    {isLoading
                      ? 'Sincronizando registros con GET /api/travelers...'
                      : error
                      ? 'No hay registros cargados debido a un error de sincronización de sesión.'
                      : 'No se encontraron viajeros que coincidan con los criterios.'}
                  </td>
                </tr>
              ) : (
                filteredTravelers.map((t) => {
                  const battery = t.battery_level ?? 0;
                  const batteryColor =
                    battery <= 20
                      ? 'var(--risk-crit)'
                      : battery <= 40
                      ? 'var(--risk-high)'
                      : 'var(--risk-stable)';

                  return (
                    <tr
                      key={t.id}
                      onClick={() => handleRowClick(t)}
                      className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors group"
                    >
                      <td className="p-3 font-mono font-semibold text-[var(--color-accent)] group-hover:underline">
                        {t.callsign || 'N/A'}
                      </td>
                      <td className="p-3 font-medium">{t.full_name}</td>
                      <td className="p-3">{getStatusBadge(t.status)}</td>
                      {/* Mandato Claude: Destino/Zona se marca como N/D para no falsear datos */}
                      <td className="p-3 text-muted font-mono text-[11px]">N/D</td>
                      <td className="p-3 font-mono text-[11px]">
                        {t.last_latitude && t.last_longitude
                          ? `${t.last_latitude.toFixed(4)}, ${t.last_longitude.toFixed(4)}`
                          : 'N/D'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-[var(--color-divider)] h-1.5 rounded-full overflow-hidden flex-none">
                            <div
                              className="h-full"
                              style={{
                                width: `${Math.min(100, Math.max(0, battery))}%`,
                                backgroundColor: batteryColor,
                              }}
                            />
                          </div>
                          <span className="font-mono text-[11px]">{battery}%</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted">
                        {t.last_ping_at
                          ? new Date(t.last_ping_at).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            }) + ' UTC'
                          : 'N/D'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </BlueprintPlate>
      </div>

      {/* Drawer Lateral Deslizable con handlers conectados */}
      <TravelerDrawer
        traveler={selectedTraveler}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onRequestCheckIn={handleRequestCheckIn}
        onViewOnMap={handleViewOnMap}
        onSendAlert={handleSendAlert}
      />
    </div>
  );
};
