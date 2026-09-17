'use client';

import React, { useEffect, useState } from 'react';
import { logout } from '@/app/actions/auth';

export type DirectionType = 'mesa' | 'sala' | 'pliego';

interface ConsoleHeaderProps {
  alertsCount: number;
  onAlertPillClick?: () => void;
  activeScreenTitle?: string;
  currentDirection?: DirectionType;
  onDirectionChange?: (dir: DirectionType) => void;
  userEmail?: string | null;
  userRole?: string | null;
  canManageZones?: boolean;
  onOpenCreateZone?: () => void;
}

const DIRNOTES: Record<DirectionType, string> = {
  mesa: 'Mesa de luz — el mundo como plano técnico; los datos, como hoja de especificación.',
  sala: 'Sala — campo acero, cinta de incidentes siempre a la vista. Turno de noche.',
  pliego: 'Pliego — primero las personas: una ficha por expatriado, el mapa reducido a franja.',
};

export const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({
  alertsCount,
  onAlertPillClick,
  activeScreenTitle = 'Situación global',
  currentDirection = 'sala',
  onDirectionChange,
  userEmail,
  userRole,
  canManageZones = false,
  onOpenCreateZone,
}) => {
  const [direction, setDirection] = useState<DirectionType>(currentDirection);
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().slice(11, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSetDirection = (dir: DirectionType) => {
    setDirection(dir);
    onDirectionChange?.(dir);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-dir', dir);
      if (dir === 'sala') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  return (
    <header className="topbar h-[52px] border-b border-[var(--color-divider)] bg-[var(--color-bg)] flex items-center px-4 gap-4 z-[500] select-none text-[var(--color-text)]">
      <div className="brand flex items-center gap-2.5 font-heading font-semibold text-[19px] tracking-[0.06em]">
        <img
          src="/logo/gzn-mark.svg"
          alt="GZN"
          className="w-7 h-7 object-contain flex-none"
        />
        <div className="flex flex-col leading-none">
          <span className="font-heading font-bold text-[17px] tracking-[0.08em] leading-tight">GZN</span>
          <small className="font-body font-medium text-[9px] tracking-[0.16em] uppercase opacity-55">
            Green Zone Navigator
          </small>
        </div>
      </div>

      <span className="kicker hidden md:inline text-xs opacity-75 border-l border-[var(--color-divider)] pl-3">
        {activeScreenTitle}
      </span>

      <div className="ml-auto flex items-center gap-4">
        {/* Nota explicativa de la dirección */}
        <span className="dirnote text-[11px] tracking-[0.04em] opacity-55 max-w-[280px] truncate hidden xl:inline">
          {DIRNOTES[direction]}
        </span>

        {/* Selector de dirección: Mesa / Sala / Pliego */}
        <div className="dirswitch flex border border-[var(--color-divider)] rounded-[var(--radius-sm)] overflow-hidden">
          {(['mesa', 'sala', 'pliego'] as DirectionType[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleSetDirection(d)}
              aria-pressed={direction === d}
              className={`font-heading font-semibold text-[12px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors border-l first:border-l-0 border-[var(--color-divider)] ${
                direction === d
                  ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                  : 'bg-transparent text-[var(--color-text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]'
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        {/* Reloj UTC */}
        <span className="clock mono text-xs opacity-60 font-mono hidden sm:inline">
          {utcTime || '--:--:-- UTC'}
        </span>

        {/* Botón de Creación de Área Táctica (Admin / RSO: role_level >= 60) */}
        {canManageZones && onOpenCreateZone && (
          <button
            type="button"
            onClick={onOpenCreateZone}
            className="blueprint relative flex items-center gap-1.5 font-heading font-semibold text-[11px] tracking-[0.08em] uppercase px-2.5 py-1.5 border border-[var(--color-accent)] text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] transition-all cursor-pointer shadow-sm"
          >
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />
            <span className="text-sm font-bold leading-none">+</span>
            <span className="hidden sm:inline">Nueva Área</span>
          </button>
        )}

        {/* Píldora de alertas */}
        <button
          type="button"
          onClick={onAlertPillClick}
          data-zero={alertsCount === 0 ? '1' : '0'}
          className={`alertpill flex items-center gap-2 font-heading font-semibold text-[13px] tracking-[0.06em] uppercase px-3 py-1.5 border transition-all ${
            alertsCount > 0
              ? 'border-[var(--risk-crit)] text-[var(--risk-crit)] bg-transparent'
              : 'border-[var(--color-divider)] text-inherit opacity-50'
          }`}
        >
          <span
            className={`dot w-2 h-2 rounded-full flex-none ${
              alertsCount > 0 ? 'bg-[var(--risk-crit)] animate-pulse' : 'bg-currentColor'
            }`}
          />
          <span>{alertsCount} abiertas</span>
        </button>

        {/* Usuario autenticado y Botón de Desconexión */}
        <div className="flex items-center gap-2.5 border-l border-[var(--color-divider)] pl-3">
          {userEmail && (
            <div className="hidden lg:flex flex-col items-end text-right leading-none">
              <span className="font-heading font-semibold text-[11px] tracking-[0.06em] text-[var(--color-text)]">
                {userEmail}
              </span>
              {userRole && (
                <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--color-accent)] uppercase mt-0.5">
                  [{userRole}]
                </span>
              )}
            </div>
          )}
          <form action={logout}>
            <button
              type="submit"
              title="Cerrar sesión táctica"
              className="font-heading font-semibold text-[11px] tracking-[0.1em] uppercase px-2.5 py-1 border border-[var(--color-divider)] rounded-[var(--radius-sm)] text-[var(--color-text)] opacity-70 hover:opacity-100 hover:border-[var(--risk-crit)] hover:text-[var(--risk-crit)] hover:bg-[color-mix(in_srgb,var(--risk-crit)_10%,transparent)] transition-all cursor-pointer"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
};
