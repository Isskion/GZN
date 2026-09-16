'use client';

import React from 'react';
import { X, Battery, MapPin, Radio, Phone, UserCheck, AlertTriangle } from 'lucide-react';
import { Traveler, TravelerStatus } from '@/types/database';

interface TravelerDrawerProps {
  traveler: Traveler | null;
  isOpen: boolean;
  onClose: () => void;
  onViewOnMap?: (traveler: Traveler) => void;
  onRequestCheckIn?: (traveler: Traveler) => void;
  onSendAlert?: (traveler: Traveler) => void;
}

export const TravelerDrawer: React.FC<TravelerDrawerProps> = ({
  traveler,
  isOpen,
  onClose,
  onViewOnMap,
  onRequestCheckIn,
  onSendAlert,
}) => {
  if (!traveler) return null;

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

  const battery = traveler.battery_level ?? 0;
  const batteryColor =
    battery <= 20
      ? 'var(--risk-crit)'
      : battery <= 40
      ? 'var(--risk-high)'
      : 'var(--risk-stable)';

  return (
    <aside
      className={`drawer fixed top-[52px] right-0 bottom-0 w-full max-w-[400px] bg-[var(--color-bg)] border-l border-[var(--color-divider)] shadow-[var(--shadow-lg)] z-[800] flex flex-col transition-transform duration-200 ease-out text-[var(--color-text)] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-label="Ficha de viajero"
    >
      {/* Cabecera del Drawer */}
      <div className="hd flex items-center justify-between p-4 border-b border-[var(--color-divider)]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-[var(--color-accent)]">
            {traveler.callsign || 'SIN INDICATIVO'}
          </span>
          {getStatusBadge(traveler.status)}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] rounded text-muted hover:text-[var(--color-text)] transition-colors"
          aria-label="Cerrar ficha"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Contenido */}
      <div className="bd p-4 flex-1 overflow-y-auto space-y-4">
        {/* Identidad */}
        <div>
          <span className="kicker">Sujeto Protegido</span>
          <h4 className="font-heading font-semibold text-lg m-0 mt-0.5 tracking-wide">
            {traveler.full_name}
          </h4>
          <p className="text-xs text-muted font-mono mt-0.5">ID: {traveler.id.slice(0, 8)}...</p>
        </div>

        {/* Telemetría y Batería */}
        <div className="border border-[var(--color-divider)] p-3 rounded-[var(--radius-sm)] space-y-3 bg-[color-mix(in_srgb,var(--color-surface)_60%,transparent)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted flex items-center gap-1.5">
              <Battery className="w-4 h-4" />
              <span>Nivel de Batería</span>
            </span>
            <span className="font-mono text-xs font-semibold" style={{ color: batteryColor }}>
              {battery}%
            </span>
          </div>
          <div className="w-full bg-[var(--color-divider)] h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, battery))}%`, backgroundColor: batteryColor }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--color-divider)] text-xs">
            <div>
              <span className="text-muted block text-[10px] uppercase tracking-wider font-heading">Último Ping</span>
              <span className="font-mono text-[11px]">
                {traveler.last_ping_at
                  ? new Date(traveler.last_ping_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' UTC'
                  : 'Sin señal'}
              </span>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase tracking-wider font-heading">Posición WGS84</span>
              <span className="font-mono text-[11px]">
                {traveler.last_latitude && traveler.last_longitude
                  ? `${traveler.last_latitude.toFixed(4)}, ${traveler.last_longitude.toFixed(4)}`
                  : 'N/D'}
              </span>
            </div>
          </div>
        </div>

        {/* Canales de Contacto */}
        <div className="border border-[var(--color-divider)] p-3 rounded-[var(--radius-sm)] space-y-2">
          <span className="kicker">Comunicaciones</span>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                <span>Teléfono Táctico:</span>
              </span>
              <span className="font-mono">{traveler.phone || 'N/D'}</span>
            </div>
            {traveler.email && (
              <div className="flex items-center justify-between">
                <span className="text-muted">Email:</span>
                <span className="font-mono">{traveler.email}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Acciones Rápidas */}
      <div className="ft p-3 border-t border-[var(--color-divider)] bg-[color-mix(in_srgb,var(--color-bg)_96%,transparent)] flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onRequestCheckIn?.(traveler)}
            className="btn btn-secondary text-xs flex items-center justify-center gap-1.5 py-2"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Check-in</span>
          </button>
          <button
            type="button"
            onClick={() => onViewOnMap?.(traveler)}
            className="btn btn-secondary text-xs flex items-center justify-center gap-1.5 py-2"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Ver en Mapa</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => onSendAlert?.(traveler)}
          className="btn btn-primary text-xs w-full py-2 flex items-center justify-center gap-1.5"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Emitir Alerta Táctica</span>
        </button>
      </div>
    </aside>
  );
};
