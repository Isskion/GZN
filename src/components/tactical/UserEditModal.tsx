'use client';

import React, { useState, useEffect } from 'react';
import { X, UserCheck, Shield, Lock, Eye, EyeOff, Mail, User, Phone, AlertTriangle, CheckCircle, Power } from 'lucide-react';
import { Profile, UserRole, ROLE_LEVELS } from '@/types/database';

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: Profile | null;
  currentUserId?: string;
  callerRoleLevel?: number;
  availableSupervisors?: Array<{ id: string; full_name: string; role: string }>;
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

  const isSelf = targetUser?.id === currentUserId;
  const allowedRoles = ROLE_DEFINITIONS.filter((r) => r.level <= callerRoleLevel);

  useEffect(() => {
    if (targetUser) {
      setFullName(targetUser.full_name || '');
      setRole(targetUser.role || 'OPERATOR');
      setPhone(targetUser.phone || '');
      setEmergencyContact(targetUser.emergency_contact || '');
      setSupervisingRsoId(targetUser.supervising_rso_id || '');
      setIsActive(targetUser.is_active ?? true);
      setNewPassword('');
      setShowPassword(false);
      setError(null);
    }
  }, [targetUser]);

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

      // Si no es el propio usuario, se permite modificar rol y estado
      if (!isSelf) {
        payload.role = role;
        payload.is_active = isActive;
        if (role === 'OPERATOR') {
          payload.supervising_rso_id = supervisingRsoId || null;
        } else {
          payload.supervising_rso_id = null;
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
      <div className="relative w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] shadow-2xl rounded-none p-6 font-sans">
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
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
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
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-divider)]">
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
