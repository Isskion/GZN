'use client';

import React from 'react';
import { BlueprintPlate } from './BlueprintPlate';
import { AlertTriangle, Clock } from 'lucide-react';

export interface IncidentItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  severity: 'CRIT' | 'HIGH' | 'WATCH' | 'STABLE';
  targetCallsign?: string;
}

interface IncidentTapeProps {
  incidents: IncidentItem[];
  onSelectIncident?: (incident: IncidentItem) => void;
}

export const IncidentTape: React.FC<IncidentTapeProps> = ({
  incidents,
  onSelectIncident,
}) => {
  const getSeverityBadgeClass = (sev: IncidentItem['severity']) => {
    switch (sev) {
      case 'CRIT':
        return 'tag-crit';
      case 'HIGH':
        return 'tag-high';
      case 'WATCH':
        return 'tag-watch';
      case 'STABLE':
        return 'tag-stable';
    }
  };

  return (
    <BlueprintPlate
      kicker="Cinta de Eventos"
      title="Feed Táctico en Vivo"
      headerRight={
        <div className="flex items-center gap-2 text-[11px] font-mono opacity-65">
          <Clock className="w-3.5 h-3.5" />
          <span>{incidents.length} ACTIVOS</span>
        </div>
      }
      className="tape h-full flex flex-col bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)]"
    >
      <div className="flex overflow-x-auto divide-x divide-[var(--color-divider)] h-full min-h-0">
        {incidents.map((incident) => {
          return (
            <article
              key={incident.id}
              onClick={() => onSelectIncident?.(incident)}
              className="flex-none w-[280px] p-3 flex flex-col justify-between hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] transition-colors cursor-pointer group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`tag ${getSeverityBadgeClass(incident.severity)} text-[10px]`}>
                    {incident.severity}
                  </span>
                  <span className="font-mono text-[10px] text-muted tracking-tight">
                    {incident.time}
                  </span>
                </div>
                <h5 className="font-heading font-semibold text-[13px] tracking-wide m-0 line-clamp-1 group-hover:text-[var(--color-accent)] transition-colors">
                  {incident.title}
                </h5>
                <p className="font-body text-xs text-muted m-0 mt-1 line-clamp-2 leading-relaxed">
                  {incident.detail}
                </p>
              </div>

              {incident.targetCallsign && (
                <div className="mt-2 pt-2 border-t border-[var(--color-divider)] flex items-center justify-between text-[11px]">
                  <span className="text-muted font-heading uppercase text-[10px]">Sujeto:</span>
                  <span className="font-mono font-medium text-[var(--color-text)]">
                    {incident.targetCallsign}
                  </span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </BlueprintPlate>
  );
};
