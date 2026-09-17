'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Shield,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Edit3,
  Power,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Radio,
  UserCheck,
} from 'lucide-react';
import { BlueprintPlate } from '@/components/industry/BlueprintPlate';
import { ZoneType, ZoneSeverity } from '@/types/database';

interface ZonasScreenProps {
  canManageZones?: boolean;
  onOpenCreateZone?: () => void;
  onEditZone?: (zone: any) => void;
  refreshTrigger?: number;
}

export const ZonasScreen: React.FC<ZonasScreenProps> = ({
  canManageZones = false,
  onOpenCreateZone,
  onEditZone,
  refreshTrigger = 0,
}) => {
  const [zones, setZones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RESPONSIBILITY' | 'THREAT'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Estado para modal de confirmación de eliminación
  const [deletingZone, setDeletingZone] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cargar zonas desde la API
  const fetchZones = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/zones');
      if (!res.ok) {
        throw new Error(`Error ${res.status}: Fallo al consultar el catálogo de zonas.`);
      }
      const data = await res.json();
      setZones(data.features || []);
    } catch (err: any) {
      console.error('Error al cargar zonas:', err);
      setError(err.message || 'Error de conexión con el servidor.');
      setZones([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, [refreshTrigger]);

  // Limpiar mensaje de éxito tras 4 segundos
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  // Filtrado reactivo de zonas
  const filteredZones = useMemo(() => {
    return zones.filter((f: any) => {
      const p = f.properties || {};
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();

      // Búsqueda por texto
      if (query && !name.includes(query) && !desc.includes(query)) {
        return false;
      }

      // Filtro por tipo
      const zType = p.zone_type || 'THREAT';
      if (typeFilter !== 'ALL' && zType !== typeFilter) {
        return false;
      }

      // Filtro por severidad
      if (severityFilter !== 'ALL' && p.severity !== severityFilter) {
        return false;
      }

      // Filtro por estado
      const isActive = p.is_active !== false;
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'INACTIVE' && isActive) return false;

      return true;
    });
  }, [zones, searchQuery, typeFilter, severityFilter, statusFilter]);

  // Alternar estado activo/inactivo (Soft-delete / reactivación)
  const handleToggleActive = async (zone: any) => {
    const currentActive = zone.properties?.is_active !== false;
    const newActive = !currentActive;
    const zoneId = zone.id || zone.properties?.id;

    try {
      const res = await fetch(`/api/zones/${zoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActive }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al cambiar estado de la zona.');
      }

      setActionSuccess(`Zona "${zone.properties?.name}" ${newActive ? 'activada' : 'desactivada'} correctamente.`);
      fetchZones();
    } catch (err: any) {
      alert(`Fallo en la operación: ${err.message}`);
    }
  };

  // Confirmar y ejecutar eliminación permanente
  const handleConfirmDelete = async () => {
    if (!deletingZone) return;
    const zoneId = deletingZone.id || deletingZone.properties?.id;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/zones/${zoneId}?permanent=true`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const d = await res.json();
        if (res.status === 409) {
          throw new Error('No se puede eliminar la zona: existen alertas tácticas históricas vinculadas a su perímetro.');
        }
        throw new Error(d.error || 'Fallo al eliminar la zona.');
      }

      setActionSuccess(`Zona "${deletingZone.properties?.name}" eliminada permanentemente.`);
      setDeletingZone(null);
      fetchZones();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Métricas de resumen
  const totalCount = zones.length;
  const controlCount = zones.filter((f: any) => f.properties?.zone_type === 'RESPONSIBILITY').length;
  const threatCount = zones.filter((f: any) => f.properties?.zone_type !== 'RESPONSIBILITY').length;

  return (
    <div className="zonas flex flex-col h-full min-h-0 bg-[var(--color-bg)] text-[var(--color-text)] p-4 gap-4 overflow-y-auto font-body">
      {/* Cabecera Informativa */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--color-divider)] pb-3 gap-3 flex-none">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-[var(--color-accent)]" />
          <div>
            <h1 className="font-heading text-base font-semibold uppercase tracking-wide">
              Gestión de Áreas Tácticas // Teatros y Perímetros
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
              Catálogo administrativo de zonas de control de RSO y perímetros de riesgo táctico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs font-mono pr-2">
            <span className="text-[var(--color-text-muted)]">Total: <b>{totalCount}</b></span>
            <span>Control: <b className="text-[var(--color-accent)]">{controlCount}</b></span>
            <span>Peligro: <b className="text-amber-400">{threatCount}</b></span>
          </div>

          <button
            type="button"
            onClick={fetchZones}
            title="Refrescar catálogo"
            className="p-1.5 border border-[var(--color-divider)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)]"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {canManageZones && onOpenCreateZone && (
            <button
              type="button"
              onClick={onOpenCreateZone}
              className="px-3.5 py-1.5 bg-[var(--color-accent)] text-white text-xs font-heading font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva Área
            </button>
          )}
        </div>
      </div>

      {/* Alerta de notificación de éxito */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <BlueprintPlate variant="panel" className="p-3 flex-none">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Búsqueda por texto */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--color-text)] opacity-50" />
            <input
              type="text"
              placeholder="Buscar por nombre o descripción de zona..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Filtro por Tipo */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="ALL">Tipología: Todas</option>
              <option value="RESPONSIBILITY">🛡️ Solo Zonas de Control</option>
              <option value="THREAT">⚠️ Solo Áreas de Peligro</option>
            </select>
          </div>

          {/* Filtro por Severidad */}
          <div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="ALL">Severidad: Todas</option>
              <option value="OPERATIONAL">OPERACIONAL (Neutro)</option>
              <option value="RED">ZONA ROJA (Crítica)</option>
              <option value="AMBER">ZONA ÁMBAR (Alerta)</option>
              <option value="SAFE_HAVEN">REFUGIO SEGURO</option>
              <option value="CORRIDOR">CORREDOR TÁCTICO</option>
            </select>
          </div>
        </div>
      </BlueprintPlate>

      {/* Tabla del Catálogo de Zonas */}
      <BlueprintPlate variant="panel" className="flex-1 min-h-[300px] overflow-hidden flex flex-col p-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="bg-[var(--color-surface)] border-b border-[var(--color-divider)] uppercase text-[10px] text-[var(--color-text-muted)] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Área / Directiva</th>
                <th className="py-2.5 px-3">Tipología</th>
                <th className="py-2.5 px-3">Severidad</th>
                <th className="py-2.5 px-3">Oficial RSO</th>
                <th className="py-2.5 px-3">Restricciones</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-divider)]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs opacity-60">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--color-accent)]" />
                    Cargando catálogo de zonas desde PostGIS...
                  </td>
                </tr>
              ) : filteredZones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs opacity-60">
                    {zones.length === 0 ? (
                      <div>
                        <Layers className="w-6 h-6 mx-auto mb-1 opacity-40" />
                        <span className="block font-heading font-semibold uppercase">No hay áreas registradas</span>
                        <span className="text-[11px] block mt-1">Crea tu primer teatro de control con el botón superior.</span>
                      </div>
                    ) : (
                      'No se encontraron zonas que coincidan con los filtros seleccionados.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredZones.map((f: any) => {
                  const p = f.properties || {};
                  const isResp = p.zone_type === 'RESPONSIBILITY';
                  const isActive = p.is_active !== false;

                  return (
                    <tr
                      key={f.id || p.id}
                      className="hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] transition-colors"
                    >
                      {/* Nombre y Descripción */}
                      <td className="py-2.5 px-3 max-w-[220px]">
                        <div className="font-heading font-bold text-xs uppercase text-[var(--color-text)] truncate">
                          {p.name || 'Sin nombre'}
                        </div>
                        {p.description && (
                          <div className="text-[11px] text-[var(--color-text-muted)] truncate font-sans">
                            {p.description}
                          </div>
                        )}
                      </td>

                      {/* Tipología */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[10px] font-mono uppercase ${
                            isResp
                              ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                              : 'border-amber-500/80 text-amber-400 bg-amber-500/10'
                          }`}
                        >
                          {isResp ? <Shield className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {isResp ? 'CONTROL' : 'PELIGRO'}
                        </span>
                      </td>

                      {/* Severidad */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className="px-2 py-0.5 border text-[10px] uppercase font-bold"
                          style={{
                            borderColor: isResp ? 'var(--color-accent)' : p.color || '#98989b',
                            color: isResp ? 'var(--color-accent)' : p.color || '#98989b',
                          }}
                        >
                          {p.severity}
                        </span>
                      </td>

                      {/* RSO Asignado */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {p.assigned_rso_id ? (
                          <span className="flex items-center gap-1 text-[11px] text-[var(--color-text)]">
                            <UserCheck className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                            Asignado
                          </span>
                        ) : (
                          <span className="text-[11px] opacity-40">--</span>
                        )}
                      </td>

                      {/* Restricciones Tácticas */}
                      <td className="py-2.5 px-3 text-[11px] whitespace-nowrap">
                        {p.is_curfew ? (
                          <span className="text-amber-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {p.curfew_start?.slice(0, 5)} - {p.curfew_end?.slice(0, 5)}
                          </span>
                        ) : p.buffer_meters > 0 ? (
                          <span>Buffer: {p.buffer_meters}m</span>
                        ) : (
                          <span className="opacity-40">Estándar</span>
                        )}
                      </td>

                      {/* Estado Activo / Inactivo */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] uppercase border ${
                            isActive
                              ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10'
                              : 'border-red-500/60 text-red-400 bg-red-500/10'
                          }`}
                        >
                          {isActive ? 'ACTIVA' : 'INACTIVA'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManageZones && onEditZone && (
                            <button
                              type="button"
                              onClick={() => onEditZone(f)}
                              title="Editar área táctica"
                              className="p-1 border border-[var(--color-divider)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-[var(--color-text-muted)] transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManageZones && (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(f)}
                              title={isActive ? 'Desactivar zona (Soft-delete)' : 'Activar zona'}
                              className={`p-1 border transition-colors ${
                                isActive
                                  ? 'border-[var(--color-divider)] hover:border-amber-500 hover:text-amber-400 text-[var(--color-text-muted)]'
                                  : 'border-[var(--color-divider)] hover:border-emerald-500 hover:text-emerald-400 text-[var(--color-text-muted)]'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManageZones && (
                            <button
                              type="button"
                              onClick={() => setDeletingZone(f)}
                              title="Eliminar área permanentemente"
                              className="p-1 border border-[var(--color-divider)] hover:border-red-500 hover:text-red-400 text-[var(--color-text-muted)] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      </BlueprintPlate>

      {/* Modal de Confirmación de Eliminación Permanente */}
      {deletingZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="blueprint relative w-full max-w-md bg-[var(--color-bg)] border border-red-500/80 p-5 shadow-2xl">
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />

            <div className="flex items-center gap-2 text-red-400 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-heading font-bold uppercase text-sm">
                Confirmar Eliminación Permanente
              </h3>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-4 font-mono">
              ¿Está seguro de que desea eliminar la zona{' '}
              <strong className="text-[var(--color-text)]">"{deletingZone.properties?.name}"</strong>?
              Esta acción no se puede deshacer y retirará el polígono geométrico de la cartografía PostGIS.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-divider)]">
              <button
                type="button"
                onClick={() => setDeletingZone(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 border border-[var(--color-divider)] text-xs uppercase font-heading hover:bg-[var(--color-surface)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs uppercase font-heading font-bold flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <span className="animate-pulse">Eliminando...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar Definitivamente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
