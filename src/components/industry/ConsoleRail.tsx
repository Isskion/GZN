'use client';

import React from 'react';
import { Globe, MapPin, Users, Radio, FileText } from 'lucide-react';

export type ScreenId = 'situacion' | 'terreno' | 'personas' | 'mensajes' | 'briefings';

interface ConsoleRailProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
}

const NAV_ITEMS: { id: ScreenId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'terreno', label: 'Terreno', icon: MapPin },
  { id: 'situacion', label: 'Situación', icon: Globe },
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'briefings', label: 'Briefings', icon: FileText },
  { id: 'mensajes', label: 'Mensajes', icon: Radio },
];

export const ConsoleRail: React.FC<ConsoleRailProps> = ({
  activeScreen,
  onSelectScreen,
}) => {
  return (
    <nav
      className="rail w-[var(--rail)] border-r border-[var(--color-divider)] flex flex-col items-center pt-3 gap-1 bg-[var(--color-bg)] z-40 select-none"
      aria-label="Navegación principal de pantallas"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeScreen === item.id;

        return (
          <div key={item.id} className="relative group flex items-center justify-center w-full">
            <button
              type="button"
              onClick={() => onSelectScreen(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-10 h-11 flex items-center justify-center relative transition-all rounded-[var(--radius-sm)] ${
                isActive
                  ? 'text-[var(--color-accent)] opacity-100 bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]'
                  : 'text-[var(--color-text)] opacity-60 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]'
              }`}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--color-accent)]"
                  aria-hidden="true"
                />
              )}
              <Icon className="w-5 h-5" />
            </button>

            {/* Tooltip técnico tipo Blueprint */}
            <span
              className="absolute left-[54px] px-2 py-1 bg-[var(--color-text)] text-[var(--color-bg)] text-[10px] tracking-[0.1em] font-heading font-semibold uppercase whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-md border border-[var(--color-divider)]"
              role="tooltip"
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
};
