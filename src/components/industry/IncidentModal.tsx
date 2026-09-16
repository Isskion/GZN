'use client';

import React, { useState } from 'react';
import { X, CheckSquare, AlertTriangle, Shield, Clock } from 'lucide-react';
import { IncidentItem } from './IncidentTape';

interface IncidentModalProps {
  incident: IncidentItem | null;
  onClose: () => void;
  onAcknowledge?: (incidentId: string) => void;
  onEscalate?: (incidentId: string) => void;
}

export const IncidentModal: React.FC<IncidentModalProps> = ({
  incident,
  onClose,
  onAcknowledge,
  onEscalate,
}) => {
  const [completedSteps, setCompletedSteps] = useState<{ [key: number]: boolean }>({});

  if (!incident) return null;

  const toggleStep = (idx: number) => {
    setCompletedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const protocolSteps = [
    { label: 'Verificar telemetría en mapa táctico y corroborar última posición', time: 'T+0m' },
    { label: 'Intentar enlace primario por radio VHF/HF o llamada de emergencia satelital', time: 'T+2m' },
    { label: 'Notificar al equipo de respuesta rápida (QRF) y RSO de sector', time: 'T+5m' },
    { label: 'Designar zona de evacuación / Safe Haven alternativo y trazar vector de extracción', time: 'T+8m' },
    { label: 'Escalar informe a Dirección de Seguridad y registrar acuse oficial', time: 'T+15m' },
  ];

  return (
    <div className="fixed inset-0 bg-[color-mix(in_srgb,#000_65%,transparent)] z-[900] flex items-center justify-center p-4 backdrop-blur-[2px]">
      <div className="modal blueprint w-full max-w-xl bg-[var(--color-bg)] border border-[var(--color-divider)] shadow-[var(--shadow-lg)] relative text-[var(--color-text)]">
        {/* Esquinas Blueprint */}
        <i className="corner tl" aria-hidden="true" />
        <i className="corner tr" aria-hidden="true" />
        <i className="corner bl" aria-hidden="true" />
        <i className="corner br" aria-hidden="true" />

        {/* Cabecera */}
        <div className="hd flex items-center justify-between p-3.5 border-b border-[var(--color-divider)]">
          <div className="flex items-center gap-2">
            <span className="tag tag-crit text-xs">INCIDENTE ACTIVO</span>
            <h3 className="font-heading font-semibold text-lg m-0 tracking-wide">
              {incident.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] rounded text-muted hover:text-[var(--color-text)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="bd p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {/* Ficha técnica del evento */}
          <div className="space-y-1.5 text-xs border-b border-[var(--color-divider)] pb-3">
            <div className="grid grid-cols-[110px_1fr] py-1 border-b border-[color-mix(in_srgb,var(--color-divider)_60%,transparent)]">
              <span className="text-muted uppercase text-[10px] tracking-wider font-heading">Hora Registro:</span>
              <span className="font-mono">{incident.time} (UTC)</span>
            </div>
            <div className="grid grid-cols-[110px_1fr] py-1 border-b border-[color-mix(in_srgb,var(--color-divider)_60%,transparent)]">
              <span className="text-muted uppercase text-[10px] tracking-wider font-heading">Sujeto / Unidad:</span>
              <span className="font-mono font-medium text-[var(--color-accent)]">{incident.targetCallsign || 'N/A'}</span>
            </div>
            <div className="grid grid-cols-[110px_1fr] py-1">
              <span className="text-muted uppercase text-[10px] tracking-wider font-heading">Diagnóstico:</span>
              <span>{incident.detail}</span>
            </div>
          </div>

          {/* Checklist de Protocolo de Respuesta Táctica */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="kicker">Protocolo de Intervención RSO</span>
              <span className="text-[11px] text-muted font-mono">ESTÁNDAR SOP-04</span>
            </div>
            <div className="proto border border-[var(--color-divider)] divide-y divide-[var(--color-divider)] rounded-[var(--radius-sm)] overflow-hidden">
              {protocolSteps.map((step, idx) => {
                const isChecked = !!completedSteps[idx];
                return (
                  <label
                    key={idx}
                    className="grid grid-cols-[20px_1fr_auto] gap-3 items-center p-2.5 hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] cursor-pointer text-xs transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleStep(idx)}
                      className="w-3.5 h-3.5 accent-[var(--color-accent)] cursor-pointer"
                    />
                    <span className={isChecked ? 'line-through opacity-50' : 'text-[var(--color-text)]'}>
                      {step.label}
                    </span>
                    <em className="not-italic font-mono text-[10px] text-muted tracking-tight">
                      {step.time}
                    </em>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="ft flex items-center justify-between p-3.5 border-t border-[var(--color-divider)] bg-[color-mix(in_srgb,var(--color-bg)_96%,transparent)]">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs"
          >
            Cerrar
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onAcknowledge?.(incident.id);
                onClose();
              }}
              className="btn btn-secondary text-xs"
            >
              Acusar Recibo
            </button>
            <button
              type="button"
              onClick={() => {
                onEscalate?.(incident.id);
                onClose();
              }}
              className="btn btn-primary text-xs"
            >
              Confirmar y Escalar QRF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
