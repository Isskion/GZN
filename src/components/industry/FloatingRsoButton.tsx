'use client';

import React, { useState } from 'react';
import {
  Shield,
  MapPin,
  FileText,
  Radio,
  X,
  Compass,
  Layers,
  UserPlus,
  Crosshair,
  ShieldAlert,
  Home,
  Users,
} from 'lucide-react';
import { ScreenId } from '@/components/industry/ConsoleRail';

export interface FloatingRsoButtonProps {
  onNavigateScreen: (screen: ScreenId) => void;
  onSimulatePing?: () => void;
  onOpenCreateZone?: () => void;
  onOpenCreateTraveler?: () => void;
  onCenterFleet?: () => void;
  onCenterRedZone?: () => void;
  onCenterSafeHaven?: () => void;
  isTerrenoActive?: boolean;
}

export const FloatingRsoButton: React.FC<FloatingRsoButtonProps> = ({
  onNavigateScreen,
  onSimulatePing,
  onOpenCreateZone,
  onOpenCreateTraveler,
  onCenterFleet,
  onCenterRedZone,
  onCenterSafeHaven,
  isTerrenoActive = true,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleAction = (label: string, actionFn?: () => void) => {
    if (!actionFn) return;
    actionFn();
    setActionFeedback(label);
    setTimeout(() => {
      setActionFeedback(null);
      setIsOpen(false);
    }, 1400);
  };

  const handleTerrainNav = (label: string, navFn?: () => void) => {
    if (!isTerrenoActive) {
      onNavigateScreen('terreno');
    }
    handleAction(label, () => {
      navFn?.();
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end select-none">
      {/* Feedback contextual temporal */}
      {actionFeedback && (
        <div className="mb-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface)] border border-[var(--color-divider)] shadow-lg text-xs font-mono text-[var(--color-accent)] animate-in fade-in slide-in-from-bottom-2 duration-150">
          {actionFeedback}
        </div>
      )}

      {/* Menú desplegable táctico (Blueprint Plate) */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          <div className="blueprint plate relative z-40 mb-3 w-72 bg-[var(--color-surface)] border border-[var(--color-divider)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] p-3 text-xs text-[var(--color-text)] animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-divider)]">
              <span className="font-heading font-semibold text-xs tracking-wider uppercase flex items-center gap-1.5 text-[var(--color-accent)]">
                <Compass className="w-3.5 h-3.5" />
                <span>Acciones Rápidas RSO</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="opacity-50 hover:opacity-100 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {/* Sección 1: Despliegue Táctico */}
              {(onOpenCreateZone || onOpenCreateTraveler) && (
                <>
                  <div className="text-[10px] font-mono uppercase text-[var(--color-accent)] font-semibold tracking-wider px-1 py-0.5">
                    Despliegue Táctico
                  </div>
                  {onOpenCreateZone && (
                    <button
                      type="button"
                      onClick={() => handleAction('Delimitador de Zonas', onOpenCreateZone)}
                      className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-left transition-colors w-full"
                    >
                      <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-none">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-heading font-semibold text-xs uppercase text-[var(--color-accent)]">Pintar Zona Táctica</div>
                        <div className="text-[10px] opacity-60">Delimitar perímetro o radio en mapa</div>
                      </div>
                    </button>
                  )}
                  {onOpenCreateTraveler && (
                    <button
                      type="button"
                      onClick={() => handleAction('Alta de Viajero / Convoy', onOpenCreateTraveler)}
                      className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-left transition-colors w-full"
                    >
                      <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-none">
                        <UserPlus className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-heading font-semibold text-xs uppercase text-[var(--color-accent)]">Añadir al Rebaño</div>
                        <div className="text-[10px] opacity-60">Nuevo convoy o viajero en sector</div>
                      </div>
                    </button>
                  )}
                  <div className="my-1 border-t border-[var(--color-divider)]" />
                </>
              )}

              {/* Sección 2: Navegación en Terreno (Opciones integradas del HUD) */}
              <div className="text-[10px] font-mono uppercase text-[var(--color-muted)] font-semibold tracking-wider px-1 py-0.5">
                Navegación Terreno
              </div>
              <button
                type="button"
                onClick={() => handleTerrainNav('Enfocando El Rebaño', onCenterFleet)}
                disabled={!onCenterFleet}
                className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-left transition-colors w-full disabled:opacity-40"
              >
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] text-[var(--color-text)] flex items-center justify-center flex-none">
                  <Crosshair className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-heading font-semibold text-xs uppercase">Centrar El Rebaño</div>
                  <div className="text-[10px] opacity-60">Ajustar encuadre a viajeros activos</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTerrainNav('Enfocando Zona Crítica', onCenterRedZone)}
                disabled={!onCenterRedZone}
                className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--risk-crit)_10%,transparent)] text-left transition-colors w-full disabled:opacity-40"
              >
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--risk-crit)_15%,transparent)] text-[var(--risk-crit)] flex items-center justify-center flex-none">
                  <ShieldAlert className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-heading font-semibold text-xs uppercase text-[var(--risk-crit)]">Zona Crítica</div>
                  <div className="text-[10px] opacity-60">Salto táctico a sector hostil</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTerrainNav('Enfocando Safe Haven', onCenterSafeHaven)}
                disabled={!onCenterSafeHaven}
                className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--risk-stable)_10%,transparent)] text-left transition-colors w-full disabled:opacity-40"
              >
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--risk-stable)_15%,transparent)] text-[var(--risk-stable)] flex items-center justify-center flex-none">
                  <Home className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-heading font-semibold text-xs uppercase text-[var(--risk-stable)]">Safe Haven</div>
                  <div className="text-[10px] opacity-60">Salto táctico a refugio seguro</div>
                </div>
              </button>

              <div className="my-1 border-t border-[var(--color-divider)]" />

              {/* Sección 3: Consola y Pantallas */}
              <div className="text-[10px] font-mono uppercase text-[var(--color-muted)] font-semibold tracking-wider px-1 py-0.5">
                Consola RSO
              </div>
              {!isTerrenoActive && (
                <button
                  type="button"
                  onClick={() =>
                    handleAction('Navegando a Terreno Operativo', () =>
                      onNavigateScreen('terreno')
                    )
                  }
                  className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-left transition-colors w-full"
                >
                  <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-none">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-heading font-semibold text-xs uppercase">Ver Terreno</div>
                    <div className="text-[10px] opacity-60">Cartografía táctica principal</div>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  handleAction('Abriendo Sala de Briefings', () =>
                    onNavigateScreen('briefings')
                  )
                }
                className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-left transition-colors w-full"
              >
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--risk-stable)_14%,transparent)] text-[var(--risk-stable)] flex items-center justify-center flex-none">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-heading font-semibold text-xs uppercase">Sala de Briefings</div>
                  <div className="text-[10px] opacity-60">Consultar directivas y POIs</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleAction('Consultar Cartera de Expatriados', () =>
                    onNavigateScreen('personas')
                  )
                }
                className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] text-left transition-colors w-full"
              >
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] text-[var(--color-text)] flex items-center justify-center flex-none">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-heading font-semibold text-xs uppercase">Cartera Personal</div>
                  <div className="text-[10px] opacity-60">Estado de convoyes y viajeros</div>
                </div>
              </button>

              <div className="my-1 border-t border-[var(--color-divider)]" />

              <button
                type="button"
                onClick={() =>
                  handleAction('Simulación de Telemetría ejecutada [DEMO]', () =>
                    onSimulatePing?.()
                  )
                }
                className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] hover:bg-[color-mix(in_srgb,var(--risk-watch)_10%,transparent)] text-left transition-colors text-[var(--risk-watch)] w-full"
              >
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--risk-watch)_15%,transparent)] text-[var(--risk-watch)] flex items-center justify-center flex-none">
                  <Radio className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-heading font-semibold text-xs uppercase flex items-center gap-1">
                    <span>Ping Telemetría</span>
                    <span className="text-[8px] font-mono px-1 border border-current rounded">SIM</span>
                  </div>
                  <div className="text-[10px] opacity-75">Prueba de enlace sin emisión crítica</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Botón Flotante Circular "G" */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir panel de acción rápida RSO"
        className="w-12 h-12 rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] shadow-[var(--shadow-lg)] flex items-center justify-center font-heading font-bold text-lg tracking-wider border-2 border-[var(--color-surface)] hover:scale-105 active:scale-95 transition-all duration-150 relative z-40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
      >
        {isOpen ? <X className="w-5 h-5" /> : <span>G</span>}
      </button>
    </div>
  );
};
