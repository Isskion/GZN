'use client';

import React, { useState, useEffect, useMemo } from 'react';
import * as topojson from 'topojson-client';
import {
  Globe,
  Radio as RadioIcon,
  Pentagon,
  X,
  AlertTriangle,
  Shield,
  Clock,
  Phone,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
} from 'lucide-react';
import {
  generateGeodesicCircle,
  extractMainContinentPolygon,
  closeDrawnPolygon,
  calculateRingAreaKm2,
  ExtractedCountryGeometry,
} from '@/lib/geo/tactical-zones';
import { validateGeoJSONPolygon } from '@/lib/geo/validation';

export type DelimitationMode = 'country' | 'radius' | 'freehand';
export type TacticalSeverity = 'RED' | 'AMBER' | 'SAFE_HAVEN' | 'CORRIDOR';

interface ZoneCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onZoneCreated: (newZone: any) => void;
  initialCenter?: [number, number]; // [lng, lat]
}

const SEVERITY_CONFIG: Record<
  TacticalSeverity,
  { label: string; kicker: string; color: string; desc: string }
> = {
  RED: {
    label: 'ZONA ROJA',
    kicker: 'HOSTIL / PROHIBIDO',
    color: 'var(--risk-crit)',
    desc: 'Combates activos o amenaza letal. Tránsito vetado sin convoy táctico pesado.',
  },
  AMBER: {
    label: 'ZONA ÁMBAR',
    kicker: 'ALERTA / ESCOLTA',
    color: 'var(--risk-high)',
    desc: 'Riesgo elevado. Restricción de movimiento y escolta de seguridad obligatoria.',
  },
  SAFE_HAVEN: {
    label: 'REFUGIO SEGURO',
    kicker: 'BASE / EXTRACCIÓN',
    color: 'var(--risk-stable)',
    desc: 'Punto seguro homologado, complejo diplomático o base C2 con soporte médico.',
  },
  CORRIDOR: {
    label: 'CORREDOR TÁCTICO',
    kicker: 'VÍA DE TRÁNSITO',
    color: 'var(--risk-watch)',
    desc: 'Ruta principal de evacuación o corredor logístico bajo monitoreo constante.',
  },
};

