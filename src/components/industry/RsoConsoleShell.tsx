'use client';

import React, { useState } from 'react';
import { ConsoleHeader } from '@/components/industry/ConsoleHeader';
import { ConsoleRail, ScreenId } from '@/components/industry/ConsoleRail';
import { TerrenoScreen } from '@/components/screens/TerrenoScreen';
import { PersonasScreen } from '@/components/screens/PersonasScreen';
import { SituacionScreen } from '@/components/screens/SituacionScreen';
import { MensajesScreen } from '@/components/screens/MensajesScreen';
import { BriefingsScreen } from '@/components/screens/BriefingsScreen';
import { ZonasScreen } from '@/components/screens/ZonasScreen';
import { FloatingRsoButton } from '@/components/industry/FloatingRsoButton';
import { IncidentModal } from '@/components/industry/IncidentModal';
import { IncidentItem } from '@/components/industry/IncidentTape';
import { Profile, ROLE_LEVELS, UserRole } from '@/types/database';
import { ZoneCreationModal } from '@/components/tactical/ZoneCreationModal';
import { TravelerCreationModal } from '@/components/tactical/TravelerCreationModal';

interface RsoConsoleShellProps {
  user?: { id: string; email?: string } | null;
  profile?: Profile | null;
}

export function RsoConsoleShell({ user, profile }: RsoConsoleShellProps) {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('terreno');
  const [alertsCount, setAlertsCount] = useState<number>(1);
  const [activeIncidentModal, setActiveIncidentModal] = useState<IncidentItem | null>(null);
  const [isCreateZoneModalOpen, setIsCreateZoneModalOpen] = useState(false);
  const [isCreateTravelerModalOpen, setIsCreateTravelerModalOpen] = useState(false);
  const [createTravelerInitialCoords, setCreateTravelerInitialCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [editingZone, setEditingZone] = useState<any | null>(null);
  const [refreshZonesCounter, setRefreshZonesCounter] = useState(0);
  const [focusZoneId, setFocusZoneId] = useState<string | null>(null);
  const [terrainNavHandlers, setTerrainNavHandlers] = useState<{
    centerFleet?: () => void;
    centerRedZone?: () => void;
    centerSafeHaven?: () => void;
    getMapCenter?: () => { lat: number; lon: number };
  }>({});

  // Control RBAC: role_level >= 60 (RSO, CONTROL_TOWER, ORG_ADMIN)
  const roleLevel = profile?.role_level ?? (profile?.role ? ROLE_LEVELS[profile.role as keyof typeof ROLE_LEVELS] : 40);
  const canManageZones = roleLevel >= 60;
  const canManageTravelers = roleLevel >= 60;

  const screenTitles: Record<ScreenId, string> = {
    terreno: 'Terreno / Sector Táctico',
    zonas: 'Gestión de Zonas / Áreas',
    situacion: 'Situación Global',
    personas: 'Cartera de Personas',
    briefings: 'Sala de Briefings Tácticos',
    mensajes: 'Canal de Avisos',
  };

  const handleOpenActiveAlertModal = () => {
    setActiveIncidentModal({
      id: 'crit-01',
      title: 'Incursión Perímetro Norte',
      detail: 'Telemetría detecta cruce de geocerca en zona hostil de exclusión militar.',
      time: '19:42:10',
      severity: 'CRIT',
      targetCallsign: 'CONVOY-ALFA',
    });
  };

  const handleZoneCreated = (newZone: any) => {
    setRefreshZonesCounter((prev) => prev + 1);
    setIsCreateZoneModalOpen(false);
    setEditingZone(null);
  };

  const handleEditZone = (zone: any) => {
    setEditingZone(zone);
  };

  const handleOpenCreateTraveler = () => {
    if (terrainNavHandlers.getMapCenter) {
      setCreateTravelerInitialCoords(terrainNavHandlers.getMapCenter());
    } else {
      setCreateTravelerInitialCoords(null);
    }
    setIsCreateTravelerModalOpen(true);
  };

  return (
    <div id="app" className="grid grid-rows-[auto_1fr] h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-body overflow-hidden">
      {/* Topbar del Sistema Industry con marca y control de usuario */}
      <ConsoleHeader
        alertsCount={alertsCount}
        activeScreenTitle={screenTitles[activeScreen]}
        onAlertPillClick={handleOpenActiveAlertModal}
        userEmail={user?.email || profile?.full_name || null}
        userRole={profile?.role || null}
        canManageZones={canManageZones}
        onOpenCreateZone={() => {
          setEditingZone(null);
          setIsCreateZoneModalOpen(true);
        }}
      />

      {/* Cuerpo principal con Rail y Pantalla Activa */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Rail Vertical Fijo con control de permisos de pantalla */}
        <ConsoleRail
          activeScreen={activeScreen}
          onSelectScreen={setActiveScreen}
          currentRole={profile?.role}
          screenAccess={profile?.screen_access}
        />

        {/* Contenedor de la Pantalla Activa */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {activeScreen === 'terreno' && (
            <TerrenoScreen
              onAlertTriggered={(count) => setAlertsCount(count)}
              canManageZones={canManageZones}
              canManageTravelers={canManageTravelers}
              onOpenCreateZone={() => {
                setEditingZone(null);
                setIsCreateZoneModalOpen(true);
              }}
              onOpenCreateTraveler={canManageTravelers ? handleOpenCreateTraveler : undefined}
              onEditZone={handleEditZone}
              refreshTrigger={refreshZonesCounter}
              focusZoneId={focusZoneId}
              onFocusZoneConsumed={() => setFocusZoneId(null)}
              onRegisterNavigationHandlers={(handlers) => setTerrainNavHandlers(handlers)}
            />
          )}
          {activeScreen === 'zonas' && (
            <ZonasScreen
              canManageZones={canManageZones}
              onOpenCreateZone={() => {
                setEditingZone(null);
                setIsCreateZoneModalOpen(true);
              }}
              onEditZone={handleEditZone}
              onNavigateTerreno={(zoneId) => {
                if (zoneId) setFocusZoneId(zoneId);
                setActiveScreen('terreno');
              }}
              refreshTrigger={refreshZonesCounter}
            />
          )}
          {activeScreen === 'situacion' && (
            <SituacionScreen
              onNavigateTerreno={(zoneId) => {
                if (zoneId) setFocusZoneId(zoneId);
                setActiveScreen('terreno');
              }}
            />
          )}
          {activeScreen === 'personas' && (
            <PersonasScreen currentProfile={profile} currentUser={user} />
          )}
          {activeScreen === 'briefings' && <BriefingsScreen />}
          {activeScreen === 'mensajes' && <MensajesScreen />}
        </div>
      </div>

      {/* Botón Flotante de Acción Rápida RSO con herramientas y navegación integradas */}
      <FloatingRsoButton
        onNavigateScreen={setActiveScreen}
        onSimulatePing={() => {
          setAlertsCount((prev) => prev);
        }}
        onOpenCreateZone={canManageZones ? () => {
          setEditingZone(null);
          setIsCreateZoneModalOpen(true);
        } : undefined}
        onOpenCreateTraveler={canManageTravelers ? handleOpenCreateTraveler : undefined}
        onCenterFleet={terrainNavHandlers.centerFleet}
        onCenterRedZone={terrainNavHandlers.centerRedZone}
        onCenterSafeHaven={terrainNavHandlers.centerSafeHaven}
        isTerrenoActive={activeScreen === 'terreno'}
      />

      {/* Modal de Triaje y Protocolo Táctico de Incidentes */}
      <IncidentModal
        incident={activeIncidentModal}
        onClose={() => setActiveIncidentModal(null)}
        onAcknowledge={() => setAlertsCount(0)}
      />

      {/* Modal Táctico de Delimitación y Creación / Edición de Áreas / Zonas */}
      {(isCreateZoneModalOpen || editingZone !== null) && (
        <ZoneCreationModal
          isOpen={isCreateZoneModalOpen || editingZone !== null}
          initialZone={editingZone ?? undefined}
          onClose={() => {
            setIsCreateZoneModalOpen(false);
            setEditingZone(null);
          }}
          onZoneCreated={handleZoneCreated}
        />
      )}

      {/* Modal Táctico de Alta de Viajeros / Rebaño con posición inicial del visor */}
      {isCreateTravelerModalOpen && (
        <TravelerCreationModal
          isOpen={isCreateTravelerModalOpen}
          initialCoordinates={createTravelerInitialCoords}
          onClose={() => {
            setIsCreateTravelerModalOpen(false);
            setCreateTravelerInitialCoords(null);
          }}
          onTravelerCreated={() => {
            setRefreshZonesCounter((prev) => prev + 1);
            setIsCreateTravelerModalOpen(false);
            setCreateTravelerInitialCoords(null);
          }}
        />
      )}
    </div>
  );
}
