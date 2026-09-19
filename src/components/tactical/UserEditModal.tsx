'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  UserCheck,
  Shield,
  Lock,
  Eye,
  EyeOff,
  Mail,
  User,
  Phone,
  AlertTriangle,
  CheckCircle,
  Power,
  MapPin,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { Profile, UserRole, ROLE_LEVELS } from '@/types/database';
import { ZoneSummary } from '@/components/tactical/UserCreationModal';
import { getSeverityColor } from '@/lib/geo/tactical-zones';

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: Profile | null;
  currentUserId?: string;
  callerRoleLevel?: number;
  availableSupervisors?: Array<{ id: string; full_name: string; role: string; role_level?: number }>;
  availableZones?: ZoneSummary[];
  onUserUpdated: (updatedProfile: Profile) => void;
}

const ROLE_DEFINITIONS: Array<{ role: UserRole; label: string; level: number }> = [
  { role: 'ORG_ADMIN', label: 'Administrador de Organización', level: 100 },
  { role: 'CONTROL_TOWER', label: 'Torre de Control', level: 80 },
  { role: 'RSO', label: 'Oficial RSO', level: 60 },
  { role: 'OPERATOR', label: 'Operador de Monitoreo', level: 40 },
];

export const UserEditModal: React.FC<UserEditModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  currentUserId,
  callerRoleLevel = 60,
  availableSupervisors = [],
  availableZones = [],
  onUserUpdated,
}) => {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [supervisingRsoId, setSupervisingRsoId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zonas tácticas y listas de inclusión / exclusión
  const [zones, setZones] = useState<ZoneSummary[]>(availableZones);
  const [controlledZoneIds, setControlledZoneIds] = useState<string[]>([]);
  const [excludedZoneIds, setExcludedZoneIds] = useState<string[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState(false);

  const isSelf = targetUser?.id === currentUserId;
  const allowedRoles = ROLE_DEFINITIONS.filter((r) => r.level <= callerRoleLevel);

  useEffect(() => {
    if (isOpen && targetUser) {
      setFullName(targetUser.full_name || '');
      setRole(targetUser.role || 'OPERATOR');
      setPhone(targetUser.phone || '');
      setEmergencyContact(targetUser.emergency_contact || '');
      setSupervisingRsoId(targetUser.supervising_rso_id || '');
      setIsActive(targetUser.is_active ?? true);
      setNewPassword('');
      setShowPassword(false);
      setError(null);

      // Pre-cargar zonas asignadas o excluidas si ya existen en targetUser
      setControlledZoneIds(targetUser.controlled_zone_ids || []);
      setExcludedZoneIds(targetUser.excluded_zone_ids || []);

      // Cargar lista de zonas tácticas si no se pasaron como prop
      if (availableZones && availableZones.length > 0) {
        setZones(availableZones);
      } else {
        setIsLoadingZones(true);
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
          .catch((err) => console.error('[UserEditModal] Error al consultar zonas:', err))
          .finally(() => setIsLoadingZones(false));
      }

      // Si targetUser no tiene controlled_zone_ids o excluded_zone_ids hidratados,
      // consultar GET /api/profiles/[id] para asegurar estado fresco y completo
      if (
        (targetUser.role === 'RSO' && (!targetUser.controlled_zone_ids || targetUser.controlled_zone_ids.length === 0)) ||
        (targetUser.role === 'CONTROL_TOWER' && (!targetUser.excluded_zone_ids || targetUser.excluded_zone_ids.length === 0))
      ) {
        fetch(`/api/profiles/${targetUser.id}`)
          .then((res) => res.json())
          .then((json) => {
            const profileData = json.data || json.profile;
            if (profileData) {
              if (Array.isArray(profileData.controlled_zone_ids)) {
                setControlledZoneIds(profileData.controlled_zone_ids);
              }
              if (Array.isArray(profileData.excluded_zone_ids)) {
                setExcludedZoneIds(profileData.excluded_zone_ids);
              }
            }
          })
          .catch((err) => console.error('[UserEditModal] Error al consultar perfil individual:', err));
      }
    }
  }, [isOpen, targetUser, availableZones]);

  // Toggle para Oficial RSO (lista de inclusión)
  const handleToggleRsoZone = (zoneId: string) => {
    setControlledZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleSelectAllRsoZones = () => {
    setControlledZoneIds(zones.map((z) => z.id));
  };

  const handleDeselectAllRsoZones = () => {
    setControlledZoneIds([]);
  };

  // Toggle para Torre de Control (lista de exclusión: desmarcar añade a exclusiones)
  const handleToggleControlTowerZone = (zoneId: string) => {
    setExcludedZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleIncludeAllCtZones = () => {
    setExcludedZoneIds([]);
  };

  const handleExcludeAllCtZones = () => {
    setExcludedZoneIds(zones.map((z) => z.id));
  };

  // Mapa de nombres de supervisores/RSOs para detectar a quién está asignada una zona
  const supervisorNameMap = useMemo(() => {
    const map = new Map<string, string>();
    availableSupervisors.forEach((s) => map.set(s.id, s.full_name));
    return map;
  }, [availableSupervisors]);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('El nombre completo es obligatorio.');
      return;
    }

    if (newPassword && newPassword.length < 8) {
      setError('La nueva contraseña debe tener un mínimo de 8 caracteres.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, any> = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        emergency_contact: emergencyContact.trim() || null,
      };

      // Si no es el propio usuario, se permite modificar rol, estado y zonas asignadas/excluidas
      if (!isSelf) {
        payload.role = role;
        payload.is_active = isActive;
        if (role === 'OPERATOR') {
          payload.supervising_rso_id = supervisingRsoId || null;
        } else {
          payload.supervising_rso_id = null;
        }

        // Sincronización de zonas bajo control
        if (role === 'RSO') {
          payload.controlled_zone_ids = controlledZoneIds;
        } else if (role === 'CONTROL_TOWER') {
          payload.excluded_zone_ids = excludedZoneIds;
        }
      }

      if (newPassword) {
        payload.password = newPassword;
      }

      const res = await fetch(`/api/profiles/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}: Fallo al actualizar usuario.`);
      }

      onUserUpdated(data.data || data.profile);
      onClose();
    } catch (err: any) {
      console.error('[UserEditModal] Error:', err);
      setError(err.message || 'Error inesperado al conectar con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] shadow-2xl rounded-none p-6 font-sans">
        {/* Esquinas tácticas Blueprint */}
        <span className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>
        <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>
        <span className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>
        <span className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">+</span>

        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest uppercase text-[var(--color-accent)] block">
                ADMINISTRACIÓN DE PERSONAL // FICHA DE USUARIO
              </span>
              <h2 className="text-base font-heading font-semibold uppercase tracking-wider text-[var(--color-text)]">
                Modificar Ficha: {targetUser.full_name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div className="mb-4 p-3 bg-[color-mix(in_srgb,var(--risk-crit)_15%,transparent)] border border-[var(--risk-crit)] text-xs flex items-center gap-2 text-[var(--color-text)]">
            <AlertTriangle className="w-4 h-4 text-[var(--risk-crit)] flex-none" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs overflow-y-auto pr-1">
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
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none"
                />
              </div>
            </div>

            {/* Email Corporativo (Solo Lectura) */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Email Corporativo (ID de Acceso)
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="email"
                  disabled
                  value={targetUser.email || 'N/D'}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-divider)] pl-8 pr-3 py-2 text-xs text-[var(--color-text-muted)] outline-none cursor-not-allowed font-mono opacity-80"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Rol Asignado */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Rol Operativo {isSelf && '(No editable para cuenta propia)'}
              </label>
              <div className="relative">
                <Shield className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <select
                  disabled={isSelf}
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className={`w-full bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none ${
                    isSelf ? 'opacity-60 cursor-not-allowed bg-[var(--color-surface)]' : ''
                  }`}
                >
                  {allowedRoles.map((r) => (
                    <option key={r.role} value={r.role}>
                      {r.label} (NIVEL {r.level})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Estado de Cuenta */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Estado de la Cuenta {isSelf && '(Anti-Autobloqueo activo)'}
              </label>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={isSelf}
                  onClick={() => setIsActive(!isActive)}
                  className={`px-3 py-1.5 border text-xs font-mono font-semibold flex items-center gap-2 transition-colors ${
                    isSelf
                      ? 'border-[var(--color-divider)] text-muted cursor-not-allowed opacity-60'
                      : isActive
                      ? 'bg-[color-mix(in_srgb,var(--risk-stable)_15%,transparent)] border-[var(--risk-stable)] text-[var(--risk-stable)]'
                      : 'bg-[color-mix(in_srgb,var(--risk-crit)_15%,transparent)] border-[var(--risk-crit)] text-[var(--risk-crit)]'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isActive ? 'CUENTA ACTIVA' : 'CUENTA DESACTIVADA'}</span>
                </button>
                {isSelf && (
                  <span className="text-[10px] text-muted italic">
                    Protección de sesión activa
                  </span>
                )}
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

          {/* Supervisor RSO (Solo si el rol es OPERATOR y no es cuenta propia) */}
          {role === 'OPERATOR' && (
            <div className="space-y-1 pt-1 border-t border-[var(--color-divider)]/50">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                Oficial RSO Supervisor Asignado
              </label>
              <select
                disabled={isSelf}
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

          {/* Zonas Bajo Control (Solo RSO: lista de inclusión) */}
          {role === 'RSO' && (
            <div className="space-y-2 pt-3 border-t border-[var(--color-divider)]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block">
                    ALCANCE Y ASIGNACIÓN // LISTA DE INCLUSIÓN
                  </span>
                  <h3 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--color-text)] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Zonas Bajo Control ({controlledZoneIds.length} de {zones.length} asignadas)
                    </span>
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Seleccione las zonas asignadas a este Oficial RSO. Las zonas seleccionadas se reasignarán a su cargo automáticamente.
                  </p>
                </div>
                {!isSelf && (
                  <div className="flex items-center gap-2 flex-none">
                    <button
                      type="button"
                      onClick={handleSelectAllRsoZones}
                      className="text-[10px] font-mono px-2 py-1 border border-[var(--color-divider)] hover:border-emerald-400 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                    >
                      Marcar Todas
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllRsoZones}
                      className="text-[10px] font-mono px-2 py-1 border border-[var(--color-divider)] hover:border-emerald-400 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                    >
                      Desmarcar
                    </button>
                  </div>
                )}
              </div>

              {isLoadingZones ? (
                <div className="p-3 border border-[var(--color-divider)] text-center text-muted font-mono text-[11px]">
                  Cargando catálogo de zonas...
                </div>
              ) : zones.length === 0 ? (
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
                    const isAssignedToThisUser = z.assigned_rso_id === targetUser.id;

                    return (
                      <label
                        key={z.id}
                        className={`flex items-center justify-between p-2.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors ${
                          isSelected ? 'bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]' : ''
                        } ${isSelf ? 'cursor-default' : ''}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            disabled={isSelf}
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

                        {isSelected && isAssignedToThisUser && (
                          <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                            (Asignada actualmente)
                          </span>
                        )}
                        {isSelected && !isAssignedToThisUser && currentlyAssignedName && (
                          <span className="text-[10px] font-mono text-[var(--color-accent)] font-semibold">
                            (Se reasignará a este RSO)
                          </span>
                        )}
                        {isSelected && !isAssignedToThisUser && !currentlyAssignedName && (
                          <span className="text-[10px] font-mono text-emerald-400">
                            (Nueva asignación)
                          </span>
                        )}
                        {!isSelected && currentlyAssignedName && !isAssignedToThisUser && (
                          <div className="text-[10px] font-mono text-muted italic flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                            <span>Asignada a: {currentlyAssignedName}</span>
                          </div>
                        )}
                        {!isSelected && isAssignedToThisUser && (
                          <span className="text-[10px] font-mono text-[var(--risk-crit)] italic">
                            (Se desasignará al guardar)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Control de Zonas (Solo CONTROL_TOWER: lista de exclusión) */}
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
                {!isSelf && (
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
                )}
              </div>

              {isLoadingZones ? (
                <div className="p-3 border border-[var(--color-divider)] text-center text-muted font-mono text-[11px]">
                  Cargando catálogo de zonas...
                </div>
              ) : zones.length === 0 ? (
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
                        } ${isSelf ? 'cursor-default' : ''}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            disabled={isSelf}
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

          {/* Reseteo de Contraseña (Opcional) */}
          <div className="space-y-1 pt-2 border-t border-[var(--color-divider)]/50">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              Nueva Contraseña (Dejar en blanco para no modificar)
            </label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                placeholder="Nueva clave (mín. 8 caracteres)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-divider)] flex-none">
            <button
              type="button"
              onClick={onClose}
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
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
