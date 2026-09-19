'use client';

import React, { useState, useEffect } from 'react';
import { X, UserPlus, Shield, Lock, Eye, EyeOff, Mail, User, Phone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Profile, UserRole, ROLE_LEVELS } from '@/types/database';

interface UserCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newProfile: Profile) => void;
  callerRoleLevel?: number;
  availableSupervisors?: Array<{ id: string; full_name: string; role: string; role_level?: number }>;
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

  // Filtrar roles disponibles según el techo jerárquico del invocador
  const allowedRoles = ROLE_DEFINITIONS.filter((r) => r.level <= callerRoleLevel);

  // Ajustar rol por defecto si el actual no está permitido
  useEffect(() => {
    if (allowedRoles.length > 0 && !allowedRoles.some((r) => r.role === role)) {
      setRole(allowedRoles[allowedRoles.length - 1].role);
    }
  }, [callerRoleLevel, allowedRoles, role]);

  if (!isOpen) return null;

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
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-divider)] text-[var(--color-text)] shadow-2xl rounded-none p-6 font-sans">
        {/* Esquinas tácticas Blueprint */}
        <span className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">
          +
        </span>
        <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">
          +
        </span>
        <span className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">
          +
        </span>
        <span className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 text-[var(--color-divider)] select-none font-mono text-xs">
          +
        </span>

        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3 mb-5">
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
            <div className="space-y-1 pt-1 border-t border-[var(--color-divider)]/50">
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

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-divider)]">
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
