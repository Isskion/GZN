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
} from 'lucide-react';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';
import { IncidentTape, IncidentItem } from '@/components/industry/IncidentTape';

export interface CountryData {
  id: string; // ISO 3166 numeric id matching TopoJSON
  name: string;
  city: string;
  tier: 'crit' | 'high' | 'watch' | 'stable';
  note: string;
  haven: string;
  peopleCount: number;
}

const COUNTRIES_SPEC: CountryData[] = [
  { id: '368', name: 'Irak', city: 'Bagdad', tier: 'crit', note: 'Escolta obligatoria. Movimiento nocturno prohibido.', haven: 'Complejo diplomático · Zona Verde', peopleCount: 2 },
  { id: '466', name: 'Malí', city: 'Bamako', tier: 'crit', note: 'Riesgo de secuestro en carretera N6. Solo vuelo interno.', haven: 'Base MINUSMA · Sévaré', peopleCount: 1 },
  { id: '804', name: 'Ucrania', city: 'Kiev', tier: 'crit', note: 'Alarma aérea activa 3 veces en 24 h.', haven: 'Refugio Lukianivska', peopleCount: 1 },
  { id: '404', name: 'Kenia', city: 'Nairobi', tier: 'high', note: 'Manifestaciones en CBD. Toque de queda no oficial 20:00.', haven: 'Embajada · Gigiri', peopleCount: 4 },
  { id: '566', name: 'Nigeria', city: 'Lagos', tier: 'high', note: 'Robo con violencia en Victoria Island tras el anochecer.', haven: 'Hotel homologado · Ikoyi', peopleCount: 1 },
  { id: '170', name: 'Colombia', city: 'Bogotá', tier: 'watch', note: 'Paro de transporte previsto el jueves.', haven: 'Oficina regional · Chapinero', peopleCount: 1 },
  { id: '484', name: 'México', city: 'CDMX', tier: 'watch', note: 'Extorsión telefónica al alza en el sector.', haven: 'Oficina regional · Polanco', peopleCount: 1 },
  { id: '360', name: 'Indonesia', city: 'Yakarta', tier: 'watch', note: 'Inundación estacional en Kelapa Gading.', haven: 'Hotel homologado · Sudirman', peopleCount: 1 },
  { id: '710', name: 'Sudáfrica', city: 'Johannesburgo', tier: 'stable', note: 'Sin incidencias en 30 días.', haven: 'Oficina · Sandton', peopleCount: 1 },
  { id: '784', name: 'Emiratos Árabes', city: 'Dubái', tier: 'stable', note: 'Sin incidencias en 30 días.', haven: 'Oficina · DIFC', peopleCount: 1 },
];

const TIER_COLORS: Record<CountryData['tier'], string> = {
  crit: 'var(--risk-crit)',
  high: 'var(--risk-high)',
  watch: 'var(--risk-watch)',
  stable: 'var(--risk-stable)',
};

const TIER_LABELS: Record<CountryData['tier'], string> = {
  crit: 'CRÍTICO',
  high: 'ALTO',
  watch: 'ATENCIÓN',
  stable: 'NOMINAL',
};

interface SituacionScreenProps {
  onSelectIncident?: (incident: IncidentItem) => void;
  onNavigateTerreno?: () => void;
}