export const ZoneCreationModal: React.FC<ZoneCreationModalProps> = ({
  isOpen,
  onClose,
  onZoneCreated,
  initialCenter = [-3.7038, 40.4168],
}) => {
  const [mode, setMode] = useState<DelimitationMode>('country');

  // Formulario táctico
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<TacticalSeverity>('RED');
  const [description, setDescription] = useState('');
  const [bufferMeters, setBufferMeters] = useState(500);
  const [isCurfew, setIsCurfew] = useState(false);
  const [curfewStart, setCurfewStart] = useState('22:00');
  const [curfewEnd, setCurfewEnd] = useState('06:00');
  const [contactPhone, setContactPhone] = useState('');
  const [radioFrequency, setRadioFrequency] = useState('');
  const [gateAccessProtocol, setGateAccessProtocol] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Estado TopoJSON para Modalidad A (País)
  const [worldTopology, setWorldTopology] = useState<any>(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountryId, setSelectedCountryId] = useState<string>('');
  const [selectedCountryName, setSelectedCountryName] = useState<string>('');
  const [countryExtraction, setCountryExtraction] = useState<ExtractedCountryGeometry | null>(null);

  // Estado para Modalidad B (Radio Táctico)
  const [centerLng, setCenterLng] = useState(initialCenter[0]);
  const [centerLat, setCenterLat] = useState(initialCenter[1]);
  const [radiusKm, setRadiusKm] = useState(15);

  // Estado para Modalidad C (Polígono Libre / Vértices WGS84)
  const [rawCoordinatesText, setRawCoordinatesText] = useState(
    '-3.7100, 40.4200\n-3.6900, 40.4200\n-3.6900, 40.4100\n-3.7100, 40.4100'
  );

  // Estado de procesamiento y error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Cargar dataset TopoJSON de países
  useEffect(() => {
    if (!worldTopology) {
      fetch('/data/countries-110m.json')
        .then((res) => res.json())
        .then((data) => setWorldTopology(data))
        .catch((err) => console.error('Error cargando países TopoJSON:', err));
    }
  }, [worldTopology]);

  // Lista filtrada de países disponibles
  const countryList = useMemo(() => {
    if (!worldTopology || !worldTopology.objects?.countries?.geometries) return [];
    const geoms: any[] = worldTopology.objects.countries.geometries;
    const items = geoms
      .map((g) => ({
        id: String(g.id),
        name: g.properties?.name || `País ${g.id}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!countrySearch.trim()) return items;
    const query = countrySearch.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [worldTopology, countrySearch]);

  // Seleccionar país y extraer su polígono continental principal
  const handleSelectCountry = (cId: string, cName: string) => {
    setSelectedCountryId(cId);
    setSelectedCountryName(cName);
    if (!name || name.startsWith('Teatro Operativo -')) {
      setName(`Teatro Operativo - ${cName}`);
    }

    if (!worldTopology) return;
    try {
      const geom = worldTopology.objects.countries.geometries.find(
        (g: any) => String(g.id) === cId
      );
      if (!geom) return;

      const feature: any = topojson.feature(worldTopology, geom);
      const extraction = extractMainContinentPolygon(feature.geometry);
      setCountryExtraction(extraction);
    } catch (err) {
      console.error('Error extrayendo polígono de país:', err);
    }
  };

  // Calcular la geometría activa según la modalidad seleccionada
  const activeGeometry: GeoJSON.Polygon | null = useMemo(() => {
    if (mode === 'country') {
      return countryExtraction ? countryExtraction.polygon : null;
    }

    if (mode === 'radius') {
      if (isNaN(centerLng) || isNaN(centerLat) || radiusKm <= 0) return null;
      return generateGeodesicCircle(centerLng, centerLat, radiusKm, 64);
    }

    if (mode === 'freehand') {
      // Parsear líneas de texto [lng, lat]
      const lines = rawCoordinatesText.trim().split('\n');
      const pts: [number, number][] = [];
      for (const line of lines) {
        const parts = line.split(',').map((p) => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          pts.push([parts[0], parts[1]]);
        }
      }
      return closeDrawnPolygon(pts);
    }

    return null;
  }, [mode, countryExtraction, centerLng, centerLat, radiusKm, rawCoordinatesText]);

  // Superficie estimada
  const estimatedAreaKm2 = useMemo(() => {
    if (!activeGeometry || !activeGeometry.coordinates[0]) return 0;
    return calculateRingAreaKm2(activeGeometry.coordinates[0]);
  }, [activeGeometry]);

  // Validar y enviar
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('El nombre del área táctica es obligatorio.');
      return;
    }

    if (!activeGeometry) {
      setSubmitError('No se ha podido generar una geometría GeoJSON válida para la zona.');
      return;
    }

    const validation = validateGeoJSONPolygon(activeGeometry);
    if (!validation.valid) {
      setSubmitError(`Geometría inválida: ${validation.error}`);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        severity,
        geojson_geometry: activeGeometry,
        buffer_meters: bufferMeters,
        is_curfew: isCurfew,
        curfew_start: isCurfew ? curfewStart : null,
        curfew_end: isCurfew ? curfewEnd : null,
        contact_phone: contactPhone.trim() || null,
        radio_frequency: radioFrequency.trim() || null,
        gate_access_protocol: gateAccessProtocol.trim() || null,
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      };

      const response = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Fallo en la creación de la zona');
      }

      onZoneCreated(result.zone);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Error de conexión al registrar el área');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-zone-title"
    >
      <div className="blueprint relative w-full max-w-3xl bg-[var(--color-bg)] border border-[var(--color-divider)] shadow-2xl p-6 text-[var(--color-text)] my-8">
        {/* Marcas de esquina Blueprint */}
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />

        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between border-b border-[var(--color-divider)] pb-4 mb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-accent)] block mb-1">
              GZN // C2 OPERATIVO · CONTROL DE ÁREAS
            </span>
            <h2
              id="modal-zone-title"
              className="text-xl font-heading font-semibold uppercase tracking-wide flex items-center gap-2"
            >
              <Shield className="w-5 h-5 text-[var(--color-accent)]" />
              Delimitación de Área / Zona Táctica
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de creación"
            className="w-8 h-8 flex items-center justify-center border border-[var(--color-divider)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitError && (
          <div className="mb-4 p-3 bg-[color-mix(in_srgb,var(--risk-crit)_15%,transparent)] border border-[var(--risk-crit)] text-xs text-[var(--color-text)] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--risk-crit)] shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selector de Modalidad (3 pestañas técnicas) */}
          <div>
            <label className="text-[11px] font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] opacity-70 block mb-2">
              Modalidad de Delimitación Geométrica
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('country')}
                className={`py-2.5 px-3 flex flex-col items-center justify-center gap-1 border transition-all text-center ${
                  mode === 'country'
                    ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-semibold text-[var(--color-accent)]'
                    : 'border-[var(--color-divider)] hover:border-[var(--color-text)] opacity-60 hover:opacity-100'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span className="text-xs uppercase font-heading">1. Por País</span>
                <span className="text-[9px] font-mono opacity-70">Frontera TopoJSON</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('radius')}
                className={`py-2.5 px-3 flex flex-col items-center justify-center gap-1 border transition-all text-center ${
                  mode === 'radius'
                    ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-semibold text-[var(--color-accent)]'
                    : 'border-[var(--color-divider)] hover:border-[var(--color-text)] opacity-60 hover:opacity-100'
                }`}
              >
                <RadioIcon className="w-4 h-4" />
                <span className="text-xs uppercase font-heading">2. Región / Radio</span>
                <span className="text-[9px] font-mono opacity-70">Buffer Geodésico</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('freehand')}
                className={`py-2.5 px-3 flex flex-col items-center justify-center gap-1 border transition-all text-center ${
                  mode === 'freehand'
                    ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-semibold text-[var(--color-accent)]'
                    : 'border-[var(--color-divider)] hover:border-[var(--color-text)] opacity-60 hover:opacity-100'
                }`}
              >
                <Pentagon className="w-4 h-4" />
                <span className="text-xs uppercase font-heading">3. Polígono Libre</span>
                <span className="text-[9px] font-mono opacity-70">Vértices WGS84</span>
              </button>
            </div>
          </div>

          {/* Panel de Configuración según Modalidad */}
          <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-divider)] space-y-4">
            {mode === 'country' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-heading font-semibold uppercase tracking-wider">
                    Catálogo de Países Oficiales (Natural Earth 110m)
                  </span>
                  <span className="text-[10px] font-mono opacity-60">
                    {countryList.length} PAÍSES
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 opacity-50" />
                  <input
                    type="text"
                    placeholder="Filtrar por nombre (ej: Ukraine, Colombia, Nigeria, Iraq, Kenya)..."
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono placeholder:opacity-40 focus:outline-none focus:border-[var(--color-accent)]"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto border border-[var(--color-divider)] divide-y divide-[var(--color-divider)] bg-[var(--color-bg)]">
                  {countryList.slice(0, 15).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCountry(c.id, c.name)}
                      className={`w-full text-left px-3 py-2 text-xs font-mono flex items-center justify-between hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] transition-colors ${
                        selectedCountryId === c.id
                          ? 'bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] font-semibold text-[var(--color-accent)]'
                          : ''
                      }`}
                    >
                      <span>{c.name}</span>
                      {selectedCountryId === c.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>

                {/* Mandato Claude: Aviso obligatorio de simplificación territorial */}
                {countryExtraction?.isSimplified && (
                  <div className="p-3 bg-[color-mix(in_srgb,var(--risk-high)_12%,transparent)] border border-[var(--risk-high)] text-xs text-[var(--color-text)] flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-[var(--risk-high)] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-heading font-semibold uppercase tracking-wider text-[var(--risk-high)] block">
                        Aviso Operativo de Delimitación
                      </span>
                      <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                        Esta delimitación representa el territorio continental principal de{' '}
                        <strong>{selectedCountryName}</strong>.{' '}
                        <span className="font-mono text-[var(--risk-high)]">
                          {countryExtraction.excludedCount}
                        </span>{' '}
                        enclaves o islas quedan fuera del perímetro geométrico registrado.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === 'radius' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider block mb-1 opacity-70">
                      Longitud Centro (WGS84)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={centerLng}
                      onChange={(e) => setCenterLng(parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider block mb-1 opacity-70">
                      Latitud Centro (WGS84)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={centerLat}
                      onChange={(e) => setCenterLat(parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider opacity-70">
                      Radio Táctico Operativo
                    </label>
                    <span className="text-xs font-mono font-bold text-[var(--color-accent)]">
                      {radiusKm} km
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--color-accent)] cursor-pointer"
                  />
                  <div className="flex justify-between gap-2 mt-2">
                    {[5, 15, 25, 50, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRadiusKm(val)}
                        className={`px-2 py-1 text-[10px] font-mono border ${
                          radiusKm === val
                            ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]'
                            : 'border-[var(--color-divider)] hover:border-[var(--color-text)] opacity-70'
                        }`}
                      >
                        {val} km
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {mode === 'freehand' && (
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block">
                  Vértices de Polígono (Lng, Lat por línea · Mínimo 3 vértices)
                </label>
                <textarea
                  rows={4}
                  value={rawCoordinatesText}
                  onChange={(e) => setRawCoordinatesText(e.target.value)}
                  className="w-full p-2.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono leading-relaxed focus:outline-none focus:border-[var(--color-accent)]"
                  placeholder="-3.7100, 40.4200&#10;-3.6900, 40.4200&#10;-3.6900, 40.4100&#10;-3.7100, 40.4100"
                />
                <span className="text-[10px] font-mono opacity-50 block">
                  El sistema cierra automáticamente el polígono uniendo el último vértice con el primero.
                </span>
              </div>
            )}

            {/* Ficha métrica de la geometría generada */}
            <div className="pt-2 border-t border-[var(--color-divider)] flex items-center justify-between text-[11px] font-mono">
              <span className="opacity-60">Superficie Estimada:</span>
              <span className="font-bold text-[var(--color-text)]">
                {estimatedAreaKm2 > 0 ? `${estimatedAreaKm2.toLocaleString()} km²` : '---'}
              </span>
            </div>
          </div>

          {/* Datos Operativos Mandatorios */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-heading font-semibold uppercase tracking-wider block mb-1">
                Nombre Operativo del Área *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Teatro Operativo Donbás, Corredor Logístico Buenaventura..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-divider)] text-sm font-heading placeholder:opacity-40 focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>

            {/* Selector de Severidad Táctica */}
            <div>
              <label className="text-xs font-heading font-semibold uppercase tracking-wider block mb-2">
                Clasificación de Severidad y Riesgo *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR'] as TacticalSeverity[]).map((sev) => {
                  const conf = SEVERITY_CONFIG[sev];
                  const isSelected = severity === sev;
                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverity(sev)}
                      className={`p-3 text-left border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-[var(--color-text)] bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] shadow-sm'
                          : 'border-[var(--color-divider)] opacity-60 hover:opacity-100 bg-[var(--color-surface)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-xs font-heading font-bold uppercase tracking-wider"
                          style={{ color: conf.color }}
                        >
                          {conf.label}
                        </span>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 border border-[var(--color-divider)]">
                          {conf.kicker}
                        </span>
                      </div>
                      <span className="text-[10px] leading-relaxed opacity-75">{conf.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-heading font-semibold uppercase tracking-wider block mb-1">
                Descripción Táctica y Reglas de Empeño
              </label>
              <textarea
                rows={2}
                placeholder="Directivas de movimiento, restricciones específicas o condiciones de seguridad..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs leading-relaxed placeholder:opacity-40 focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          </div>

          {/* Acordeón de Parámetros Tácticos Avanzados */}
          <div className="border border-[var(--color-divider)]">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface)] flex items-center justify-between text-xs font-heading font-semibold uppercase tracking-wider hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                Parámetros Tácticos Avanzados (Buffer, Toque de Queda, Radio)
              </span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="p-4 space-y-4 bg-[var(--color-bg)] border-t border-[var(--color-divider)]">
                {/* Buffer de proximidad */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-mono uppercase tracking-wider opacity-70">
                      Margen de Proximidad / Buffer (metros)
                    </label>
                    <span className="text-xs font-mono font-bold">{bufferMeters} m</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5000"
                    step="50"
                    value={bufferMeters}
                    onChange={(e) => setBufferMeters(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--color-accent)]"
                  />
                  <span className="text-[10px] font-mono opacity-50 block mt-1">
                    Dispara pre-alerta de geofencing al aproximarse a esta distancia del perímetro.
                  </span>
                </div>

                {/* Toque de Queda */}
                <div className="pt-3 border-t border-[var(--color-divider)] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-heading font-semibold uppercase tracking-wider flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isCurfew}
                        onChange={(e) => setIsCurfew(e.target.checked)}
                        className="w-4 h-4 accent-[var(--color-accent)]"
                      />
                      Activar Restricción de Toque de Queda (Curfew)
                    </label>
                    {isCurfew && (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-[color-mix(in_srgb,var(--risk-high)_20%,transparent)] text-[var(--risk-high)] font-bold">
                        RESTRICCIÓN ACTIVA
                      </span>
                    )}
                  </div>

                  {isCurfew && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                          Hora Inicio (UTC)
                        </label>
                        <input
                          type="time"
                          value={curfewStart}
                          onChange={(e) => setCurfewStart(e.target.value)}
                          className="w-full px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                          Hora Fin (UTC)
                        </label>
                        <input
                          type="time"
                          value={curfewEnd}
                          onChange={(e) => setCurfewEnd(e.target.value)}
                          className="w-full px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Comunicaciones */}
                <div className="pt-3 border-t border-[var(--color-divider)] grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                      Frecuencia de Radio Táctica
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 146.520 MHz VHF"
                      value={radioFrequency}
                      onChange={(e) => setRadioFrequency(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                      Teléfono Satelital / Emergencia
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: +8816 3145 7890"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>

                {/* Protocolo de Acceso & Vigencia */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                      Protocolo de Acceso a Puertas
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Solicitud previa 2h vía radio canal 4"
                      value={gateAccessProtocol}
                      onChange={(e) => setGateAccessProtocol(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                      Vigencia Temporal Hasta (Opcional)
                    </label>
                    <input
                      type="datetime-local"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botonera de Acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-divider)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-[var(--color-divider)] text-xs font-heading font-semibold uppercase tracking-wider hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !activeGeometry || !name.trim()}
              className="px-5 py-2 bg-[var(--color-accent)] text-white text-xs font-heading font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Registrando en PostGIS...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirmar y Crear Área Táctica
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
