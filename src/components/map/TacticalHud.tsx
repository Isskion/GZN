'use client';

import React from 'react';
import { Crosshair, Compass, Eye, ShieldAlert, Home, Users } from 'lucide-react';
import { formatTacticalCoordinates } from '@/lib/geo/hereMapStyles';

interface TacticalHudProps {
  cursorCoords: { lat: number; lon: number } | null;
  centerCoords: { lat: number; lon: number };
  zoom: number;
  bearing: number;
  pitch: number;
  isHereActive: boolean;
  onCenterFleet?: () => void;
  onCenterRedZone?: () => void;
  onCenterSafeHaven?: () => void;
}

function getCardinalDirection(bearing: number): string {
  const normalized = ((bearing % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return 'N';
  if (normalized >= 22.5 && normalized < 67.5) return 'NE';
  if (normalized >= 67.5 && normalized < 112.5) return 'E';
  if (normalized >= 112.5 && normalized < 157.5) return 'SE';
  if (normalized >= 157.5 && normalized < 202.5) return 'S';
  if (normalized >= 202.5 && normalized < 247.5) return 'SW';
  if (normalized >= 247.5 && normalized < 292.5) return 'W';
  return 'NW';
}

export function TacticalHud({
  cursorCoords,
  centerCoords,
  zoom,
  bearing,
  pitch,
  isHereActive,
  onCenterFleet,
  onCenterRedZone,
  onCenterSafeHaven,
}: TacticalHudProps) {
  const activePoint = cursorCoords || centerCoords;
  const isCursorMode = !!cursorCoords;
  const formatted = formatTacticalCoordinates(activePoint.lat, activePoint.lon);
  const cardinal = getCardinalDirection(bearing);

  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none flex flex-col md:flex-row items-end md:items-center justify-between gap-2">
      {/* Telemetría y Coordenadas con estilo Industry Blueprint */}
      <div className="pointer-events-auto bg-[var(--color-surface)] border border-[var(--color-divider)] rounded-[var(--radius-sm)] p-2.5 shadow-[var(--shadow-md)] text-[11px] font-mono text-[var(--color-text)] flex items-center gap-4">
        {/* Retícula de Objetivo */}
        <div className="flex items-center gap-2 border-r border-[var(--color-divider)] pr-3">
          <div
            className={`w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center border ${
              isCursorMode
                ? 'bg-[color-mix(in_srgb,var(--risk-watch)_16%,transparent)] text-[var(--risk-watch)] border-[var(--risk-watch)]'
                : 'bg-[color-mix(in_srgb,var(--risk-stable)_16%,transparent)] text-[var(--risk-stable)] border-[var(--risk-stable)]'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-60 font-heading font-semibold">
              {isCursorMode ? 'CURSOR TARGET' : 'CENTRO TÁCTICO'}
            </div>
            <div className="text-[var(--risk-stable)] font-mono font-bold text-xs">{formatted.dms}</div>
          </div>
        </div>

        {/* Decimal + Datum */}
        <div className="hidden sm:block border-r border-[var(--color-divider)] pr-3">
          <div className="text-[9px] uppercase tracking-wider opacity-60 font-heading font-semibold">DATUM / PROY</div>
          <div className="text-[var(--color-text)] opacity-90">WGS84 · {formatted.decimal}</div>
        </div>

        {/* Zoom & Rumbo */}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-60 font-heading font-semibold">ZOOM</div>
            <div className="font-mono font-bold">Z: {zoom.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider opacity-60 font-heading font-semibold">RUMBO / INCL</div>
            <div className="font-mono font-bold flex items-center gap-1">
              <Compass className="w-3 h-3 opacity-60" />
              <span>{Math.round(bearing)}° ({cardinal}) · {Math.round(pitch)}°</span>
            </div>
          </div>
        </div>

        {/* Estado del Motor Cartográfico */}
        <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-[var(--color-divider)] text-[10px] font-heading font-semibold uppercase tracking-wider">
          <span
            className={`w-2 h-2 rounded-full ${
              isHereActive ? 'bg-[var(--risk-stable)] animate-ping' : 'bg-[var(--risk-watch)]'
            }`}
          />
          <span className={isHereActive ? 'text-[var(--risk-stable)]' : 'text-[var(--risk-watch)]'}>
            {isHereActive ? 'HERE v3 HD' : 'DEMO TILES'}
          </span>
        </div>
      </div>

      {/* Botones de Salto Rápido a Sectores Tácticos */}
      <div className="pointer-events-auto bg-[var(--color-surface)] border border-[var(--color-divider)] rounded-[var(--radius-sm)] p-1.5 shadow-[var(--shadow-md)] flex items-center gap-1.5">
        {onCenterFleet && (
          <button
            type="button"
            onClick={onCenterFleet}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--color-bg)] hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] text-[var(--color-text)] hover:text-[var(--color-accent)] text-xs font-heading font-semibold uppercase tracking-wider transition-all border border-[var(--color-divider)]"
            title="Centrar mapa en todo El Rebaño"
          >
            <Users className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            <span className="hidden sm:inline">El Rebaño</span>
          </button>
        )}

        {onCenterRedZone && (
          <button
            type="button"
            onClick={onCenterRedZone}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--color-bg)] hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] text-[var(--color-text)] hover:text-[var(--risk-crit)] text-xs font-heading font-semibold uppercase tracking-wider transition-all border border-[var(--color-divider)]"
            title="Enfocar Zona Roja de Conflicto"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-[var(--risk-crit)]" />
            <span className="hidden sm:inline">Zona Roja</span>
          </button>
        )}

        {onCenterSafeHaven && (
          <button
            type="button"
            onClick={onCenterSafeHaven}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--color-bg)] hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] text-[var(--color-text)] hover:text-[var(--risk-stable)] text-xs font-heading font-semibold uppercase tracking-wider transition-all border border-[var(--color-divider)]"
            title="Enfocar Embajada y Safe Haven"
          >
            <Home className="w-3.5 h-3.5 text-[var(--risk-stable)]" />
            <span className="hidden sm:inline">Safe Haven</span>
          </button>
        )}
      </div>
    </div>
  );
}