export const SituacionScreen: React.FC<SituacionScreenProps> = ({
  onSelectIncident,
  onNavigateTerreno,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>('404');
  const [worldTopology, setWorldTopology] = useState<any>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const incidents: IncidentItem[] = [
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
  ];

  // Cargar TopoJSON una sola vez
  useEffect(() => {
    fetch('/data/countries-110m.json')
      .then((res) => res.json())
      .then((data) => setWorldTopology(data))
      .catch((err) => console.error('Error al cargar TopoJSON:', err));
  }, []);

  // Dibujar mapa D3 Natural Earth
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
      .attr('stroke-opacity', 0.2);

    // Retícula (graticule)
    svg
      .append('path')
      .attr('d', pathGenerator(d3.geoGraticule10()) as string)
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-text)')
      .attr('stroke-opacity', 0.08);

    const byId = Object.fromEntries(COUNTRIES_SPEC.map((c) => [c.id, c]));

    // Polígonos de países
    svg
      .append('g')
      .selectAll('path')
      .data(feats)
      .join('path')
      .attr('d', pathGenerator as any)
      .attr('fill', (d: any) => (byId[d.id] ? TIER_COLORS[byId[d.id].tier] : 'none'))
      .attr('fill-opacity', (d: any) => {
        if (!byId[d.id]) return 0;
        if (selectedCountryId && selectedCountryId !== d.id) return 0.35;
        return 0.82;
      })
      .attr('stroke', 'var(--color-text)')
      .attr('stroke-opacity', (d: any) => (byId[d.id] ? 0.6 : 0.18))
      .attr('stroke-width', (d: any) => (selectedCountryId === d.id ? 1.4 : 0.7))
      .style('cursor', (d: any) => (byId[d.id] ? 'pointer' : 'default'))
      .on('mousemove', (e: MouseEvent, d: any) => {
        const c = byId[d.id];
        if (!c) return;
        setTooltip({
          x: e.clientX + 12,
          y: e.clientY - 10,
          text: `${c.name} · ${TIER_LABELS[c.tier]} · ${c.peopleCount} personas`,
        });
      })
      .on('mouseleave', () => setTooltip(null))
      .on('click', (_: MouseEvent, d: any) => {
        if (byId[d.id]) {
          setSelectedCountryId((prev) => (prev === d.id ? null : d.id));
        }
      });

    // Marcadores con conteo de personal en centroides
    const countryCentroids = COUNTRIES_SPEC.map((c) => {
      const f = feats.find((feat: any) => feat.id === c.id);
      if (!f) return null;
      const p = pathGenerator.centroid(f);
      return { ...c, x: p[0], y: p[1] };
    }).filter(Boolean);

    const markerGroup = svg
      .append('g')
      .selectAll('g')
      .data(countryCentroids)
      .join('g')
      .attr('transform', (c: any) => `translate(${c.x},${c.y})`)
      .style('cursor', 'pointer')
      .on('click', (_: MouseEvent, c: any) => setSelectedCountryId(c.id));

    markerGroup
      .append('circle')
      .attr('r', 3.5)
      .attr('fill', 'var(--color-bg)')
      .attr('stroke', 'var(--color-text)')
      .attr('stroke-width', 1.2);

    markerGroup
      .append('text')
      .attr('x', 7)
      .attr('y', 3.5)
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', 'bold')
      .attr('fill', 'var(--color-text)')
      .attr('opacity', 0.85)
      .text((c: any) => c.peopleCount);
  }, [worldTopology, selectedCountryId]);

  const selectedCountry = COUNTRIES_SPEC.find((c) => c.id === selectedCountryId);

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

      {/* Cabecera Informativa con Rótulo Explícito de Simulación */}
      <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3 flex-none">
        <div>
          <span className="kicker">Panorama Estratégico Global</span>
          <h2 className="font-heading font-semibold text-lg m-0 tracking-wide uppercase">
            Consola Macro de Operaciones y Teatros
          </h2>
        </div>
        <div className="tag tag-watch text-xs font-semibold font-mono">
          VISTA MACRO: DATOS DE MUESTRA (SIMULACIÓN OPSEC)
        </div>
      </div>

      {/* Panel Superior: KPIs de Situación Global */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-none">
        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker">Personal en Tránsito</span>
          <b className="block font-heading text-3xl font-semibold mt-1">14</b>
          <span className="text-[10px] opacity-60 font-mono">10 TEATROS CON COBERTURA</span>
        </BlueprintPlate>

        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker text-[var(--risk-crit)]">En Riesgo Crítico</span>
          <b className="block font-heading text-3xl font-semibold mt-1 text-[var(--risk-crit)]">4</b>
          <span className="text-[10px] opacity-60 font-mono">IRAK · MALÍ · UCRANIA</span>
        </BlueprintPlate>

        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker">Geocercas Activas</span>
          <b className="block font-heading text-3xl font-semibold mt-1">18</b>
          <span className="text-[10px] opacity-60 font-mono">POSTGIS RPC ONLINE</span>
        </BlueprintPlate>

        <BlueprintPlate className="p-3 bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)]">
          <span className="kicker text-[var(--color-accent)]">Nivel de Amenaza Global</span>
          <b className="block font-heading text-3xl font-semibold mt-1 text-[var(--color-accent)]">ELEVADO</b>
          <span className="text-[10px] opacity-60 font-mono">CONDICIÓN DEF-CON 3</span>
        </BlueprintPlate>
      </div>

      {/* Panel Central: Mapa D3 + Detalle de País */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[340px]">
        {/* Mapa D3 Natural Earth */}
        <BlueprintPlate
          kicker="Visor Estratégico D3 Natural Earth"
          title="Despliegue Territorial Global"
          className="lg:col-span-2 flex flex-col p-3 bg-[color-mix(in_srgb,var(--color-surface)_25%,transparent)] min-h-[300px] relative overflow-hidden"
        >
          <div
            ref={mapContainerRef}
            className="flex-1 w-full h-full min-h-[260px] relative border border-[var(--color-divider)] rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-bg)_60%,transparent)]"
          />
          <div className="flex items-center justify-between mt-2 text-[10px] font-mono opacity-70">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--risk-crit)]" /> Crítico
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--risk-high)]" /> Alto
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--risk-watch)]" /> Atención
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--risk-stable)]" /> Nominal
              </span>
            </div>
            <span>D3.js + TopoJSON 110m</span>
          </div>
        </BlueprintPlate>

        {/* Ficha de País / Lista de Teatros */}
        <BlueprintPlate
          kicker={selectedCountry ? `Ficha de Teatro · ${selectedCountry.name}` : 'Teatros de Operaciones'}
          title={selectedCountry ? selectedCountry.city : 'Seleccione un País'}
          className="flex flex-col p-3 bg-[color-mix(in_srgb,var(--color-surface)_25%,transparent)] overflow-hidden"
        >
          {selectedCountry ? (
            <div className="flex flex-col h-full justify-between gap-3 text-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-2">
                  <span className="font-heading font-bold text-sm uppercase">
                    {selectedCountry.name}
                  </span>
                  <span
                    className="tag text-[9px]"
                    style={{
                      borderColor: TIER_COLORS[selectedCountry.tier],
                      color: TIER_COLORS[selectedCountry.tier],
                    }}
                  >
                    {TIER_LABELS[selectedCountry.tier]}
                  </span>
                </div>

                <div>
                  <span className="kicker block mb-1">Directiva / Nota RSO</span>
                  <p className="text-[11px] leading-relaxed opacity-85">
                    {selectedCountry.note}
                  </p>
                </div>

                <div className="p-2 rounded-[var(--radius-sm)] bg-[var(--color-bg)] border border-[var(--color-divider)]">
                  <span className="kicker block text-[9px] mb-0.5 text-[var(--risk-stable)]">
                    Refugio Seguro Designado
                  </span>
                  <span className="font-semibold text-xs">{selectedCountry.haven}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono border-t border-[var(--color-divider)] pt-2">
                  <span className="opacity-60">Personal activo:</span>
                  <span className="font-bold">{selectedCountry.peopleCount} expatriados</span>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--color-divider)] flex items-center gap-2">
                {onNavigateTerreno && (
                  <button
                    type="button"
                    onClick={onNavigateTerreno}
                    className="btn btn-secondary text-xs flex-1 flex items-center justify-center gap-1 py-1.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Abrir Terreno</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCountryId(null)}
                  className="btn btn-secondary text-xs px-2.5 py-1.5"
                >
                  Ver Todos
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-divider)] overflow-y-auto max-h-[300px]">
              {COUNTRIES_SPEC.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCountryId(c.id)}
                  className="p-2 hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <div className="font-heading font-semibold text-xs">{c.name}</div>
                    <div className="text-[10px] opacity-60">{c.city}</div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span
                      className="tag text-[8px]"
                      style={{ borderColor: TIER_COLORS[c.tier], color: TIER_COLORS[c.tier] }}
                    >
                      {TIER_LABELS[c.tier]}
                    </span>
                    <span className="font-mono text-[9px] opacity-60">
                      {c.peopleCount} pers.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BlueprintPlate>
      </div>

      {/* Panel Inferior: Cinta de Incidentes (Feed Táctico Sala) */}
      <div className="h-44 flex-none">
        <IncidentTape incidents={incidents} onSelectIncident={onSelectIncident} />
      </div>
    </div>
  );
};
