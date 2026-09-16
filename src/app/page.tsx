'use client';

import React, { useState } from 'react';
import { ConsoleHeader } from '@/components/industry/ConsoleHeader';
import { ConsoleRail, ScreenId } from '@/components/industry/ConsoleRail';
import { TerrenoScreen } from '@/components/screens/TerrenoScreen';
import { PersonasScreen } from '@/components/screens/PersonasScreen';
import { SituacionScreen } from '@/components/screens/SituacionScreen';
import { MensajesScreen } from '@/components/screens/MensajesScreen';
import { IncidentModal } from '@/components/industry/IncidentModal';
import { IncidentItem } from '@/components/industry/IncidentTape';

export default function RsoConsoleShell() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('terreno');
  const [alertsCount, setAlertsCount] = useState<number>(1);
  const [activeIncidentModal, setActiveIncidentModal] = useState<IncidentItem | null>(null);

  const screenTitles: Record<ScreenId, string> = {
    situacion: 'Situación Global',
    terreno: 'Terreno / Sector Táctico',
    personas: 'Cartera de Personas',
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

  return (
    <div id="app" className="grid grid-rows-[auto_1fr] h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-body overflow-hidden">
      {/* Topbar del Sistema Industry */}
      <ConsoleHeader
        alertsCount={alertsCount}
        activeScreenTitle={screenTitles[activeScreen]}
        onAlertPillClick={handleOpenActiveAlertModal}
      />

      {/* Cuerpo principal con Rail y Pantalla Activa */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Rail Vertical Fijo de 56px */}
        <ConsoleRail
          activeScreen={activeScreen}
          onSelectScreen={setActiveScreen}
        />

        {/* Contenedor de la Pantalla Activa */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {activeScreen === 'situacion' && (
            <SituacionScreen onSelectIncident={(inc) => setActiveIncidentModal(inc)} />
          )}
          {activeScreen === 'terreno' && (
            <TerrenoScreen onAlertTriggered={(count) => setAlertsCount(count)} />
          )}
          {activeScreen === 'personas' && <PersonasScreen />}
          {activeScreen === 'mensajes' && <MensajesScreen />}
        </div>
      </div>

      {/* Modal de Triaje y Protocolo Táctico de Incidentes */}
      <IncidentModal
        incident={activeIncidentModal}
        onClose={() => setActiveIncidentModal(null)}
        onAcknowledge={() => setAlertsCount(0)}
      />
    </div>
  );
}
