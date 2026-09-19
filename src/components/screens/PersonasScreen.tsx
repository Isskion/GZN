'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  RefreshCw,
  Search,
  Shield,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle,
  Edit2,
  Power,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Profile, UserRole, ROLE_LEVELS } from '@/types/database';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';
import { UserCreationModal } from '@/components/tactical/UserCreationModal';
import { UserEditModal } from '@/components/tactical/UserEditModal';

interface PersonasScreenProps {
  currentProfile?: Profile | null;
  currentUser?: { id: string; email?: string } | null;
}

type RoleTab = 'ALL' | UserRole;

export const PersonasScreen: React.FC<PersonasScreenProps> = ({
  currentProfile,
  currentUser,
}) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RoleTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [includeInactive, setIncludeInactive] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  // Nivel de autoridad del usuario en sesión
  const callerRoleLevel =
    currentProfile?.role_level ??
    (currentProfile?.role ? ROLE_LEVELS[currentProfile.role] : 60);

  const canManageUsers = callerRoleLevel >= 60;

  // Carga de perfiles mediante el endpoint jerárquico ?scope=hierarchy
  const fetchProfiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profiles?scope=hierarchy&include_inactive=true');
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('401 No Autorizado: Se requiere sesión activa para consultar el personal.');
        }
        if (res.status === 403) {
          throw new Error('403 Acceso Denegado: Su perfil no cuenta con permisos para listar usuarios.');
        }
        throw new Error(`Error ${res.status}: Fallo al sincronizar el personal de la organización.`);
      }

      const data = await res.json();
      setProfiles(data.profiles || data.data || []);
    } catch (err: any) {
      console.error('[PersonasScreen] Error fetching profiles:', err);
      setError(err.message || 'Error de sincronización con /api/profiles.');
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Toggle rápido de estado (Activo / Inactivo)
  const handleToggleActive = async (p: Profile) => {
    if (p.id === currentUser?.id || p.id === currentProfile?.id) {
      showToast('Operación bloqueada: No puede desactivar su propia cuenta.');
      return;
    }

    try {
      const newStatus = !p.is_active;
      const res = await fetch(`/api/profiles/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al modificar estado del usuario.');
      }

      setProfiles((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, is_active: newStatus } : item))
      );

      showToast(
        newStatus
          ? `Usuario ${p.full_name} activado correctamente.`
          : `Usuario ${p.full_name} desactivado (acceso revocado).`
      );
    } catch (err: any) {
      console.error('[PersonasScreen] Error toggling status:', err);
      showToast(`Error: ${err.message}`);
    }
  };

  const handleUserCreated = (newProfile: Profile) => {
    setProfiles((prev) => [newProfile, ...prev]);
    showToast(`Usuario ${newProfile.full_name} (${newProfile.role}) dado de alta.`);
  };

  const handleUserUpdated = (updated: Profile) => {
    setProfiles((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
    showToast(`Ficha de ${updated.full_name} actualizada.`);
  };

  // Supervisores activos para asignación (RSO, CONTROL_TOWER, ORG_ADMIN)
  const availableSupervisors = useMemo(() => {
    return profiles
      .filter((p) => p.is_active && (p.role_level ?? 0) >= 60)
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        role_level: p.role_level,
      }));
  }, [profiles]);

  // Mapa de nombres de supervisores para visualización en tabla
  const supervisorMap = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((p) => {
      map.set(p.id, p.full_name);
    });
    return map;
  }, [profiles]);

  // Pestañas jerárquicas dinámicas: Solo se muestran los roles visibles para el invocador
  const allTabs: Array<{ id: RoleTab; label: string; minLevel: number; tag: string }> = [
    { id: 'ALL', label: 'Todos', minLevel: 0, tag: 'TOTAL' },
    { id: 'ORG_ADMIN', label: 'Administradores', minLevel: 100, tag: 'NIVEL 100' },
    { id: 'CONTROL_TOWER', label: 'Torre de Control', minLevel: 80, tag: 'NIVEL 80' },
    { id: 'RSO', label: 'Oficiales RSO', minLevel: 60, tag: 'NIVEL 60' },
    { id: 'OPERATOR', label: 'Operadores', minLevel: 40, tag: 'NIVEL 40' },
  ];
  const availableTabs = allTabs.filter((tab) => tab.minLevel <= callerRoleLevel);

  // Filtrado de perfiles en cliente
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      // Filtro de pestaña de rol
      if (activeTab !== 'ALL' && p.role !== activeTab) {
        return false;
      }

      // Filtro de estado inactivo
      if (!includeInactive && !p.is_active) {
        return false;
      }

      // Filtro de búsqueda
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.full_name?.toLowerCase().includes(query);
        const matchesEmail = p.email?.toLowerCase().includes(query);
        const matchesPhone = p.phone?.toLowerCase().includes(query);
        return matchesName || matchesEmail || matchesPhone;
      }

      return true;
    });
  }, [profiles, activeTab, includeInactive, searchQuery]);

  // Contadores por rol
  const countsByRole = useMemo(() => {
    const counts: Record<string, number> = { ALL: profiles.length };
    profiles.forEach((p) => {
      counts[p.role] = (counts[p.role] || 0) + 1;
    });
    return counts;
  }, [profiles]);

  const getRoleBadge = (role: UserRole, level?: number) => {
    switch (role) {
      case 'ORG_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-amber-500/50 bg-amber-500/10 text-amber-400 font-mono text-[10px] font-semibold tracking-wider uppercase">
            <Shield className="w-3 h-3" />
            <span>ORG_ADMIN</span>
            <span className="opacity-70 text-[9px]">L{level ?? 100}</span>
          </span>
        );
      case 'CONTROL_TOWER':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-sky-500/50 bg-sky-500/10 text-sky-400 font-mono text-[10px] font-semibold tracking-wider uppercase">
            <Shield className="w-3 h-3" />
            <span>TORRE_CONTROL</span>
            <span className="opacity-70 text-[9px]">L{level ?? 80}</span>
          </span>
        );
      case 'RSO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-semibold tracking-wider uppercase">
            <Shield className="w-3 h-3" />
            <span>OFICIAL_RSO</span>
            <span className="opacity-70 text-[9px]">L{level ?? 60}</span>
          </span>
        );
      case 'OPERATOR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-slate-500/50 bg-slate-500/10 text-slate-300 font-mono text-[10px] font-semibold tracking-wider uppercase">
            <Shield className="w-3 h-3" />
            <span>OPERADOR</span>
            <span className="opacity-70 text-[9px]">L{level ?? 40}</span>
          </span>
        );
      default:
        return <span className="tag tag-neutral">{role}</span>;
    }
  };

  return (
    <div className="personas flex flex-col h-full min-h-0 bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden relative font-sans">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[1300] bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-accent)] px-4 py-2.5 shadow-2xl flex items-center gap-2 text-xs font-mono animate-in slide-in-from-bottom-2">
          <CheckCircle className="w-4 h-4 text-[var(--risk-stable)] flex-none" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Banner de Error */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-[color-mix(in_srgb,var(--risk-crit)_12%,transparent)] border border-[var(--risk-crit)] text-[var(--color-text)] flex items-center justify-between gap-3 text-xs flex-none">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--risk-crit)] flex-none" />
            <div>
              <span className="font-heading font-semibold text-[var(--risk-crit)] uppercase tracking-wider">
                Error de Sincronización de Personal:{' '}
              </span>
              <span className="opacity-90">{error}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchProfiles}
            className="btn btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {/* Pestañas de Roles Dinámicas (Aislamiento Jerárquico) */}
      <div className="tabs-bar flex items-center justify-between gap-4 px-4 pt-3 pb-0 border-b border-[var(--color-divider)] bg-[color-mix(in_srgb,var(--color-surface)_40%,transparent)] flex-none flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto">
          {availableTabs.map((tab) => {
            const count = countsByRole[tab.id] || 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3.5 py-2 text-xs font-heading tracking-wider uppercase transition-all flex items-center gap-2 border-b-2 ${
                  isActive
                    ? 'border-[var(--color-accent)] text-[var(--color-text)] font-semibold bg-[var(--color-surface)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-none ${
                    isActive
                      ? 'bg-[var(--color-accent)] text-[var(--color-bg)] font-bold'
                      : 'bg-[var(--color-divider)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Botón de Alta Rápida en Cabecera */}
        {canManageUsers && (
          <div className="pb-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-1.5 bg-[var(--color-accent)] text-[var(--color-bg)] text-xs font-heading font-semibold uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Alta de Usuario</span>
            </button>
          </div>
        )}
      </div>

      {/* Filtros de Búsqueda y Control de Inactivos */}
      <div className="filters-bar flex items-center justify-between gap-4 px-4 py-2.5 border-b border-[var(--color-divider)] bg-[color-mix(in_srgb,var(--color-surface)_20%,transparent)] flex-wrap flex-none text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar por nombre, email o teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[var(--color-bg)] border border-[var(--color-divider)] pl-8 pr-3 py-1.5 text-xs w-72 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            <span>Incluir cuentas inactivas / bajas</span>
          </label>
        </div>

        <button
          type="button"
          onClick={fetchProfiles}
          disabled={isLoading}
          className="btn btn-secondary text-xs flex items-center gap-1.5 py-1 px-3"
          title="Actualizar listado de personal"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Tabla Táctica Industry Blueprint */}
      <div className="tablewrap flex-1 overflow-auto p-4">
        <BlueprintPlate
          kicker="Gobierno de Personal Corporativo"
          title={`Personal de Organización (${filteredProfiles.length} registros)`}
          headerRight={
            <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-muted)]">
              <span>NIVEL AUTORIDAD:</span>
              <span className="text-[var(--color-accent)] font-semibold">
                L{callerRoleLevel} ({currentProfile?.role || 'OPERATOR'})
              </span>
            </div>
          }
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-divider)] text-[10px] uppercase font-heading tracking-widest text-muted bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)]">
                <th className="p-3">Identidad / Personal</th>
                <th className="p-3">Rol & Jerarquía</th>
                <th className="p-3">Contacto Operativo</th>
                <th className="p-3">Supervisor RSO</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color-mix(in_srgb,var(--color-divider)_60%,transparent)]">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted font-mono">
                    {isLoading
                      ? 'Sincronizando registros con GET /api/profiles...'
                      : error
                      ? 'No hay registros cargados debido a un error de conexión.'
                      : 'No se encontraron usuarios en la organización para los criterios aplicados.'}
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => {
                  const isSelf = p.id === currentUser?.id || p.id === currentProfile?.id;
                  const canManageThisUser = canManageUsers && (p.role_level ?? 0) <= callerRoleLevel;
                  const supervisorName = p.supervising_rso_id
                    ? supervisorMap.get(p.supervising_rso_id) || 'RSO Asignado'
                    : null;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors group ${
                        !p.is_active ? 'opacity-60 bg-[color-mix(in_srgb,var(--color-surface)_20%,transparent)]' : ''
                      }`}
                    >
                      {/* Identidad */}
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[var(--color-divider)] flex items-center justify-center font-mono font-semibold text-xs text-[var(--color-text)] flex-none">
                            {p.full_name
                              ? p.full_name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join('')
                                  .toUpperCase()
                              : 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-sm flex items-center gap-1.5">
                              <span>{p.full_name}</span>
                              {isSelf && (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/40">
                                  USTED
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[var(--color-text-muted)] flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 opacity-70" />
                              <span>{p.email || 'Sin correo asociado'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Rol y Jerarquía */}
                      <td className="p-3">{getRoleBadge(p.role, p.role_level)}</td>

                      {/* Contacto */}
                      <td className="p-3">
                        <div className="space-y-0.5 text-[11px] font-mono">
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-[var(--color-text-muted)]" />
                            <span>{p.phone || 'N/D'}</span>
                          </div>
                          {p.emergency_contact && (
                            <div className="text-[10px] text-[var(--color-text-muted)]">
                              Emerg: {p.emergency_contact}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Supervisión RSO */}
                      <td className="p-3 text-[11px] font-mono">
                        {p.role === 'OPERATOR' ? (
                          supervisorName ? (
                            <span className="text-[var(--color-accent)]">
                              {supervisorName}
                            </span>
                          ) : (
                            <span className="text-muted italic">Sin asignar</span>
                          )
                        ) : (
                          <span className="text-muted">N/A (Mando)</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="p-3">
                        {p.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-[var(--risk-stable)] bg-[color-mix(in_srgb,var(--risk-stable)_12%,transparent)] px-2 py-0.5 border border-[var(--risk-stable)]/40">
                            <UserCheck className="w-3 h-3" />
                            <span>ACTIVO</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-[var(--risk-crit)] bg-[color-mix(in_srgb,var(--risk-crit)_12%,transparent)] px-2 py-0.5 border border-[var(--risk-crit)]/40">
                            <UserX className="w-3 h-3" />
                            <span>INACTIVO</span>
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingProfile(p)}
                            disabled={!canManageThisUser && !isSelf}
                            className={`p-1.5 border text-xs flex items-center gap-1 transition-colors ${
                              canManageThisUser || isSelf
                                ? 'border-[var(--color-divider)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                                : 'opacity-40 border-transparent cursor-not-allowed'
                            }`}
                            title="Editar ficha de usuario"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span className="text-[10px] uppercase font-mono">Editar</span>
                          </button>

                          {!isSelf && canManageThisUser && (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(p)}
                              className={`p-1.5 border text-xs flex items-center gap-1 transition-colors ${
                                p.is_active
                                  ? 'border-[var(--risk-crit)]/40 text-[var(--risk-crit)] hover:bg-[color-mix(in_srgb,var(--risk-crit)_15%,transparent)]'
                                  : 'border-[var(--risk-stable)]/40 text-[var(--risk-stable)] hover:bg-[color-mix(in_srgb,var(--risk-stable)_15%,transparent)]'
                              }`}
                              title={p.is_active ? 'Desactivar cuenta' : 'Activar cuenta'}
                            >
                              <Power className="w-3.5 h-3.5" />
                              <span className="text-[10px] uppercase font-mono">
                                {p.is_active ? 'Baja' : 'Alta'}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </BlueprintPlate>
      </div>

      {/* Modal de Alta de Usuario */}
      <UserCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onUserCreated={handleUserCreated}
        callerRoleLevel={callerRoleLevel}
        availableSupervisors={availableSupervisors}
      />

      {/* Modal de Edición de Usuario */}
      <UserEditModal
        isOpen={!!editingProfile}
        onClose={() => setEditingProfile(null)}
        targetUser={editingProfile}
        currentUserId={currentUser?.id || currentProfile?.id}
        callerRoleLevel={callerRoleLevel}
        availableSupervisors={availableSupervisors}
        onUserUpdated={handleUserUpdated}
      />
    </div>
  );
};
