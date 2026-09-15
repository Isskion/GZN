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
      {/* Telemetry Coordinate Box */}
      <div className="pointer-events-auto bg-slate-950/90 border border-slate-800/90 backdrop-blur-md rounded-xl p-2.5 shadow-2xl text-[11px] font-mono text-slate-300 flex items-center gap-4">
        {/* Reticle Icon & Target indicator */}
        <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
            isCursorMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}>
            <Crosshair className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
              {isCursorMode ? 'CURSOR TARGET' : 'CENTRO TÁCTICO'}
            </div>
            <div className="text-emerald-400 font-bold text-xs">{formatted.dms}</div>
          </div>
        </div>

        {/* Decimal + Datum */}
        <div className="hidden sm:block border-r border-slate-800 pr-3">
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">DATUM / PROY</div>
          <div className="text-slate-300">WGS84 · {formatted.decimal}</div>
        </div>

        {/* Zoom & Bearing */}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">ZOOM</div>
            <div className="text-slate-200 font-bold">Z: {zoom.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">RUMBO / INCL</div>
            <div className="text-slate-200 font-bold flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-400" />
              <span>{Math.round(bearing)}° ({cardinal}) · {Math.round(pitch)}°</span>
            </div>
          </div>
        </div>

        {/* Engine Status */}
        <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-slate-800 text-[10px]">
          <span className={`w-2 h-2 rounded-full ${isHereActive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
          <span className={isHereActive ? 'text-emerald-400' : 'text-amber-400'}>
            {isHereActive ? 'HERE v3 HD' : 'DEMO TILES'}
          </span>
        </div>
      </div>

      {/* Quick Jump Sector Buttons */}
      <div className="pointer-events-auto bg-slate-950/90 border border-slate-800/90 backdrop-blur-md rounded-xl p-1.5 shadow-2xl flex items-center gap-1">
        {onCenterFleet && (
          <button
            onClick={onCenterFleet}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-all border border-slate-800"
            title="Centrar mapa en todo El Rebaño"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">El Rebaño</span>
          </button>
        )}

        {onCenterRedZone && (
          <button
            onClick={onCenterRedZone}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-all border border-slate-800"
            title="Enfocar Zona Roja de Conflicto"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Zona Roja</span>
          </button>
        )}

        {onCenterSafeHaven && (
          <button
            onClick={onCenterSafeHaven}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono transition-all border border-slate-800"
            title="Enfocar Embajada y Safe Haven"
          >
            <Home className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Safe Haven</span>
          </button>
        )}
      </div>
    </div>
  );
}
