'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  UserCheck,
  Edit3,
} from 'lucide-react';
import {
  generateGeodesicCircle,
  extractMainContinentPolygon,
  closeDrawnPolygon,
  calculateRingAreaKm2,
  ExtractedCountryGeometry,
} from '@/lib/geo/tactical-zones';
import { ZoneMiniMap } from './ZoneMiniMap';
import { validateGeoJSONPolygon } from '@/lib/geo/validation';
import { ZoneType, ZoneSeverity } from '@/types/database';

export type DelimitationMode = 'country' | 'radius' | 'freehand';
export type TacticalSeverity = ZoneSeverity;

interface ZoneCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onZoneCreated: (newZone: any) => void;
  initialCenter?: [number, number]; // [lng, lat]
  initialZone?: any; // Para modo edición
}

const SEVERITY_CONFIG: Record<
  TacticalSeverity,
  { label: string; kicker: string; color: string; desc: string }
> = {
  OPERATIONAL: {
    label: 'CONTROL OPERATIVO',
    kicker: 'MANDO / RSO',
    color: 'var(--color-accent)',
    desc: 'Ámbito de responsabilidad y supervisión territorial bajo el mando de un RSO.',
  },
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
  initialZone = null,
}) => {
  const isEditMode = Boolean(initialZone);

  // Tipología y severidad
  const [zoneType, setZoneType] = useState<ZoneType>('THREAT');
  const [severity, setSeverity] = useState<TacticalSeverity>('RED');

  // Modalidad geométrica
  const [mode, setMode] = useState<DelimitationMode>('country');

  // Formulario táctico
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assignedRsoId, setAssignedRsoId] = useState('');
  const [bufferMeters, setBufferMeters] = useState(500);
  const [isCurfew, setIsCurfew] = useState(false);
  const [curfewStart, setCurfewStart] = useState('22:00');
  const [curfewEnd, setCurfewEnd] = useState('06:00');
  const [contactPhone, setContactPhone] = useState('');
  const [radioFrequency, setRadioFrequency] = useState('');
  const [gateAccessProtocol, setGateAccessProtocol] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Lista de RSOs disponibles
  const [rsoList, setRsoList] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [isLoadingRsos, setIsLoadingRsos] = useState(false);

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

  // Estado para redibujar perímetro en modo edición (Mandato Daniel / Claude)
  const [isRedrawingGeometry, setIsRedrawingGeometry] = useState<boolean>(false);

  // Estado de procesamiento y error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Cargar lista de RSOs de la organización
  useEffect(() => {
    if (isOpen) {
      setIsLoadingRsos(true);
      fetch('/api/profiles')
        .then((res) => res.json())
        .then((data) => {
          if (data.data) {
            setRsoList(data.data);
          }
        })
        .catch((err) => console.error('Error al cargar perfiles tácticos:', err))
        .finally(() => setIsLoadingRsos(false));
    }
  }, [isOpen]);

  // Cargar dataset TopoJSON de países cuando el modal está abierto
  useEffect(() => {
    if (!worldTopology && isOpen) {
      fetch('/data/countries-110m.json')
        .then((res) => res.json())
        .then((data) => setWorldTopology(data))
        .catch((err) => console.error('Error cargando países TopoJSON:', err));
    }
  }, [worldTopology, isOpen]);

  // Sincronizar estado inicial al abrir o cambiar de zona
  useEffect(() => {
    if (isOpen) {
      setSubmitError(null);
      setIsRedrawingGeometry(false);
      if (initialZone) {
        const p = initialZone.properties || {};
        setName(p.name || '');
        setDescription(p.description || '');
        const zType: ZoneType = p.zone_type === 'RESPONSIBILITY' ? 'RESPONSIBILITY' : 'THREAT';
        setZoneType(zType);
        setSeverity(p.severity || (zType === 'RESPONSIBILITY' ? 'OPERATIONAL' : 'RED'));
        setAssignedRsoId(p.assigned_rso_id || '');
        setBufferMeters(p.buffer_meters ?? 500);
        setIsCurfew(p.is_curfew ?? false);
        setCurfewStart(p.curfew_start ? p.curfew_start.slice(0, 5) : '22:00');
        setCurfewEnd(p.curfew_end ? p.curfew_end.slice(0, 5) : '06:00');
        setContactPhone(p.contact_phone || '');
        setRadioFrequency(p.radio_frequency || '');
        setGateAccessProtocol(p.gate_access_protocol || '');
        setValidUntil(p.valid_until ? p.valid_until.slice(0, 16) : '');

        // Si la zona tiene un polígono, sugerir su primer vértice como centro para el modo radio
        if (initialZone.geometry?.coordinates?.[0]?.[0]) {
          const pt = initialZone.geometry.coordinates[0][0];
          setCenterLng(Number(pt[0].toFixed(4)));
          setCenterLat(Number(pt[1].toFixed(4)));
        }
      } else {
        setName('');
        setDescription('');
        setZoneType('THREAT');
        setSeverity('RED');
        setAssignedRsoId('');
        setBufferMeters(500);
        setIsCurfew(false);
        setCurfewStart('22:00');
        setCurfewEnd('06:00');
        setContactPhone('');
        setRadioFrequency('');
        setGateAccessProtocol('');
        setValidUntil('');
        setSelectedCountryId('');
        setSelectedCountryName('');
        setCountryExtraction(null);
      }
    }
  }, [isOpen, initialZone]);

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
    if (!name || name.startsWith('Teatro Operativo -') || name.startsWith('Área Táctica -')) {
      setName(zoneType === 'RESPONSIBILITY' ? `Teatro Operativo - ${cName}` : `Área Táctica - ${cName}`);
    }

    if (!worldTopology) return;
    try {
      const geom = worldTopology.objects.countries.geometries.find(
        (g: any) => String(g.id) === cId
      );
      if (!geom) return;

      const feature: any = topojson.feature(worldTopology, geom);
      if (feature && feature.geometry) {
        const extraction = extractMainContinentPolygon(feature.geometry);
        setCountryExtraction(extraction);
      }
    } catch (err: any) {
      console.error('Fallo al extraer geometría de país:', err);
      setCountryExtraction(null);
    }
  };

  // Geometría activa calculada según modalidad
  const activeGeometry = useMemo<GeoJSON.Polygon | null>(() => {
    if (isEditMode && !isRedrawingGeometry && initialZone?.geometry) {
      return initialZone.geometry;
    }

    if (mode === 'country') {
      return countryExtraction?.polygon || null;
    }

    if (mode === 'radius') {
      if (isNaN(centerLng) || isNaN(centerLat) || isNaN(radiusKm) || radiusKm <= 0) return null;
      return generateGeodesicCircle(centerLng, centerLat, radiusKm, 64);
    }

    if (mode === 'freehand') {
      const lines = rawCoordinatesText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const points: [number, number][] = [];

      for (const line of lines) {
        const parts = line.split(/[,\s]+/).map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          points.push([parts[0], parts[1]]);
        }
      }

      if (points.length < 3) return null;
      return closeDrawnPolygon(points);
    }

    return null;
  }, [isEditMode, isRedrawingGeometry, initialZone, mode, countryExtraction, centerLng, centerLat, radiusKm, rawCoordinatesText]);

  // Superficie aproximada calculada
  const approximateAreaKm2 = useMemo(() => {
    if (!activeGeometry || !activeGeometry.coordinates || activeGeometry.coordinates.length === 0) {
      return 0;
    }
    return calculateRingAreaKm2(activeGeometry.coordinates[0]);
  }, [activeGeometry]);

  // Callbacks estables para ZoneMiniMap (Evita re-enganchar listeners de clic innecesariamente)
  const handleMiniMapCenterChange = useCallback((lng: number, lat: number) => {
    setCenterLng(lng);
    setCenterLat(lat);
  }, []);

  const handleMiniMapAddPoint = useCallback(([lng, lat]: [number, number]) => {
    const newLine = `${lng.toFixed(4)}, ${lat.toFixed(4)}`;
    setRawCoordinatesText((prev) =>
      prev.trim() ? `${prev.trim()}\n${newLine}` : newLine
    );
  }, []);

  const handleMiniMapClearPoints = useCallback(() => {
    setRawCoordinatesText('');
  }, []);

  const handleMiniMapUndoPoint = useCallback(() => {
    setRawCoordinatesText((prev) => {
      const lines = prev.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return '';
      lines.pop();
      return lines.join('\n');
    });
  }, []);

  // Validar y enviar (POST para alta, PATCH para edición)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('El nombre del área táctica es obligatorio.');
      return;
    }

    // Regla de negocio estricta: Zona de Control exige RSO asignado
    if (zoneType === 'RESPONSIBILITY' && !assignedRsoId) {
      setSubmitError('Para zonas de control operativo (RESPONSIBILITY) es estrictamente obligatorio asignar un RSO responsable.');
      return;
    }

    // Validación de geometría: exigida en creación y cuando se activa redibujado en edición
    if (isEditMode) {
      if (isRedrawingGeometry) {
        if (!activeGeometry) {
          setSubmitError('No se ha podido generar una geometría GeoJSON válida para el nuevo perímetro.');
          return;
        }
        const validation = validateGeoJSONPolygon(activeGeometry);
        if (!validation.valid) {
          setSubmitError(`Geometría inválida: ${validation.error}`);
          return;
        }
      }
    } else {
      if (!activeGeometry) {
        setSubmitError('No se ha podido generar una geometría GeoJSON válida para la zona.');
        return;
      }

      const validation = validateGeoJSONPolygon(activeGeometry);
      if (!validation.valid) {
        setSubmitError(`Geometría inválida: ${validation.error}`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isEditMode) {
        // Modo Edición: PATCH /api/zones/[id]
        const updatePayload: Record<string, any> = {
          name: name.trim(),
          description: description.trim() || null,
          zone_type: zoneType,
          severity: zoneType === 'RESPONSIBILITY' ? 'OPERATIONAL' : severity,
          assigned_rso_id: assignedRsoId || null,
          buffer_meters: bufferMeters,
          is_curfew: isCurfew,
          curfew_start: isCurfew ? curfewStart : null,
          curfew_end: isCurfew ? curfewEnd : null,
          contact_phone: contactPhone.trim() || null,
          radio_frequency: radioFrequency.trim() || null,
          gate_access_protocol: gateAccessProtocol.trim() || null,
          valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        };

        // Solo incluir geojson_geometry si el usuario activó explícitamente el redibujado
        if (isRedrawingGeometry && activeGeometry) {
          updatePayload.geojson_geometry = activeGeometry;
        }

        const response = await fetch(`/api/zones/${initialZone.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Error al actualizar la zona');
        }

        onZoneCreated(result.zone);
        onClose();
      } else {
        // Modo Creación: POST /api/zones
        const payload: any = {
          name: name.trim(),
          description: description.trim() || undefined,
          zone_type: zoneType,
          severity: zoneType === 'RESPONSIBILITY' ? 'OPERATIONAL' : severity,
          assigned_rso_id: assignedRsoId || null,
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
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Error de conexión con el servidor');
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
              {isEditMode ? (
                <>
                  <Edit3 className="w-5 h-5 text-[var(--color-accent)]" />
                  Editar Área Táctica // {name || initialZone?.properties?.name}
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5 text-[var(--color-accent)]" />
                  Delimitación de Área / Zona Táctica
                </>
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
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
          {/* PASO 0: Tipología de Área (Control vs Peligro) */}
          <div className="space-y-2">
            <label className="text-[11px] font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] opacity-70 block">
              1. Tipología Operativa de la Delimitación
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setZoneType('RESPONSIBILITY');
                  setSeverity('OPERATIONAL');
                }}
                className={`p-3.5 border text-left flex flex-col justify-between transition-all ${
                  zoneType === 'RESPONSIBILITY'
                    ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] ring-1 ring-[var(--color-accent)] shadow-sm'
                    : 'border-[var(--color-divider)] bg-[var(--color-bg)] opacity-60 hover:opacity-100 hover:border-[var(--color-text-muted)]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--color-accent)]" />
                    <span className="text-xs font-heading font-bold uppercase tracking-wider text-[var(--color-text)]">
                      Zona de Control
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 font-sans leading-tight">
                    Teatro de operaciones o territorio bajo supervisión directa de un RSO. Sin connotación de alarma.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[var(--color-divider)] flex items-center justify-between text-[10px] font-mono text-[var(--color-accent)]">
                  <span>SEVERIDAD OPERACIONAL</span>
                  <span className="font-bold">RSO OBLIGATORIO</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setZoneType('THREAT');
                  if (severity === 'OPERATIONAL') setSeverity('AMBER');
                }}
                className={`p-3.5 border text-left flex flex-col justify-between transition-all ${
                  zoneType === 'THREAT'
                    ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 shadow-sm'
                    : 'border-[var(--color-divider)] bg-[var(--color-bg)] opacity-60 hover:opacity-100 hover:border-[var(--color-text-muted)]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-heading font-bold uppercase tracking-wider text-[var(--color-text)]">
                      Área de Peligro
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5 font-sans leading-tight">
                    Perímetro táctico con nivel de riesgo o restricciones de paso para personal expatriado.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-[var(--color-divider)] flex items-center justify-between text-[10px] font-mono text-amber-400">
                  <span>4 NIVELES DE AMENAZA</span>
                  <span>RSO OPCIONAL</span>
                </div>
              </button>
            </div>
          </div>

          {/* RSO ASIGNADO */}
          <div>
            <label className="text-[11px] font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] opacity-70 flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                RSO Responsable Asignado {zoneType === 'RESPONSIBILITY' ? (
                  <span className="text-red-400 font-bold">* (Obligatorio)</span>
                ) : (
                  <span className="text-[var(--color-text-muted)] font-normal font-mono">(Opcional)</span>
                )}
              </span>
              {isLoadingRsos && <span className="text-[10px] font-mono text-[var(--color-accent)] animate-pulse">Sincronizando oficiales...</span>}
            </label>
            <select
              value={assignedRsoId}
              onChange={(e) => setAssignedRsoId(e.target.value)}
              className={`w-full px-3 py-2 bg-[var(--color-surface)] border text-xs font-mono focus:outline-none ${
                zoneType === 'RESPONSIBILITY' && !assignedRsoId
                  ? 'border-red-400/80 bg-red-500/5 focus:border-red-400'
                  : 'border-[var(--color-divider)] focus:border-[var(--color-accent)]'
              }`}
            >
              <option value="">-- Sin RSO asignado --</option>
              {rsoList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name} [{r.role}]
                </option>
              ))}
            </select>
            {zoneType === 'RESPONSIBILITY' && !assignedRsoId && (
              <p className="text-[11px] text-red-400 font-mono mt-1">
                ⚠️ Una zona de control requiere asignar al oficial RSO que supervisa el territorio.
              </p>
            )}
          </div>

          {/* SELECTOR DE SEVERIDAD (Solo para THREAT) */}
          {zoneType === 'RESPONSIBILITY' ? (
            <div className="p-3 border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-xs font-mono text-[var(--color-accent)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                <span className="font-bold">SEVERIDAD OPERACIONAL:</span>
                <span className="text-[var(--color-text)]">Color neutro Industry Steel (#5980a6). Sin rampa de alerta.</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] opacity-70 block mb-2">
                2. Nivel de Riesgo / Severidad Táctica
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR'] as TacticalSeverity[]).map((sevKey) => {
                  const cfg = SEVERITY_CONFIG[sevKey];
                  const isSelected = severity === sevKey;

                  return (
                    <button
                      key={sevKey}
                      type="button"
                      onClick={() => setSeverity(sevKey)}
                      className={`p-3 text-left border transition-all relative ${
                        isSelected
                          ? 'border-[var(--color-text)] bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] shadow-sm'
                          : 'border-[var(--color-divider)] hover:border-[var(--color-text)] opacity-60 hover:opacity-100'
                      }`}
                    >
                      {isSelected && (
                        <span
                          className="absolute top-0 left-0 right-0 h-0.5"
                          style={{ backgroundColor: cfg.color }}
                        />
                      )}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: cfg.color }}
                        />
                        <span className="text-xs font-heading font-bold uppercase tracking-wider">
                          {cfg.label}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono uppercase tracking-wider opacity-70 block">
                        {cfg.kicker}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* EN MODO EDICIÓN: CONTROL PARA CONSERVAR O REDIBUJAR PERÍMETRO */}
          {isEditMode && (
            <div className="space-y-2">
              {!isRedrawingGeometry ? (
                <div className="p-3.5 border border-[var(--color-divider)] bg-[var(--color-surface)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs font-mono">
                    <Shield className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                    <div>
                      <span className="font-bold text-[var(--color-text)] block">
                        Perímetro Territorial Registrado
                      </span>
                      <span className="opacity-70 text-[11px] block">
                        Geometría conservada ({initialZone?.geometry?.type || 'POLYGON'}) · {approximateAreaKm2 > 0 ? `${approximateAreaKm2.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km²` : 'Superficie registrada'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRedrawingGeometry(true);
                      if (initialZone?.geometry?.coordinates?.[0]?.[0]) {
                        const pt = initialZone.geometry.coordinates[0][0];
                        setCenterLng(Number(pt[0].toFixed(4)));
                        setCenterLat(Number(pt[1].toFixed(4)));
                      }
                    }}
                    className="px-3.5 py-1.5 border border-[var(--color-accent)] text-[var(--color-accent)] text-xs font-heading font-semibold uppercase tracking-wider hover:bg-[var(--color-accent)]/15 transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Redibujar Perímetro
                  </button>
                </div>
              ) : (
                <div className="p-3.5 border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs font-mono text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <div>
                      <span className="font-bold block">Redibujado de Perímetro Activo</span>
                      <span className="opacity-80 text-[11px] block">
                        Se sustituirá el perímetro completo de la zona al guardar los cambios.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRedrawingGeometry(false)}
                    className="px-3 py-1.5 border border-[var(--color-divider)] text-[var(--color-text-muted)] text-xs font-heading font-semibold uppercase tracking-wider hover:border-[var(--color-text)] hover:text-[var(--color-text)] transition-colors shrink-0"
                  >
                    Cancelar y Conservar Perímetro Actual
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SELECTOR DE MODALIDAD GEOMÉTRICA (3 pestañas): Visible en Creación o cuando se activa Redibujado en Edición */}
          {(!isEditMode || isRedrawingGeometry) && (
            <>
              <div>
                <label className="text-[11px] font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] opacity-70 block mb-2">
                  {isEditMode ? '3. Nuevo Perímetro Territorial' : '3. Modalidad de Delimitación Geométrica'}
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

              {/* Panel de configuración y cartografía interactiva según la modalidad activa */}
              <div className="border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 space-y-4">
                {/* MODALIDAD 1: PAÍS (Selector TopoJSON) */}
                {mode === 'country' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-heading font-semibold uppercase tracking-wider">
                        Selección Territorial por País
                      </span>
                      <span className="text-[10px] font-mono opacity-60">Natural Earth 110m WGS84</span>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--color-text)] opacity-50" />
                      <input
                        type="text"
                        placeholder="Buscar país (ej: Malí, Níger, Ucrania, España...)"
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.preventDefault();
                        }}
                        className="w-full pl-9 pr-3 py-2 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>

                    <div className="max-h-36 overflow-y-auto border border-[var(--color-divider)] bg-[var(--color-bg)] divide-y divide-[var(--color-divider)]">
                      {countryList.length === 0 ? (
                        <div className="p-3 text-center text-xs opacity-60 font-mono">
                          No se encontraron países que coincidan con la búsqueda.
                        </div>
                      ) : (
                        countryList.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectCountry(c.id, c.name)}
                            className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center justify-between hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] transition-colors ${
                              selectedCountryId === c.id
                                ? 'bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] font-bold text-[var(--color-accent)]'
                                : 'opacity-80'
                            }`}
                          >
                            <span>{c.name}</span>
                            <span className="text-[10px] opacity-50">ID: {c.id}</span>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Aviso obligatorio si el país es archipiélago o tiene enclaves excluidos */}
                    {countryExtraction?.isSimplified && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>AVISO OPERATIVO DE DELIMITACIÓN</span>
                        </div>
                        <div>
                          Esta delimitación representa el territorio continental principal de {selectedCountryName}. 
                          {countryExtraction.excludedCount > 0 && ` ${countryExtraction.excludedCount} enclaves o islas quedan fuera del perímetro geométrico registrado.`}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* MINI-MAPA INTERACTIVO COMPARTIDO (Instancia única de MapLibre GL para los 3 modos) */}
                <ZoneMiniMap
                  mode={mode}
                  centerLng={centerLng}
                  centerLat={centerLat}
                  radiusKm={radiusKm}
                  activeGeometry={activeGeometry}
                  rawCoordinatesText={rawCoordinatesText}
                  severity={severity}
                  zoneType={zoneType}
                  onCenterChange={handleMiniMapCenterChange}
                  onAddPoint={handleMiniMapAddPoint}
                  onClearPoints={handleMiniMapClearPoints}
                  onUndoPoint={handleMiniMapUndoPoint}
                />

                {/* MODALIDAD 2: RADIO TÁCTICO (Ajuste numérico fino y slider de radio) */}
                {mode === 'radius' && (
                  <div className="space-y-3 pt-2 border-t border-[var(--color-divider)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-heading font-semibold uppercase tracking-wider">
                        Buffer Geodésico Regular (64 vértices esféricos)
                      </span>
                      <span className="text-[10px] font-mono opacity-60">Radio: {radiusKm} km</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-mono opacity-70 block mb-1">
                          Longitud Centro (WGS84)
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          value={centerLng}
                          onChange={(e) => setCenterLng(parseFloat(e.target.value) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.preventDefault();
                          }}
                          className="w-full px-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono opacity-70 block mb-1">
                          Latitud Centro (WGS84)
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          value={centerLat}
                          onChange={(e) => setCenterLat(parseFloat(e.target.value) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.preventDefault();
                          }}
                          className="w-full px-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="opacity-70">Radio del Perímetro:</span>
                        <span className="font-bold text-[var(--color-accent)]">{radiusKm} km</span>
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
                      <div className="flex justify-between text-[9px] font-mono opacity-50 mt-1">
                        <span>1 km (Local)</span>
                        <span>25 km (Metropolitano)</span>
                        <span>50 km (Sector)</span>
                        <span>100 km (Teatro Regional)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODALIDAD 3: POLÍGONO LIBRE (Editor de coordenadas WGS84 sincronizado) */}
                {mode === 'freehand' && (
                  <div className="space-y-2 pt-2 border-t border-[var(--color-divider)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-heading font-semibold uppercase tracking-wider">
                        Editor de Vértices Vectoriales (WGS84)
                      </span>
                      <span className="text-[10px] font-mono opacity-60">Formato: Lng, Lat (un vértice por línea)</span>
                    </div>
                    <textarea
                      rows={3}
                      value={rawCoordinatesText}
                      onChange={(e) => setRawCoordinatesText(e.target.value)}
                      placeholder="-3.7100, 40.4200&#10;-3.6900, 40.4200&#10;-3.6900, 40.4100&#10;-3.7100, 40.4100"
                      className="w-full p-2 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
                    />
                    <span className="text-[10px] font-mono opacity-60 block">
                      * El sistema cierra determinísticamente el primer y último punto conforme al estándar RFC 7946.
                    </span>
                  </div>
                )}

                {/* HUD de Telemetría Geométrica */}
                {activeGeometry && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-divider)] flex items-center justify-between text-[11px] font-mono">
                    <span className="opacity-70">Superficie Delimitada:</span>
                    <span className="font-bold text-[var(--color-accent)]">
                      {approximateAreaKm2.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km²
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* DATOS GENERALES DEL ÁREA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                Nombre del Área Táctica *
              </label>
              <input
                type="text"
                placeholder="Ej: Teatro Operativo Malí / Corredor N6"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                Descripción / Directiva Operativa
              </label>
              <input
                type="text"
                placeholder="Ej: Supervisión integral de expatriados y proyectos en Bamako"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          </div>

          {/* PARÁMETROS TÁCTICOS AVANZADOS */}
          <div className="border border-[var(--color-divider)] bg-[var(--color-surface)]">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-heading font-semibold uppercase tracking-wider hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]"
            >
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                Parámetros Tácticos Avanzados (Buffer, Toque de Queda, Comunicaciones)
              </span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="p-4 border-t border-[var(--color-divider)] space-y-4 bg-[var(--color-bg)]">
                {/* Buffer de Proximidad */}
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="opacity-70">Buffer de Advertencia Perimetral:</span>
                    <span className="font-bold text-[var(--color-accent)]">{bufferMeters} metros</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5000"
                    step="100"
                    value={bufferMeters}
                    onChange={(e) => setBufferMeters(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--color-accent)] cursor-pointer"
                  />
                  <span className="text-[9px] font-mono opacity-50 block mt-1">
                    Dispara pre-alertas cuando un viajero se aproxima al perímetro antes de cruzarlo.
                  </span>
                </div>

                {/* Toque de Queda */}
                <div className="pt-3 border-t border-[var(--color-divider)] space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is-curfew"
                      checked={isCurfew}
                      onChange={(e) => setIsCurfew(e.target.checked)}
                      className="accent-[var(--color-accent)]"
                    />
                    <label htmlFor="is-curfew" className="text-xs font-heading font-semibold uppercase cursor-pointer select-none">
                      Activar Restricción Horaria (Toque de Queda)
                    </label>
                  </div>

                  {isCurfew && (
                    <div className="grid grid-cols-2 gap-3 pl-5 border-l-2 border-[var(--color-accent)]">
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-wider opacity-70 block mb-1">
                          Hora Inicio Restricción
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
                          Hora Fin Restricción
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
              disabled={isSubmitting || (!isEditMode && !activeGeometry) || (isEditMode && isRedrawingGeometry && !activeGeometry) || !name.trim()}
              className="px-5 py-2 bg-[var(--color-accent)] text-white text-xs font-heading font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isEditMode ? 'Actualizando Área...' : 'Registrando en PostGIS...'}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {isEditMode ? 'Guardar Cambios' : 'Confirmar y Crear Área Táctica'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
