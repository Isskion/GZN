// ==============================================================================
// GZN — API ROUTE: GESTIÓN INDIVIDUAL Y CICLO DE VIDA DE ALERTAS (/api/alerts/[id])
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/auth/session';
import { logAuditEvent, AuditAction } from '@/lib/audit/logger';
import { AlertStatus } from '@/types/database';

const VALID_STATUSES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'FALSE_ALARM'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/alerts/[id] — Detalle completo de una alerta individual
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { authenticated, supabase, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa'}` },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Identificador de alerta inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    // RLS garantiza que solo se accede a alertas de la propia organización
    const { data: alert, error } = await supabase
      .from('alerts')
      .select(`
        id,
        organization_id,
        traveler_id,
        zone_id,
        alert_type,
        severity,
        latitude,
        longitude,
        memo,
        status,
        resolved_by,
        resolved_at,
        created_at,
        travelers (
          id, full_name, callsign, phone, email, status, battery_level
        ),
        zones (id, name, severity, color_hex, description, contact_phone, radio_frequency, gate_access_protocol),
        resolver:profiles!resolved_by (id, full_name, role)
      `)
      .eq('id', id)
      .single();

    if (error || !alert) {
      return NextResponse.json(
        { error: 'Alerta no encontrada o no accesible para su organización.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ alert });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH /api/alerts/[id] — Transición de estado, notas tácticas y resolución forense
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { authenticated, supabase, user, error: authError } = await getAuthenticatedSession(request);

    if (!authenticated || !supabase || !user) {
      return NextResponse.json(
        { error: `No autorizado: ${authError || 'Se requiere sesión de usuario activa (RSO / Operador)'}` },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Identificador de alerta inválido. Debe ser un UUID válido.' },
        { status: 400 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Cuerpo de petición JSON inválido o malformado.' },
        { status: 400 }
      );
    }

    const { status: newStatus, memo: newMemo, reset_traveler_status } = body;

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { 
          error: `Estado de alerta inválido: '${newStatus}'. Estados admitidos: ${VALID_STATUSES.join(', ')}` 
        },
        { status: 400 }
      );
    }

    // 1. Obtener alerta actual (RLS previene acceso inter-organizaciones)
    const { data: currentAlert, error: fetchError } = await supabase
      .from('alerts')
      .select('id, organization_id, traveler_id, status, memo')
      .eq('id', id)
      .single();

    if (fetchError || !currentAlert) {
      return NextResponse.json(
        { error: 'Alerta no encontrada o no accesible para su organización.' },
        { status: 404 }
      );
    }

    // 2. Construir objeto de actualización
    const updates: Record<string, any> = {
      status: newStatus,
    };

    if (typeof newMemo === 'string') {
      updates.memo = newMemo;
    }

    if (newStatus === 'RESOLVED' || newStatus === 'FALSE_ALARM') {
      updates.resolved_by = user.id;
      updates.resolved_at = new Date().toISOString();
    } else if (newStatus === 'OPEN') {
      // Si se reabre por error operativo, resetear firma de cierre
      updates.resolved_by = null;
      updates.resolved_at = null;
    }

    // 3. Ejecutar actualización en public.alerts
    const { data: updatedAlert, error: updateError } = await supabase
      .from('alerts')
      .update(updates)
      .eq('id', id)
      .select(`
        id,
        organization_id,
        traveler_id,
        zone_id,
        alert_type,
        severity,
        latitude,
        longitude,
        memo,
        status,
        resolved_by,
        resolved_at,
        created_at,
        resolver:profiles!resolved_by (id, full_name, role)
      `)
      .single();

    if (updateError || !updatedAlert) {
      return NextResponse.json(
        { error: updateError?.message || 'Error al actualizar el estado de la alerta.' },
        { status: 500 }
      );
    }

    // 4. Lógica Preventiva Multi-Incidente para resetear estado del viajero (Claude Audit Mandate)
    let travelerStatusReset = false;
    let resetReason = 'not_requested';

    const shouldReset = 
      (newStatus === 'RESOLVED' || newStatus === 'FALSE_ALARM') && 
      reset_traveler_status !== false;

    if (shouldReset && currentAlert.traveler_id) {
      // Comprobar estrictamente si el mismo viajero tiene OTRAS alertas activas aún abiertas
      const { data: otherActiveAlerts, error: activeAlertsError } = await supabase
        .from('alerts')
        .select('id')
        .eq('traveler_id', currentAlert.traveler_id)
        .neq('id', id)
        .in('status', ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING']);

      if (!activeAlertsError && otherActiveAlerts && otherActiveAlerts.length > 0) {
        // Persisten otras alertas abiertas para este convoy/viajero: NO tocar su estado
        travelerStatusReset = false;
        resetReason = 'other_active_alerts_exist';
      } else {
        // No quedan más alertas abiertas: consultar y restaurar a SAFE si estaba en riesgo
        const { data: travelerData } = await supabase
          .from('travelers')
          .select('status')
          .eq('id', currentAlert.traveler_id)
          .single();

        if (travelerData && ['PANIC', 'DANGER', 'WARNING'].includes(travelerData.status)) {
          await supabase
            .from('travelers')
            .update({ status: 'SAFE' })
            .eq('id', currentAlert.traveler_id);

          travelerStatusReset = true;
          resetReason = 'all_alerts_resolved';
        } else {
          resetReason = 'traveler_already_safe';
        }
      }
    }

    // 5. Determinar acción de auditoría según la transición
    let auditAction: AuditAction = 'ALERT_STATUS_CHANGED';
    if (newStatus === 'ACKNOWLEDGED') {
      auditAction = 'ALERT_ACKNOWLEDGED';
    } else if (newStatus === 'RESOLVED' || newStatus === 'FALSE_ALARM') {
      auditAction = 'ALERT_RESOLVED';
    }

    // 6. Registrar evento inmutable en public.audit_logs (DPIA / RGPD Art. 35)
    await logAuditEvent(supabase, {
      organization_id: currentAlert.organization_id,
      performed_by: user.id,
      action: auditAction,
      entity_type: 'ALERT',
      entity_id: id,
      payload: {
        previous_status: currentAlert.status,
        new_status: newStatus,
        traveler_id: currentAlert.traveler_id,
        memo: updates.memo ?? currentAlert.memo,
        resolved_by: updates.resolved_by ?? null,
        resolved_at: updates.resolved_at ?? null,
        traveler_status_reset: travelerStatusReset,
        reset_reason: resetReason,
      },
    });

    return NextResponse.json({
      success: true,
      alert: updatedAlert,
      traveler_status_reset: travelerStatusReset,
      reset_reason: resetReason,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
