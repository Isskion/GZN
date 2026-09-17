'use client';

import React, { useState } from 'react';
import { ConsoleHeader } from '@/components/industry/ConsoleHeader';
import { ConsoleRail, ScreenId } from '@/components/industry/ConsoleRail';
import { TerrenoScreen } from '@/components/screens/TerrenoScreen';
import { PersonasScreen } from '@/components/screens/PersonasScreen';
import { SituacionScreen } from '@/components/screens/SituacionScreen';
import { MensajesScreen } from '@/components/screens/MensajesScreen';
import { BriefingsScreen } from '@/components/screens/BriefingsScreen';
import { FloatingRsoButton } from '@/components/industry/FloatingRsoButton';
import { IncidentModal } from '@/components/industry/IncidentModal';
import { IncidentItem } from '@/components/industry/IncidentTape';
import { Profile } from '@/types/database';
import { ZoneCreationModal } from '@/components/tactical/ZoneCreationModal';

interface RsoConsoleShellProps {
  user?: { id: string; email?: string } | null;
  profile?: Profile | null;
}

export function RsoConsoleShell({ user, profile }: RsoConsoleShellProps) {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('terreno');
  const [alertsCount, setAlertsCount] = useState<number>(1);
  const [activeIncidentModal, setActiveIncidentModal] = useState<IncidentItem | null>(null);
  const [isCreateZoneModalOpen, setIsCreateZoneModalOpen] = useState(false);
  const [refreshZonesCounter, setRefreshZonesCounter] = useState(0);

  // Control RBAC: role_level >= 60 (RSO, CONTROL_TOWER, ORG_ADMIN)
  const roleLevel = profile?.role_level ?? (
    profile?.role === 'ORG_ADMIN' ? 100 :
    profile?.role === 'CONTROL_TOWER' ? 80 :
    profile?.role === 'RSO' ? 60 : 40
  );
  const canManageZones = roleLevel >= 60;

  const screenTitles: Record<ScreenId, string> = {
    terreno: 'Terreno / Sector Táctico',
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
    setActiveScreen('terreno');
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
        onOpenCreateZone={() => setIsCreateZoneModalOpen(true)}
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
              onOpenCreateZone={() => setIsCreateZoneModalOpen(true)}
              refreshTrigger={refreshZonesCounter}
            />
          )}
          {activeScreen === 'situacion' && (
            <SituacionScreen
              onSelectIncident={(inc) => setActiveIncidentModal(inc)}
              onNavigateTerreno={() => setActiveScreen('terreno')}
            />
          )}
          {activeScreen === 'personas' && <PersonasScreen />}
          {activeScreen === 'briefings' && <BriefingsScreen />}
          {activeScreen === 'mensajes' && <MensajesScreen />}
        </div>
      </div>

      {/* Botón Flotante de Acción Rápida RSO */}
      <FloatingRsoButton
        onNavigateScreen={setActiveScreen}
        onSimulatePing={() => {
          setAlertsCount((prev) => prev);
        }}
      />

      {/* Modal de Triaje y Protocolo Táctico de Incidentes */}
      <IncidentModal
        incident={activeIncidentModal}
        onClose={() => setActiveIncidentModal(null)}
        onAcknowledge={() => setAlertsCount(0)}
      />

      {/* Modal Táctico de Delimitación y Creación de Áreas / Zonas */}
      <ZoneCreationModal
        isOpen={isCreateZoneModalOpen}
        onClose={() => setIsCreateZoneModalOpen(false)}
        onZoneCreated={handleZoneCreated}
      />
    </div>
  );
}
