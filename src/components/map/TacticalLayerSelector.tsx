'use client';

import React, { useState } from 'react';
import { Layers, Shield, Satellite, Map, Navigation, Check, Sparkles } from 'lucide-react';
import { HERE_MAP_LAYERS, type HereMapStyleId } from '@/lib/geo/hereMapStyles';

interface TacticalLayerSelectorProps {
  activeLayer: HereMapStyleId;
  onSelectLayer: (layerId: HereMapStyleId) => void;
  isHereConfigured: boolean;
}

const LAYER_ICONS: Record<HereMapStyleId, React.ComponentType<{ className?: string }>> = {
  'explore.night': Shield,
  'satellite.day': Satellite,
  'explore.day': Map,
  'logistics.day': Navigation,
};

export function TacticalLayerSelector({
  activeLayer,
  onSelectLayer,
  isHereConfigured,
}: TacticalLayerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentConfig = HERE_MAP_LAYERS.find((l) => l.id === activeLayer) || HERE_MAP_LAYERS[0];
  const CurrentIcon = LAYER_ICONS[currentConfig.id] || Shield;

  return (
    <div className="relative z-20">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface)] hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] border border-[var(--color-divider)] rounded-[var(--radius-sm)] shadow-[var(--shadow-sm)] text-xs font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] transition-all"
        title="Seleccionar Cartografía Base"
      >
        <Layers className="w-3.5 h-3.5 text-[var(--color-accent)]" />
        <span className="font-semibold">{currentConfig.label}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)] border border-[var(--color-accent)]">
          {currentConfig.badge}
        </span>
      </button>

      {/* Dropdown Panel - Tarjeta Blueprint Industry */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="blueprint plate absolute top-11 right-0 w-80 bg-[var(--color-surface)] border border-[var(--color-divider)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)] z-20 p-3 text-xs text-[var(--color-text)] animate-in fade-in zoom-in-95 duration-100">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />

            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-divider)]">
              <div className="flex items-center gap-1.5 font-heading font-semibold uppercase tracking-wider text-xs">
                <Layers className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                <span>Cartografía Táctica HERE</span>
              </div>
              {isHereConfigured ? (
                <div className="flex items-center gap-1 text-[10px] text-[var(--risk-stable)] font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--risk-stable)] animate-pulse" />
                  <span>HERE v3 ONLINE</span>
                </div>
              ) : (
                <div className="text-[10px] text-[var(--risk-watch)] font-mono font-semibold">
                  <span>MODO CONTINGENCIA</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              {HERE_MAP_LAYERS.map((layer) => {
                const isSelected = layer.id === activeLayer;
                const Icon = LAYER_ICONS[layer.id];

                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => {
                      onSelectLayer(layer.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 p-2.5 rounded-[var(--radius-sm)] border text-left transition-all ${
                      isSelected
                        ? 'bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] border-[var(--color-accent)] text-[var(--color-text)]'
                        : 'bg-[var(--color-bg)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] border-[var(--color-divider)] text-[var(--color-text)]'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                        isSelected
                          ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)]'
                          : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-divider)]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-heading font-semibold text-xs tracking-wider uppercase">{layer.label}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] border border-[var(--color-divider)]">
                          {layer.badge}
                        </span>
                      </div>
                      <div className="text-[11px] opacity-70 font-body leading-tight mt-0.5">
                        {layer.description}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex-shrink-0 text-[var(--color-accent)] pt-1">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 pt-2 border-t border-[var(--color-divider)] flex items-center justify-between text-[10px] opacity-60 font-mono">
              <span>Resolución Táctica Submétrica</span>
              <span>Tier Gratuito: 250K req/m</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
