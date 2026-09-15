// ==============================================================================
// GZN — SERVICIO CENTRALIZADO DE AUDITORÍA INMUTABLE (DPIA / Duty of Care)
// ==============================================================================

import { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction = 
  | 'ZONE_CREATED'
  | 'ZONE_MODIFIED'
  | 'ZONE_DELETED'
  | 'ALERT_TRIGGERED'
  | 'ALERT_ACKNOWLEDGED'
  | 'ALERT_STATUS_CHANGED'
  | 'ALERT_RESOLVED'
  | 'ZONE_VIOLATION_DETECTED';

export type AuditEntityType = 
  | 'ZONE'
  | 'ALERT'
  | 'TRAVELER'
  | 'BRIEFING'
  | 'PROFILE'
  | 'ORGANIZATION';

export interface AuditLogEntry {
  organization_id: string;
  performed_by?: string | null;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id?: string | null;
  payload?: Record<string, any> | null;
}

/**
 * Registra un evento inmutable en public.audit_logs.
 * 
 * Principio Fail-Safe: El registro de auditoría nunca debe bloquear ni abortar
 * el despacho de operaciones críticas en curso (ej. alertas de rescate SOS),
 * pero cualquier anomalía se reporta a los logs de diagnóstico del sistema.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<boolean> {
  try {
    if (!entry.organization_id) {
      console.error('[AUDIT ERROR] organization_id es obligatorio para registrar un evento de auditoría:', entry);
      return false;
    }

    const { error } = await supabase.from('audit_logs').insert({
      organization_id: entry.organization_id,
      performed_by: entry.performed_by || null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id || null,
      payload: entry.payload || {},
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[AUDIT WRITE ERROR] Error al escribir en public.audit_logs:', error.message, entry);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[AUDIT EXCEPTION] Excepción inesperada durante logAuditEvent:', err?.message || err);
    return false;
  }
}
