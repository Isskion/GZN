'use client';

import React, { useState } from 'react';
import { Globe, ShieldAlert, Users, AlertTriangle, ChevronRight, Activity } from 'lucide-react';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';
import { IncidentTape, IncidentItem } from '@/components/industry/IncidentTape';

interface CountryPresence {
  id: string;
  name: string;
  code: string;
  activeTravelers: number;
  threatLevel: 'CRIT' | 'HIGH' | 'WATCH' | 'STABLE';
  primaryZone: string;
}

interface SituacionScreenProps {
  onSelectIncident?: (incident: IncidentItem) => void;
}

export const SituacionScreen: React.FC<SituacionScreenProps> = ({ onSelectIncident }) => {
  const [countries] = useState<CountryPresence[]>([
    {
      id: 'c-01',
      name: 'Kenia (Mando Regional)',
      code: 'KEN',
      activeTravelers: 14,
      threatLevel: 'WATCH',
      primaryZone: 'Nairobi Central & Rift Valley',
    },
    {
      id: 'c-02',
      name: 'Ucrania (Sector Este)',
      code: 'UKR',
      activeTravelers: 8,
      threatLevel: 'CRIT',
      primaryZone: 'Járkov & Zaporiyia',
    },
    {
      id: 'c-03',
      name: 'Sudán (Zona Sahel)',
      code: 'SDN',
      activeTravelers: 5,
      threatLevel: 'CRIT',
      primaryZone: 'Jartum Norte',
    },
    {
      id: 'c-04',
      name: 'Colombia (Pacífico)',
      code: 'COL',
      activeTravelers: 11,
      threatLevel: 'HIGH',
      primaryZone: 'Buenaventura & Nariño',
    },
    {
      id: 'c-05',
      name: 'España (Base Operaciones C2)',
      code: 'ESP',
      activeTravelers: 4,
      threatLevel: 'STABLE',
      primaryZone: 'Madrid HQ',
    },
  ]);

  const [incidents] = useState<IncidentItem[]>([
    {
      id: 'inc-01',
      title: 'Incursión Perímetro Norte',
      detail: 'Telemetría detecta cruce de geocerca en zona hostil de exclusión militar.',
      time: '19:42:10',
      severity: 'CRIT',
      targetCallsign: 'CONVOY-ALFA',
    },
    {
      id: 'inc-02',
      title: 'Disparo Botón SOS de Pánico',
      detail: 'Pulsador táctico activado manualmente por sujeto protegido VIP.',
      time: '19:38:05',
      severity: 'CRIT',
      targetCallsign: 'VIP-BRAVO',
    },
    {
      id: 'inc-03',
      title: 'Batería Crítica < 15%',
      detail: 'Baliza de posicionamiento en umbral de desconexión inminente.',
      time: '19:15:22',
      severity: 'HIGH',
      targetCallsign: 'MED-DELTA',
    },
    {
      id: 'inc-04',
      title: 'Paso por Checkpoint Alpha',
      detail: 'Acuse de paso confirmado sin novedades ni demoras operativas.',
      time: '18:50:00',
      severity: 'STABLE',
      targetCallsign: 'LOG-CHARLIE',
    },
  ]);

  const getThreatBadge = (level: CountryPresence['threatLevel']) => {
    switch (level) {
      case 'CRIT':
        return <span className="tag tag-crit">CRÍTICO</span>;
      case 'HIGH':
        return <span className="tag tag-high">ALTO</span>;
      case 'WATCH':
        return <span className="tag tag-watch">ATENCIÓN</span>;
      case 'STABLE':
        return <span className="tag tag-stable">NOMINAL</span>;
    }
  };

  return (
    <div className="situacion flex flex-col h-full min-h-0 bg-[var(--color-bg)] text-[var(--color-text)] p-4 gap-4 overflow-y-auto">
      {/* Cabecera Informativa con Rótulo Explícito de Simulación (Mandato Claude 2) */}
      <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3 flex-none">
        <div>
          <span className="kicker">Panorama Estratégico Global</span>
          <h3 className="font-heading font-semibold text-lg m-0 tracking-wide">
            Consola Macro de Operaciones y Teatros
          </h3>
        </div>
        <div className="tag tag-watch text-xs font-semibold font-mono">
          VISTA MACRO: DATOS DE MUESTRA (SIMULACIÓN OPSEC)
        </div>
      </div>

      {/* Panel Superior: KPIs de Situación Global */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-none">
        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker">Personal en Tránsito</span>
          <b className="block font-heading text-3xl font-semibold mt-1">42</b>
          <span className="text-[10px] text-muted font-mono">5 PAÍSES CON COBERTURA</span>
        </BlueprintPlate>

        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker text-[var(--risk-crit)]">En Zona de Riesgo</span>
          <b className="block font-heading text-3xl font-semibold mt-1 text-[var(--risk-crit)]">3</b>
          <span className="text-[10px] text-muted font-mono">2 EN ZONA ROJA</span>
        </BlueprintPlate>

        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker">Geocercas Activas</span>
          <b className="block font-heading text-3xl font-semibold mt-1">18</b>
          <span className="text-[10px] text-muted font-mono">POSTGIS RPC ONLINE</span>
        </BlueprintPlate>

        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker text-[var(--color-accent)]">Nivel de Amenaza Global</span>
          <b className="block font-heading text-3xl font-semibold mt-1 text-[var(--color-accent)]">ELEVADO</b>
          <span className="text-[10px] text-muted font-mono">CONDICIÓN DEF-CON 3</span>
        </BlueprintPlate>
      </div>

      {/* Panel Central: Mapa Esquemático & Desglose por Países */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[320px]">
        {/* Mapa / Vista Macro */}
        <BlueprintPlate
          kicker="Visor Estratégico"
          title="Distribución Geográfica de Personal"
          className="lg:col-span-2 flex flex-col p-4 bg-[color-mix(in_srgb,var(--color-surface)_25%,transparent)] min-h-[260px] relative overflow-hidden"
        >
          <div className="flex-1 flex flex-col items-center justify-center border border-[var(--color-divider)] rounded-[var(--radius-sm)] p-6 relative">
            {/* Trama de líneas de plano técnico de fondo */}
            <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(var(--color-text)_1px,transparent_1px)] [background-size:16px_16px]" />

            <Globe className="w-16 h-16 text-[var(--color-accent)] opacity-40 mb-3 animate-pulse" />
            <h4 className="font-heading font-semibold text-base m-0 tracking-wider">
              PANORAMA GLOBAL DE OPERACIONES
            </h4>
            <p className="text-xs text-muted text-center max-w-md mt-1 leading-relaxed">
              Consola macroestratégica RSO. Supervise la integridad de convoyes, personal expatriado y
              misiones diplomáticas en teatros de operaciones de alto riesgo.
            </p>

            <div className="flex items-center gap-4 mt-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--risk-crit)]" />
                <span>Sector Hostil</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--risk-high)]" />
                <span>Zona Restringida</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--risk-stable)]" />
                <span>Safe Haven</span>
              </div>
            </div>
          </div>
        </BlueprintPlate>

        {/* Lista de Teatros / Países con Presencia */}
        <BlueprintPlate
          kicker="Despliegue Territorial"
          title="Teatros de Operaciones"
          className="flex flex-col bg-[color-mix(in_srgb,var(--color-surface)_25%,transparent)] overflow-hidden"
        >
          <div className="divide-y divide-[var(--color-divider)] overflow-y-auto max-h-[300px]">
            {countries.map((c) => (
              <div
                key={c.id}
                className="p-3 hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold text-sm">{c.name}</span>
                    <span className="font-mono text-[10px] text-muted">{c.code}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">{c.primaryZone}</div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {getThreatBadge(c.threatLevel)}
                  <span className="font-mono text-[10px] text-muted">
                    {c.activeTravelers} desplegados
                  </span>
                </div>
              </div>
            ))}
          </div>
        </BlueprintPlate>
      </div>

      {/* Panel Inferior: Cinta de Incidentes (Feed Táctico Sala) */}
      <div className="h-44 flex-none">
        <IncidentTape incidents={incidents} onSelectIncident={onSelectIncident} />
      </div>
    </div>
  );
};
