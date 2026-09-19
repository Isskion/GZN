'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Shield,
  Lock,
  Eye,
  EyeOff,
  Mail,
  User,
  Phone,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { Profile, UserRole, ROLE_LEVELS } from '@/types/database';
import { getSeverityColor } from '@/lib/geo/tactical-zones';

export interface ZoneSummary {
  id: string;
  name: string;
  zone_type: 'RESPONSIBILITY' | 'THREAT';
  severity: string;
  color_hex?: string;
  assigned_rso_id?: string | null;
}

interface UserCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newProfile: Profile) => void;
  callerRoleLevel?: number;
  availableSupervisors?: Array<{ id: string; full_name: string; role: string; role_level?: number }>;
  availableZones?: ZoneSummary[];
}

const ROLE_DEFINITIONS: Array<{ role: UserRole; label: string; level: number; description: string }> = [
  { role: 'ORG_ADMIN', label: 'Administrador de Organización', level: 100, description: 'Acceso total y gobierno de organización' },
  { role: 'CONTROL_TOWER', label: 'Torre de Control', level: 80, description: 'Mando operativo central y supervisión regional' },
  { role: 'RSO', label: 'Oficial RSO', level: 60, description: 'Oficial de Seguridad Regional de campo y áreas' },
  { role: 'OPERATOR', label: 'Operador de Monitoreo', level: 40, description: 'Operador de consola y seguimiento táctico' },
];

