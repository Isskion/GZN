'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  X,
  MapPin,
  Shield,
  Radio,
  Phone,
  Mail,
  User,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Crosshair,
} from 'lucide-react';

interface TravelerCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTravelerCreated: () => void;
  initialCoordinates?: { lat: number; lon: number } | null;
}

export const TravelerCreationModal: React.FC<TravelerCreationModalProps> = ({
  isOpen,
  onClose,
  onTravelerCreated,
  initialCoordinates,
}) => {
  const [callsign, setCallsign] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [assignedRsoId, setAssignedRsoId] = useState('');
  const [rsoProfiles, setRsoProfiles] = useState<any[]>([]);

  // Posición inicial (Decisión Daniel / Claude: Opción C Híbrida)
  const [usePosition, setUsePosition] = useState(false);
  const [lat, setLat] = useState<string>('');
  const [lon, setLon] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar coordenadas cuando se abre o cambian initialCoordinates
  useEffect(() => {
    if (initialCoordinates) {
      setLat(initialCoordinates.lat.toFixed(5));
      setLon(initialCoordinates.lon.toFixed(5));
      setUsePosition(true);
    } else {
      setLat('');
      setLon('');
      setUsePosition(false);
    }
  }, [initialCoordinates, isOpen]);

  // Cargar lista de RSOs de la organización para asignación
  useEffect(() => {
    if (!isOpen) return;
    const fetchProfiles = async () => {
      try {
        const res = await fetch('/api/profiles');
        if (!res.ok) return;
        const data = await res.json();
        const rsos = (data.profiles || []).filter(
          (p: any) => ['RSO', 'CONTROL_TOWER', 'ORG_ADMIN'].includes(p.role) && p.is_active
        );
        setRsoProfiles(rsos);
        if (rsos.length > 0 && !assignedRsoId) {
          setAssignedRsoId(rsos[0].id);
        }
      } catch (err) {
        console.error('Error al cargar perfiles RSO:', err);
      }
    };
    fetchProfiles();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCallsign = callsign.trim();
    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();

    if (!cleanCallsign) {
      setError('El indicativo táctico (Callsign) es obligatorio.');
      return;
    }
    if (!cleanName) {
      setError('El nombre completo es obligatorio.');
      return;
    }
    if (!cleanPhone) {
      setError('El teléfono o canal de contacto es obligatorio.');
      return;
    }

    let parsedLat: number | null = null;
    let parsedLon: number | null = null;

    if (usePosition) {
      parsedLat = Number(lat);
      parsedLon = Number(lon);
      if (
        isNaN(parsedLat) ||
        isNaN(parsedLon) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLon < -180 ||
        parsedLon > 180
      ) {
        setError('Coordenadas inválidas. Latitud [-90, 90], Longitud [-180, 180].');
        return;
      }
    }

    setIsLoading(true);

    try {
      const payload: any = {
        callsign: cleanCallsign,
        full_name: cleanName,
        phone: cleanPhone,
        email: email.trim() || null,
        assigned_rso_id: assignedRsoId || null,
      };

      if (usePosition && parsedLat !== null && parsedLon !== null) {
        payload.last_latitude = parsedLat;
        payload.last_longitude = parsedLon;
      }

      const res = await fetch('/api/travelers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `Error ${res.status}: Fallo al registrar el viajero.`);
      }

      // Éxito: notificar y cerrar
      onTravelerCreated();
      onClose();
    } catch (err: any) {
      console.error('Error al dar de alta viajero:', err);
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="blueprint plate relative w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-divider)] shadow-2xl rounded-[var(--radius-sm)] text-xs font-mono text-[var(--color-text)]">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />

        {/* Cabecera */}
        <div className="p-4 border-b border-[var(--color-divider)] flex items-center justify-between bg-[var(--color-bg)]/80">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--color-accent)]" />
            <div>
              <h3 className="font-heading font-bold text-sm uppercase tracking-wide">
                Alta de Activo // El Rebaño
              </h3>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                Registro y despliegue de convoy, vehículo o sujeto protegido
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/50 text-red-300 text-xs flex items-center gap-2 rounded">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Indicativo Táctico (Callsign) */}
            <div>
              <label className="block text-[10px] font-heading font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-1">
                Indicativo (Callsign) *
              </label>
              <div className="relative">
                <Radio className="w-3.5 h-3.5 absolute left-2.5 top-2.5 opacity-40" />
                <input
                  type="text"
                  required
                  placeholder="Ej. CONVOY-01 / VIP-ECHO"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                  className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono uppercase focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>

            {/* Nombre Completo */}
            <div>
              <label className="block text-[10px] font-heading font-semibold uppercase tracking-wider opacity-70 mb-1">
                Nombre Completo *
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-2.5 top-2.5 opacity-40" />
                <input
                  type="text"
                  required
                  placeholder="Ej. Capitán Carlos Mendoza"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-sans focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Teléfono de Contacto */}
            <div>
              <label className="block text-[10px] font-heading font-semibold uppercase tracking-wider opacity-70 mb-1">
                Teléfono / Canal Satelital *
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-2.5 top-2.5 opacity-40" />
                <input
                  type="tel"
                  required
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>

            {/* Email (Opcional) */}
            <div>
              <label className="block text-[10px] font-heading font-semibold uppercase tracking-wider opacity-70 mb-1">
                Email / ID Enlace (Opcional)
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 absolute left-2.5 top-2.5 opacity-40" />
                <input
                  type="email"
                  placeholder="operador@seguridad.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-sans focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Asignación de Oficial RSO */}
          <div>
            <label className="block text-[10px] font-heading font-semibold uppercase tracking-wider opacity-70 mb-1">
              Oficial RSO Responsable
            </label>
            <select
              value={assignedRsoId}
              onChange={(e) => setAssignedRsoId(e.target.value)}
              className="w-full px-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="">-- Sin RSO asignado (Bolsa General) --</option>
              {rsoProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.role})
                </option>
              ))}
            </select>
          </div>

          {/* Posicionamiento Inicial (Opción C Híbrida - Decisión Daniel / Claude) */}
          <div className="p-3 border border-[var(--color-divider)] bg-[var(--color-bg)]/50 rounded space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={usePosition}
                  onChange={(e) => setUsePosition(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                <span className="font-heading font-bold text-xs uppercase text-[var(--color-accent)]">
                  Fijar Posición Inicial en Terreno
                </span>
              </label>
              {usePosition && (
                <span className="text-[9px] font-mono opacity-60 text-amber-400">
                  Origen: MANUAL_RSO
                </span>
              )}
            </div>

            {usePosition && (
              <>
                <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                  Las coordenadas se registrarán formalmente como fijación manual del RSO (MANUAL_RSO) hasta que el terminal móvil emita su primera telemetría verificada (DEVICE_TELEMETRY).
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="block text-[9px] uppercase opacity-60 mb-0.5">Latitud WGS84</span>
                    <input
                      type="number"
                      step="0.00001"
                      required={usePosition}
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-full px-2.5 py-1 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:border-[var(--color-accent)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase opacity-60 mb-0.5">Longitud WGS84</span>
                    <input
                      type="number"
                      step="0.00001"
                      required={usePosition}
                      value={lon}
                      onChange={(e) => setLon(e.target.value)}
                      className="w-full px-2.5 py-1 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:border-[var(--color-accent)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-2 py-1 px-2 border border-[var(--color-divider)] bg-[var(--color-surface)]/60 text-[10px] font-mono text-[var(--color-text-muted)] flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-[var(--color-accent)] flex-none" />
                  <span>
                    {initialCoordinates
                      ? 'Coordenadas sincronizadas con el centro actual del visor táctico.'
                      : 'Especifique latitud y longitud WGS84 para fijación manual inicial.'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-divider)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-3.5 py-1.5 border border-[var(--color-divider)] hover:bg-[var(--color-surface)] text-xs uppercase font-heading font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-1.5 bg-[var(--color-accent)] text-white hover:opacity-90 text-xs uppercase font-heading font-bold flex items-center gap-1.5 transition-opacity shadow-sm"
            >
              {isLoading ? (
                <span>Registrando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Dar de Alta</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
