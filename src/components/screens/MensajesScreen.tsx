'use client';

import React, { useState } from 'react';
import { Send, Radio, AlertTriangle, Shield, CheckCircle, FileText } from 'lucide-react';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';

export const MensajesScreen: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('curfew');
  const [title, setTitle] = useState<string>('Aviso Táctico: Toque de Queda Inminente');
  const [severity, setSeverity] = useState<'CRIT' | 'HIGH' | 'WATCH'>('HIGH');
  const [message, setMessage] = useState<string>(
    'Se declara toque de queda restrictivo a partir de las 20:00 UTC en todo el sector sur. Diríjanse de inmediato al Safe Haven asignado o permanezcan a resguardo.'
  );
  const [sentToast, setSentToast] = useState<boolean>(false);

  const templates = [
    {
      id: 'curfew',
      name: 'Toque de Queda',
      title: 'Aviso Táctico: Toque de Queda Inminente',
      severity: 'HIGH' as const,
      text: 'Se declara toque de queda restrictivo a partir de las 20:00 UTC en todo el sector sur. Diríjanse de inmediato al Safe Haven asignado o permanezcan a resguardo.',
    },
    {
      id: 'evac',
      name: 'Evacuación Inmediata',
      title: '🚨 ORDEN DE EVACUACIÓN PRIORITARIA',
      severity: 'CRIT' as const,
      text: 'Combates hostiles en proximidad directa. Ejecuten vector de extracción de emergencia hacia el punto de reunión ALPHA de inmediato.',
    },
    {
      id: 'checkin',
      name: 'Comprobación de Seguridad',
      title: 'Solicitud de Check-in Periódico',
      severity: 'WATCH' as const,
      text: 'Protocolo de seguridad rutinario. Por favor confirme su estado pulsando el botón de acuse en su terminal táctico.',
    },
  ];

  const handleSelectTemplate = (tpl: typeof templates[0]) => {
    setSelectedTemplate(tpl.id);
    setTitle(tpl.title);
    setSeverity(tpl.severity);
    setMessage(tpl.text);
  };

  const handleSimulateDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setSentToast(true);
    setTimeout(() => {
      setSentToast(false);
    }, 4000);
  };

  return (
    <div className="mensajes flex flex-col h-full min-h-0 bg-[var(--color-bg)] text-[var(--color-text)] p-4 gap-4 overflow-y-auto">
      {/* Toast Informativo Simulado */}
      {sentToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--color-text)] text-[var(--color-bg)] px-4 py-2.5 rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] flex items-center gap-2 text-xs font-mono">
          <CheckCircle className="w-4 h-4 text-[var(--risk-stable)]" />
          <span>[SIMULACIÓN] Boletín encolado para distribución táctica (FCM / SMS).</span>
        </div>
      )}

      {/* Cabecera Informativa */}
      <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3">
        <div>
          <span className="kicker">Comunicaciones Tácticas</span>
          <h3 className="font-heading font-semibold text-lg m-0 tracking-wide">
            Centro de Emisión de Boletines y Alertas
          </h3>
        </div>
        <div className="tag tag-watch text-xs">
          BROADCAST MASIVO: SIMULADO (FUERA DE MVP)
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Columna Izquierda: Formulario y Plantillas (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Plantillas Tácticas */}
          <BlueprintPlate kicker="Plantillas Rápidas" title="Protocolos Predefinidos">
            <div className="p-3 flex gap-2 flex-wrap">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`btn text-xs ${
                    selectedTemplate === tpl.id ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          </BlueprintPlate>

          {/* Formulario de Redacción */}
          <BlueprintPlate kicker="Composición de Mensaje" title="Detalle de Emisión" className="p-4 flex-1">
            <form onSubmit={handleSimulateDispatch} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-heading tracking-wider text-muted mb-1">
                  Título del Boletín:
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-heading tracking-wider text-muted mb-1">
                    Nivel de Severidad:
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="input"
                  >
                    <option value="CRIT">Crítico (Peligro Inminente)</option>
                    <option value="HIGH">Alto (Restricción Operativa)</option>
                    <option value="WATCH">Informativo (Atención)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase font-heading tracking-wider text-muted mb-1">
                    Canales de Enlace:
                  </label>
                  <div className="flex items-center gap-3 pt-2 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-[var(--color-accent)]" />
                      <span>FCM Push</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-[var(--color-accent)]" />
                      <span>SMS Satelital</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-heading tracking-wider text-muted mb-1">
                  Cuerpo del Mensaje Táctico:
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input min-h-[110px]"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-[var(--color-divider)]">
                <span className="text-[11px] text-muted font-mono">
                  Alcance estimado: Toda la organización (42 unidades)
                </span>
                <button type="submit" className="btn btn-primary flex items-center gap-2">
                  <Send className="w-3.5 h-3.5" />
                  <span>Emitir Boletín Táctico</span>
                </button>
              </div>
            </form>
          </BlueprintPlate>
        </div>

        {/* Columna Derecha: Previsualizador de Terminal (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <BlueprintPlate kicker="Previsualización" title="Dispositivo Móvil del Viajero" className="p-4 flex-1 flex flex-col">
            <div className="flex-1 flex flex-col justify-center items-center p-4">
              {/* Mockup de pantalla móvil */}
              <div className="w-full max-w-[280px] bg-[var(--color-surface)] border border-[var(--color-divider)] rounded-[var(--radius-md)] p-3 shadow-md">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-divider)] text-[10px] font-mono text-muted">
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-[var(--color-accent)]" />
                    <span>GZN MOBILE</span>
                  </div>
                  <span>AHORA</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full flex-none ${
                        severity === 'CRIT'
                          ? 'bg-[var(--risk-crit)] animate-pulse'
                          : severity === 'HIGH'
                          ? 'bg-[var(--risk-high)]'
                          : 'bg-[var(--risk-watch)]'
                      }`}
                    />
                    <h5 className="font-heading font-semibold text-xs m-0 tracking-wide">
                      {title}
                    </h5>
                  </div>
                  <p className="text-[11px] text-[var(--color-text)] opacity-85 leading-snug m-0 whitespace-pre-wrap">
                    {message}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-[var(--color-divider)] flex justify-end">
                  <span className="text-[10px] font-mono text-[var(--color-accent)] uppercase tracking-wider font-semibold">
                    Acuse Requerido →
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted text-center m-0 mt-2 font-mono">
              Renderizado táctico para terminales seguros Android / iOS.
            </p>
          </BlueprintPlate>
        </div>
      </div>
    </div>
  );
};
