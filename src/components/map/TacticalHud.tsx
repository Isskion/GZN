'use client';

import React from 'react';
import { Crosshair, Compass } from 'lucide-react';
import { formatTacticalCoordinates } from '@/lib/geo/hereMapStyles';

interface TacticalHudProps {
  cursorCoords: { lat: number; lon: number } | null;
  centerCoords: { lat: number; lon: number };
  zoom: number;
  bearing: number;
  pitch: number;
  isHereActive: boolean;
}

export function getCardinalDirection(bearing: number): string {
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
}: TacticalHudProps) {
  const activePoint = cursorCoords || centerCoords;
  const isCursorMode = !!cursorCoords;
  const formatted = formatTacticalCoordinates(activePoint.lat, activePoint.lon);
  const cardinal = getCardinalDirection(bearing);

  return (
    <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center">
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
    </div>
  );
}
