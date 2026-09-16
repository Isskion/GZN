'use client';

import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';

interface ConsoleHeaderProps {
  alertsCount: number;
  onAlertPillClick?: () => void;
  activeScreenTitle?: string;
}

export const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({
  alertsCount,
  onAlertPillClick,
  activeScreenTitle,
}) => {
  const [direction, setDirection] = useState<'sala' | 'mesa'>('sala');
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    // Sincronizar reloj UTC
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().slice(11, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSetDirection = (dir: 'sala' | 'mesa') => {
    setDirection(dir);
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
    <header className="topbar h-[52px] border-b border-[var(--color-divider)] bg-[var(--color-bg)] flex items-center px-4 gap-4 z-50 select-none">
      <div className="brand flex items-baseline gap-2 font-heading font-semibold text-[19px] tracking-[0.06em]">
        <div className="flex items-center gap-1.5 text-[var(--color-accent)]">
          <Shield className="w-5 h-5 text-[var(--color-accent)]" />
          <span>GZN</span>
        </div>
        <small className="font-body font-medium text-[10px] tracking-[0.18em] uppercase opacity-60">
          Consola RSO
        </small>
      </div>

      {activeScreenTitle && (
        <div className="hidden md:flex items-center gap-2 pl-3 border-l border-[var(--color-divider)] text-xs text-muted font-heading uppercase tracking-widest">
          <span>/</span>
          <span className="text-[var(--color-text)] font-semibold">{activeScreenTitle}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-4">
        {/* Selector de personalidad: Sala (defecto) / Mesa */}
        <div className="dirswitch flex border border-[var(--color-divider)] rounded-[var(--radius-sm)] overflow-hidden">
          <button
            type="button"
            className={`font-heading font-semibold text-[11px] tracking-[0.1em] uppercase px-2.5 py-1 transition-colors ${
              direction === 'mesa'
                ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                : 'text-[var(--color-text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]'
            }`}
            onClick={() => handleSetDirection('mesa')}
            aria-pressed={direction === 'mesa'}
          >
            Mesa
          </button>
          <button
            type="button"
            className={`font-heading font-semibold text-[11px] tracking-[0.1em] uppercase px-2.5 py-1 border-l border-[var(--color-divider)] transition-colors ${
              direction === 'sala'
                ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                : 'text-[var(--color-text)] opacity-70 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]'
            }`}
            onClick={() => handleSetDirection('sala')}
            aria-pressed={direction === 'sala'}
          >
            Sala
          </button>
        </div>

        {/* Reloj UTC en vivo */}
        <div className="clock mono text-xs opacity-75 font-mono text-[var(--color-text)] hidden sm:block">
          {utcTime || '--:--:-- UTC'}
        </div>

        {/* Píldora de Alertas Tácticas */}
        <button
          type="button"
          onClick={onAlertPillClick}
          className={`flex items-center gap-1.5 font-heading font-semibold text-[12px] tracking-[0.06em] uppercase px-2.5 py-1 border transition-colors ${
            alertsCount > 0
              ? 'border-[var(--risk-crit)] text-[var(--risk-crit)] bg-[color-mix(in_srgb,var(--risk-crit)_10%,transparent)]'
              : 'border-[var(--color-divider)] text-[var(--color-text)] opacity-60'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full flex-none ${
              alertsCount > 0 ? 'bg-[var(--risk-crit)] animate-pulse' : 'bg-[var(--color-divider)]'
            }`}
          />
          <span>{alertsCount > 0 ? `${alertsCount} CRÍTICA` : 'SISTEMA NOMINAL'}</span>
        </button>
      </div>
    </header>
  );
};
