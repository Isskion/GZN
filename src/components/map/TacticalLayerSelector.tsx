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
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-900/95 hover:bg-slate-800/95 border border-slate-700/80 hover:border-slate-600 rounded-lg shadow-xl backdrop-blur-md text-xs font-mono transition-all text-slate-200"
        title="Seleccionar Cartografía Base"
      >
        <Layers className="w-3.5 h-3.5 text-emerald-400" />
        <span className="font-semibold">{currentConfig.label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          {currentConfig.badge}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-11 right-0 w-80 bg-slate-950/95 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-xl z-20 p-3 text-xs animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-1.5 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cartografía Táctica HERE</span>
              </div>
              {isHereConfigured ? (
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>HERE API v3 ONLINE</span>
                </div>
              ) : (
                <div className="text-[10px] text-amber-400 font-mono">
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
                    onClick={() => {
                      onSelectLayer(layer.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-100'
                        : 'bg-slate-900/50 hover:bg-slate-800/60 border-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800/80 text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-200">{layer.label}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {layer.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-sans leading-tight mt-0.5">
                        {layer.description}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex-shrink-0 text-emerald-400 pt-1">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>Resolución Táctica Submétrica</span>
              <span>Tier Gratuito: 250K req/m</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
