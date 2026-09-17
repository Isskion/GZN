'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import {
  Globe,
  Users,
  AlertTriangle,
  ChevronRight,
  Shield,
  MapPin,
  Clock,
  Radio,
  ExternalLink,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';
import { ZoneType, ZoneSeverity } from '@/types/database';

interface SituacionScreenProps {
  onNavigateTerreno?: (zoneId?: string) => void;
  onSelectIncident?: (incident: any) => void;
}

export const SituacionScreen: React.FC<SituacionScreenProps> = ({
  onNavigateTerreno,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [worldTopology, setWorldTopology] = useState<any>(null);
  const [zonesData, setZonesData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [travelersCount, setTravelersCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Cargar TopoJSON cartográfico base
  useEffect(() => {
    fetch('/data/countries-110m.json')
      .then((res) => res.json())
      .then((data) => setWorldTopology(data))
      .catch((err) => console.error('Error al cargar TopoJSON:', err));
  }, []);

  // Cargar Zonas reales desde GET /api/zones y Viajeros desde GET /api/travelers
  const loadRealData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [zonesRes, travelersRes] = await Promise.all([
        fetch('/api/zones'),
        fetch('/api/travelers?limit=100'),
      ]);

      if (zonesRes.ok) {
        const data = await zonesRes.json();
        setZonesData(data);
        if (data.features && data.features.length > 0 && !selectedZoneId) {
          setSelectedZoneId(data.features[0].id || data.features[0].properties?.id);
        }
      }

      if (travelersRes.ok) {
        const travData = await travelersRes.json();
        setTravelersCount((travData.data || []).length);
      }
    } catch (err: any) {
      console.error('Error cargando datos reales en SituacionScreen:', err);
      setError('Fallo de conexión al cargar las áreas operativas del servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRealData();
  }, []);

  const features = zonesData?.features || [];

  // Dibujar mapa D3 Natural Earth con las geometrías de zonas reales proyectadas
  useEffect(() => {
    const host = mapContainerRef.current;
    if (!host || !worldTopology) return;

    const width = host.clientWidth || 600;
    const height = host.clientHeight || 340;
    if (width < 50 || height < 50) return;

    const countriesGeo: any = topojson.feature(
      worldTopology,
      worldTopology.objects.countries
    );
    const feats: any[] = countriesGeo.features || [];

    const projection = d3
      .geoNaturalEarth1()
      .fitExtent([[16, 16], [width - 16, height - 16]], {
        type: 'FeatureCollection',
        features: feats,
      } as any);

    const pathGenerator = d3.geoPath(projection);

    d3.select(host).selectAll('svg').remove();

    const svg = d3
      .select(host)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block');

    // Esfera del globo
    svg
      .append('path')
      .attr('d', pathGenerator({ type: 'Sphere' }) as string)
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-text)')
      .attr('stroke-opacity', 0.15);

    // Retícula (graticule)
    svg
      .append('path')
      .attr('d', pathGenerator(d3.geoGraticule10()) as string)
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-text)')
      .attr('stroke-opacity', 0.06);

    // 1. Capa base de países (siluetas neutras continuas)
    svg
      .append('g')
      .selectAll('path')
      .data(feats)
      .join('path')
      .attr('d', pathGenerator as any)
      .attr('fill', 'color-mix(in srgb, var(--color-surface) 60%, transparent)')
      .attr('stroke', 'var(--color-text)')
      .attr('stroke-opacity', 0.12)
      .attr('stroke-width', 0.6);

    // 2. Proyección de ZONAS REALES del tenant
    if (features.length > 0) {
      const zoneGroup = svg.append('g').attr('class', 'gzn-real-zones');

      zoneGroup
        .selectAll('path')
        .data(features)
        .join('path')
        .attr('d', pathGenerator as any)
        .attr('fill', (d: any) => {
          const isResp = d.properties?.zone_type === 'RESPONSIBILITY';
          if (isResp) return '#5980a6';
          const sev = d.properties?.severity;
          if (sev === 'RED') return 'var(--risk-crit)';
          if (sev === 'AMBER') return 'var(--risk-high)';
          if (sev === 'SAFE_HAVEN') return 'var(--risk-stable)';
          if (sev === 'CORRIDOR') return 'var(--risk-watch)';
          return '#5980a6';
        })
        .attr('fill-opacity', (d: any) => {
          const isSelected = (d.id || d.properties?.id) === selectedZoneId;
          const isResp = d.properties?.zone_type === 'RESPONSIBILITY';
          if (isResp) return isSelected ? 0.35 : 0.18;
          return isSelected ? 0.65 : 0.40;
        })
        .attr('stroke', (d: any) => {
          const isResp = d.properties?.zone_type === 'RESPONSIBILITY';
          if (isResp) return '#5980a6';
          const sev = d.properties?.severity;
          if (sev === 'RED') return 'var(--risk-crit)';
          if (sev === 'AMBER') return 'var(--risk-high)';
          return '#5980a6';
        })
        .attr('stroke-opacity', 0.85)
        .attr('stroke-width', (d: any) => {
          const isSelected = (d.id || d.properties?.id) === selectedZoneId;
          return isSelected ? 2.2 : 1.2;
        })
        .style('cursor', 'pointer')
        .on('mousemove', (e: MouseEvent, d: any) => {
          const p = d.properties || {};
          const isResp = p.zone_type === 'RESPONSIBILITY';
          setTooltip({
            x: e.clientX + 12,
            y: e.clientY - 10,
            text: `${p.name || 'Área'} · [${isResp ? 'CONTROL' : p.severity}]`,
          });
        })
        .on('mouseleave', () => setTooltip(null))
        .on('click', (_: MouseEvent, d: any) => {
          const zId = d.id || d.properties?.id;
          setSelectedZoneId((prev) => (prev === zId ? null : zId));
        });

      // 3. Marcadores de centroides en zonas reales para facilitar selección táctica
      const centroids = features
        .map((f: any) => {
          try {
            const p = pathGenerator.centroid(f);
            if (!isNaN(p[0]) && !isNaN(p[1])) {
              return { f, x: p[0], y: p[1] };
            }
          } catch {
            return null;
          }
          return null;
        })
        .filter(Boolean);

      const markers = svg
        .append('g')
        .selectAll('g')
        .data(centroids)
        .join('g')
        .attr('transform', (c: any) => `translate(${c.x},${c.y})`)
        .style('cursor', 'pointer')
        .on('click', (_: MouseEvent, c: any) => {
          setSelectedZoneId(c.f.id || c.f.properties?.id);
        });

      markers
        .append('circle')
        .attr('r', 4)
        .attr('fill', (c: any) => (c.f.properties?.zone_type === 'RESPONSIBILITY' ? '#5980a6' : 'var(--risk-high)'))
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.2);
    }
  }, [worldTopology, zonesData, selectedZoneId, features]);

  const selectedZone = features.find(
    (f: any) => (f.id || f.properties?.id) === selectedZoneId
  );
  const selectedProps = selectedZone?.properties;
  const isSelectedControl = selectedProps?.zone_type === 'RESPONSIBILITY';

  // Contadores agregados
  const controlZonesCount = features.filter((f: any) => f.properties?.zone_type === 'RESPONSIBILITY').length;
  const threatZonesCount = features.filter((f: any) => f.properties?.zone_type !== 'RESPONSIBILITY').length;

  return (
    <div className="situacion flex flex-col h-full min-h-0 bg-[var(--color-bg)] text-[var(--color-text)] p-4 gap-4 overflow-y-auto font-body">
      {/* Tooltip flotante */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 px-2.5 py-1 bg-[var(--color-text)] text-[var(--color-bg)] rounded-[var(--radius-sm)] text-[11px] font-mono shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Cabecera Informativa Conectada */}
      <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3 flex-none">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-[var(--color-accent)]" />
          <div>
            <h1 className="font-heading text-base font-semibold uppercase tracking-wide">
              Situación Global // Teatros Operativos y Áreas Tácticas
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
              Consolidación cartográfica WGS84 de zonas activas registradas en la organización
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
            <span>Teatros de Control: <b>{controlZonesCount}</b></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Áreas de Peligro: <b>{threatZonesCount}</b></span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span>Viajeros Monitoreados: <b>{travelersCount}</b></span>
          </div>
          <button
            type="button"
            onClick={loadRealData}
            title="Refrescar datos"
            className="p-1 border border-[var(--color-divider)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cuerpo Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 flex-1 min-h-0">
        {/* Visualización Cartográfica Mundial D3 */}
        <BlueprintPlate
          variant="panel"
          kicker="Cartografía Operativa"
          title="Proyección Global de Zonas (Natural Earth)"
          className="flex flex-col min-h-[380px] relative overflow-hidden"
        >
          {features.length === 0 && !isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-black/40 backdrop-blur-[2px] text-center">
              <Shield className="w-10 h-10 text-[var(--color-accent)] opacity-60 mb-2" />
              <div className="text-sm font-heading font-bold uppercase tracking-wider">
                SITUACIÓN GLOBAL NOMINAL
              </div>
              <p className="text-xs font-mono text-[var(--color-text-muted)] max-w-md mt-1 mb-4">
                No hay zonas tácticas delimitadas todavía en esta organización. Utilice el botón [ + NUEVA ÁREA ] para registrar teatros de operaciones o perímetros de riesgo.
              </p>
              {onNavigateTerreno && (
                <button
                  type="button"
                  onClick={() => onNavigateTerreno?.()}
                  className="px-4 py-2 border border-[var(--color-accent)] text-[var(--color-accent)] text-xs font-heading font-bold uppercase tracking-wider hover:bg-[var(--color-accent)]/15 transition-colors flex items-center gap-1.5"
                >
                  <MapPin className="w-4 h-4" />
                  Ir a Terreno para Delimitar
                </button>
              )}
            </div>
          )}

          <div ref={mapContainerRef} className="flex-1 w-full h-full min-h-[320px]" />

          {/* Leyenda Táctica del Mapa Mundial */}
          <div className="flex items-center justify-between border-t border-[var(--color-divider)] pt-2 mt-2 text-[10px] font-mono text-[var(--color-text-muted)]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-[#5980a6]/30 border border-[#5980a6]" />
                Zona de Control (Responsabilidad RSO)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-[var(--risk-crit)]/40 border border-[var(--risk-crit)]" />
                Área de Peligro (Amenaza Táctica)
              </span>
            </div>
            <span>* Haga clic en un área para inspeccionar sus directivas</span>
          </div>
        </BlueprintPlate>

        {/* Panel Lateral de Detalle Táctico de la Zona Seleccionada */}
        <BlueprintPlate
          variant="panel"
          kicker="Ficha Operativa"
          title={selectedProps ? (isSelectedControl ? 'Teatro de Control' : 'Área de Peligro') : 'Selección de Área'}
          className="flex flex-col min-h-[380px]"
        >
          {selectedProps ? (
            <div className="flex flex-col h-full justify-between space-y-4">
              <div className="space-y-3">
                {/* Cabecera de la ficha */}
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 border ${
                        isSelectedControl
                          ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                          : 'border-amber-500 text-amber-400 bg-amber-500/10'
                      }`}
                    >
                      {isSelectedControl ? '🛡️ ZONA DE CONTROL' : `⚠️ AMENAZA [${selectedProps.severity}]`}
                    </span>
                    <span className="text-[10px] font-mono opacity-50">
                      ID: {String(selectedZone?.id || selectedProps.id).slice(0, 8)}...
                    </span>
                  </div>

                  <h3 className="text-base font-heading font-bold uppercase tracking-wider mt-2 text-[var(--color-text)]">
                    {selectedProps.name}
                  </h3>

                  {selectedProps.description && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">
                      {selectedProps.description}
                    </p>
                  )}
                </div>

                {/* Parámetros Operativos Reales */}
                <div className="border-t border-[var(--color-divider)] pt-3 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">Severidad:</span>
                    <span className="font-bold text-[var(--color-accent)]">
                      {selectedProps.severity}
                    </span>
                  </div>

                  {selectedProps.assigned_rso_id && (
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">RSO Responsable:</span>
                      <span className="font-bold text-[var(--color-text)]">
                        Asignado (ID: {String(selectedProps.assigned_rso_id).slice(0, 8)}...)
                      </span>
                    </div>
                  )}

                  {selectedProps.buffer_meters > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">Buffer Perimetral:</span>
                      <span>{selectedProps.buffer_meters} m</span>
                    </div>
                  )}

                  {selectedProps.is_curfew && (
                    <div className="p-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
                      <span className="font-bold block">⚠️ RESTRICCIÓN TOQUE DE QUEDA</span>
                      <span>Horario activo: {selectedProps.curfew_start || '22:00'} - {selectedProps.curfew_end || '06:00'} UTC</span>
                    </div>
                  )}

                  {selectedProps.radio_frequency && (
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">Radio Táctica:</span>
                      <span>{selectedProps.radio_frequency}</span>
                    </div>
                  )}

                  {selectedProps.contact_phone && (
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">Contacto Emergencia:</span>
                      <span>{selectedProps.contact_phone}</span>
                    </div>
                  )}

                  {selectedProps.gate_access_protocol && (
                    <div className="pt-2 border-t border-[var(--color-divider)] text-[11px]">
                      <span className="opacity-70 block mb-0.5">Protocolo de Acceso:</span>
                      <span className="text-[var(--color-text)]">{selectedProps.gate_access_protocol}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Botón para saltar a Terreno */}
              <div className="pt-3 border-t border-[var(--color-divider)]">
                {onNavigateTerreno && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedZoneId && onNavigateTerreno) {
                        onNavigateTerreno(selectedZoneId);
                      } else {
                        onNavigateTerreno?.();
                      }
                    }}
                    className="w-full py-2 bg-[var(--color-surface)] border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-xs font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors flex items-center justify-center gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    Inspeccionar en Terreno
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-60 font-mono text-xs">
              <Layers className="w-8 h-8 mb-2 opacity-50" />
              <span>Seleccione un área en el mapa mundial para consultar su ficha táctica.</span>
            </div>
          )}
        </BlueprintPlate>
      </div>
    </div>
  );
};