export const UserCreationModal: React.FC<UserCreationModalProps> = ({
  isOpen,
  onClose,
  onUserCreated,
  callerRoleLevel = 60,
  availableSupervisors = [],
  availableZones = [],
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [supervisingRsoId, setSupervisingRsoId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zonas disponibles y selección bajo control / exclusión
  const [zones, setZones] = useState<ZoneSummary[]>(availableZones);
  const [controlledZoneIds, setControlledZoneIds] = useState<string[]>([]);
  const [excludedZoneIds, setExcludedZoneIds] = useState<string[]>([]);

  // Filtrar roles disponibles según el techo jerárquico del invocador
  const allowedRoles = ROLE_DEFINITIONS.filter((r) => r.level <= callerRoleLevel);

  // Cargar zonas si no se pasaron como prop
  useEffect(() => {
    if (isOpen) {
      if (availableZones && availableZones.length > 0) {
        setZones(availableZones);
      } else {
        fetch('/api/zones')
          .then((res) => res.json())
          .then((data) => {
            if (data.features) {
              const mapped: ZoneSummary[] = data.features.map((f: any) => ({
                id: f.properties.id,
                name: f.properties.name,
                zone_type: f.properties.zone_type,
                severity: f.properties.severity,
                color_hex: f.properties.color_hex,
                assigned_rso_id: f.properties.assigned_rso_id,
              }));
              setZones(mapped);
            }
          })
          .catch((err) => console.error('[UserCreationModal] Error al consultar zonas:', err));
      }
    }
  }, [isOpen, availableZones]);

  // Ajustar rol por defecto si el actual no está permitido
  useEffect(() => {
    if (allowedRoles.length > 0 && !allowedRoles.some((r) => r.role === role)) {
      setRole(allowedRoles[allowedRoles.length - 1].role);
    }
  }, [callerRoleLevel, allowedRoles, role]);

  if (!isOpen) return null;

  // Toggle para Oficial RSO (lista de inclusión)
  const handleToggleRsoZone = (zoneId: string) => {
    setControlledZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  // Toggle para Torre de Control (lista de exclusión: desmarcar añade a exclusiones)
  const handleToggleControlTowerZone = (zoneId: string) => {
    setExcludedZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleSelectAllRsoZones = () => {
    setControlledZoneIds(zones.map((z) => z.id));
  };

  const handleClearAllRsoZones = () => {
    setControlledZoneIds([]);
  };

  const handleIncludeAllCtZones = () => {
    // Visibilidad total = cero exclusiones
    setExcludedZoneIds([]);
  };

  const handleExcludeAllCtZones = () => {
    // Excluir todas = todas las zonas en la lista de exclusión
    setExcludedZoneIds(zones.map((z) => z.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('El nombre completo es obligatorio.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Introduzca un correo corporativo válido.');
      return;
    }

    if (!password || password.length < 8) {
      setError('La contraseña temporal debe tener al menos 8 caracteres.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, any> = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        phone: phone.trim() || null,
        emergency_contact: emergencyContact.trim() || null,
        supervising_rso_id: role === 'OPERATOR' && supervisingRsoId ? supervisingRsoId : null,
      };

      // Zonas según el rol seleccionado
      if (role === 'RSO') {
        payload.controlled_zone_ids = controlledZoneIds;
      } else if (role === 'CONTROL_TOWER') {
        payload.excluded_zone_ids = excludedZoneIds;
      }

      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}: Fallo al crear usuario.`);
      }

      onUserCreated(data.data || data.profile);
      handleResetAndClose();
    } catch (err: any) {
      console.error('[UserCreationModal] Error:', err);
      setError(err.message || 'Error inesperado al conectar con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setRole(allowedRoles.length > 0 ? allowedRoles[allowedRoles.length - 1].role : 'OPERATOR');
    setPhone('');
    setEmergencyContact('');
    setSupervisingRsoId('');
    setControlledZoneIds([]);
    setExcludedZoneIds([]);
    setError(null);
    onClose();
  };

  // Mapa de nombres de RSOs para advertencia de reasignación
  const supervisorNameMap = new Map<string, string>();
  availableSupervisors.forEach((s) => {
    supervisorNameMap.set(s.id, s.full_name);
  });

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] shadow-2xl rounded-none p-6 font-sans overflow-hidden">
        {/* Esquinas tácticas Blueprint */}
        <span className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>
        <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>
        <span className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>
        <span className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>

        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3 mb-4 flex-none">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest uppercase text-[var(--color-accent)] block">
                ADMINISTRACIÓN DE PERSONAL // ALTA DIRECTA
              </span>
              <h2 className="text-base font-heading font-semibold uppercase tracking-wider text-[var(--color-text)]">
                Alta de Usuario Corporativo
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div className="mb-4 p-3 bg-[color-mix(in_srgb,var(--risk-crit)_15%,transparent)] border border-[var(--risk-crit)] text-xs flex items-center gap-2 text-[var(--color-text)] flex-none">
            <AlertTriangle className="w-4 h-4 text-[var(--risk-crit)] flex-none" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulario con scroll interno */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs overflow-y-auto pr-1 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre Completo */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Nombre y Apellidos *
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  required
                  placeholder="Ej. Roberto Sánchez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
                />
              </div>
            </div>

            {/* Email Corporativo */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Email Corporativo (Login) *
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="email"
                  required
                  placeholder="usuario@organizacion.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contraseña Inicial */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Contraseña Temporal de Acceso *
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-9 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Rol Asignado */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Rol Asignado (Techo Máx: Nivel {callerRoleLevel}) *
              </label>
              <div className="relative">
                <Shield className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
                >
                  {allowedRoles.map((r) => (
                    <option key={r.role} value={r.role}>
                      {r.label} (NIVEL {r.level})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Teléfono Directo */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Teléfono Directo / Satelital
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
                />
              </div>
            </div>

            {/* Contacto de Emergencia */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Contacto de Emergencia
              </label>
              <input
                type="text"
                placeholder="Canal o persona de contacto"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
              />
            </div>
          </div>

          {/* Supervisor RSO (Solo si el rol es OPERATOR) */}
          {role === 'OPERATOR' && (
            <div className="space-y-1 pt-2 border-t border-[var(--color-divider)]/50">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Oficial RSO Supervisor Asignado
              </label>
              <select
                value={supervisingRsoId}
                onChange={(e) => setSupervisingRsoId(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
              >
                <option value="">-- Sin RSO supervisor asignado --</option>
                {availableSupervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECCIÓN DINÁMICA: ZONAS BAJO CONTROL (RSO vs CONTROL_TOWER)             */}
          {/* ========================================================================= */}
          {role === 'RSO' && (
            <div className="space-y-2 pt-3 border-t border-[var(--color-divider)]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-accent)] block">
                    ASIGNACIÓN OPERATIVA DE ÁREAS // LISTA DE INCLUSIÓN
                  </span>
                  <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    <span>Zonas Bajo Control del Oficial RSO ({controlledZoneIds.length} seleccionadas)</span>
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Seleccione las zonas sobre las que este Oficial RSO tendrá mando directo. Si una zona ya tenía un RSO asignado, se reasignará automáticamente al guardar.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <button
                    type="button"
                    onClick={handleSelectAllRsoZones}
                    className="text-[10px] font-mono px-2 py-1 border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    Marcar Todas
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllRsoZones}
                    className="text-[10px] font-mono px-2 py-1 border border-[var(--color-divider)] hover:border-[var(--color-accent)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {zones.length === 0 ? (
                <div className="p-3 border border-[var(--color-divider)] text-center text-muted font-mono text-[11px]">
                  No hay zonas tácticas registradas en la organización.
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto border border-[var(--color-divider)] divide-y divide-[var(--color-divider)]/40 bg-[var(--color-bg)]">
                  {zones.map((z) => {
                    const isSelected = controlledZoneIds.includes(z.id);
                    const currentColor = getSeverityColor(z.severity, z.zone_type, 'css');
                    const currentlyAssignedName = z.assigned_rso_id
                      ? supervisorNameMap.get(z.assigned_rso_id) || 'Otro RSO'
                      : null;

                    return (
                      <label
                        key={z.id}
                        className={`flex items-center justify-between p-2.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors ${
                          isSelected ? 'bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleRsoZone(z.id)}
                            className="accent-[var(--color-accent)]"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-none"
                            style={{ backgroundColor: currentColor }}
                          />
                          <div>
                            <span className="font-semibold text-xs text-[var(--color-text)]">
                              {z.name}
                            </span>
                            <span className="ml-2 text-[10px] font-mono text-[var(--color-text-muted)]">
                              [{z.zone_type} // {z.severity}]
                            </span>
                          </div>
                        </div>

                        {currentlyAssignedName && !isSelected && (
                          <div className="text-[10px] font-mono text-muted italic flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                            <span>Asignada a: {currentlyAssignedName}</span>
                          </div>
                        )}
                        {isSelected && currentlyAssignedName && (
                          <span className="text-[10px] font-mono text-[var(--color-accent)] font-semibold">
                            (Se reasignará a este RSO)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {role === 'CONTROL_TOWER' && (
            <div className="space-y-2 pt-3 border-t border-[var(--color-divider)]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 block">
                    ALCANCE Y VISIBILIDAD // LISTA DE EXCLUSIÓN
                  </span>
                  <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      Control de Zonas ({zones.length - excludedZoneIds.length} de {zones.length} activas)
                    </span>
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Torre de Control cuenta con visibilidad total por defecto. Desmarque las zonas que desee restringir/excluir para este operador.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <button
                    type="button"
                    onClick={handleIncludeAllCtZones}
                    className="text-[10px] font-mono px-2 py-1 border border-[var(--color-divider)] hover:border-sky-400 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    Marcar Todas
                  </button>
                  <button
                    type="button"
                    onClick={handleExcludeAllCtZones}
                    className="text-[10px] font-mono px-2 py-1 border border-[var(--color-divider)] hover:border-sky-400 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    Excluir Todas
                  </button>
                </div>
              </div>

              {zones.length === 0 ? (
                <div className="p-3 border border-[var(--color-divider)] text-center text-muted font-mono text-[11px]">
                  No hay zonas tácticas registradas en la organización.
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto border border-[var(--color-divider)] divide-y divide-[var(--color-divider)]/40 bg-[var(--color-bg)]">
                  {zones.map((z) => {
                    const isExcluded = excludedZoneIds.includes(z.id);
                    const isChecked = !isExcluded;
                    const currentColor = getSeverityColor(z.severity, z.zone_type, 'css');

                    return (
                      <label
                        key={z.id}
                        className={`flex items-center justify-between p-2.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors ${
                          isExcluded ? 'opacity-50 bg-[color-mix(in_srgb,var(--risk-crit)_5%,transparent)]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleControlTowerZone(z.id)}
                            className="accent-sky-500"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-none"
                            style={{ backgroundColor: currentColor }}
                          />
                          <div>
                            <span className={`font-semibold text-xs ${isExcluded ? 'line-through text-muted' : 'text-[var(--color-text)]'}`}>
                              {z.name}
                            </span>
                            <span className="ml-2 text-[10px] font-mono text-[var(--color-text-muted)]">
                              [{z.zone_type} // {z.severity}]
                            </span>
                          </div>
                        </div>

                        {isExcluded ? (
                          <span className="text-[10px] font-mono text-[var(--risk-crit)] font-semibold">
                            [EXCLUIDA / RESTRINGIDA]
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[var(--risk-stable)]">
                            Visible
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-divider)] flex-none">
            <button
              type="button"
              onClick={handleResetAndClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-[var(--color-divider)] text-xs font-heading uppercase tracking-wider hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[var(--color-accent)] text-[var(--color-bg)] text-xs font-heading font-semibold uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Aprovisionando...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Dar de Alta Usuario</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
