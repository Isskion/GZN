export type UserRole = 'ORG_ADMIN' | 'CONTROL_TOWER' | 'RSO' | 'OPERATOR';

export const ROLE_LEVELS: Record<UserRole, number> = {
  ORG_ADMIN: 100,
  CONTROL_TOWER: 80,
  RSO: 60,
  OPERATOR: 40,
};

export const DEFAULT_ROLE_SCREEN_ACCESS: Record<UserRole, Record<string, boolean>> = {
  ORG_ADMIN: {
    terreno: true,
    zonas: true,
    situacion: true,
    personas: true,
    briefings: true,
    mensajes: true,
  },
  CONTROL_TOWER: {
    terreno: true,
    zonas: true,
    situacion: true,
    personas: true,
    briefings: true,
    mensajes: true,
  },
  RSO: {
    terreno: true,
    zonas: true,
    situacion: false, // Activable por excepción para RSOs multi-zona
    personas: true,
    briefings: true,
    mensajes: true,
  },
  OPERATOR: {
    terreno: true,
    zonas: true,
    situacion: false,
    personas: true,
    briefings: true,
    mensajes: false,
  },
};

export function hasScreenAccess(
  role: UserRole,
  screenAccess: Record<string, boolean> | null | undefined,
  screenId: string
): boolean {
  if (screenAccess && typeof screenAccess[screenId] === 'boolean') {
    return screenAccess[screenId];
  }
  return DEFAULT_ROLE_SCREEN_ACCESS[role]?.[screenId] ?? false;
}

export type TravelerStatus = 'SAFE' | 'WARNING' | 'DANGER' | 'PANIC' | 'INCOMMUNICADO';
export type ZoneType = 'RESPONSIBILITY' | 'THREAT';
export type ZoneSeverity = 'RED' | 'AMBER' | 'SAFE_HAVEN' | 'CORRIDOR' | 'OPERATIONAL';
export type AlertType = 'ZONE_VIOLATION' | 'PANIC_BUTTON' | 'DEAD_MAN_TRIGGER' | 'DURESS_PIN' | 'DEVIATION' | 'MANUAL_SOS';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_ALARM';
export type POICategory = 'EXTRACTION_POINT' | 'HOSPITAL' | 'POLICE' | 'SAFE_HOUSE' | 'CHECKPOINT' | 'DANGER_POINT';

export interface Organization {
  id: string;
  name: string;
  cif_tax_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email?: string | null;
  role: UserRole;
  role_level: number;
  admin_origin?: 'GZN' | 'CLIENT' | null;
  supervising_rso_id?: string | null;
  screen_access?: Record<string, boolean> | null;
  phone?: string | null;
  emergency_contact?: string | null;
  controlled_zone_ids?: string[];
  excluded_zone_ids?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PositionSource = 'MANUAL_RSO' | 'DEVICE_TELEMETRY';

export interface Traveler {
  id: string;
  organization_id: string;
  assigned_rso_id?: string | null;
  user_id?: string | null;
  full_name: string;
  email?: string | null;
  phone: string;
  callsign?: string | null;
  status: TravelerStatus;
  last_latitude?: number | null;
  last_longitude?: number | null;
  position_source?: PositionSource | null;
  last_ping_at?: string | null;
  battery_level?: number | null;
  device_secret_hash?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Zone {
  id: string;
  organization_id: string;
  created_by?: string | null;
  assigned_rso_id?: string | null;
  zone_type: ZoneType;
  name: string;
  description?: string | null;
  severity: ZoneSeverity;
  color_hex: string;
  geom: GeoJSON.Polygon;
  buffer_meters: number;
  is_curfew: boolean;
  curfew_start?: string | null;
  curfew_end?: string | null;
  contact_phone?: string | null;
  radio_frequency?: string | null;
  gate_access_protocol?: string | null;
  valid_from: string;
  valid_until?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZoneControlExclusion {
  profile_id: string;
  zone_id: string;
  created_at?: string;
}

export interface Briefing {
  id: string;
  organization_id: string;
  author_rso_id: string;
  title: string;
  welcome_message?: string | null;
  protocol_instructions?: string | null;
  created_at: string;
  updated_at: string;
  pois?: BriefingPOI[];
}

export interface BriefingPOI {
  id: string;
  briefing_id: string;
  name: string;
  category: POICategory;
  latitude: number;
  longitude: number;
  notes?: string | null;
}

export interface Alert {
  id: string;
  organization_id: string;
  traveler_id: string;
  zone_id?: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  latitude: number;
  longitude: number;
  memo?: string | null;
  status: AlertStatus;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  traveler?: Traveler;
  zone?: Zone;
}

export interface CheckPointResult {
  zone_id: string;
  zone_name: string;
  severity: ZoneSeverity;
  color_hex: string;
}

export interface SafeHavenResult {
  zone_id: string;
  zone_name: string;
  distance_meters: number;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  performed_by?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  payload?: Record<string, any> | null;
  created_at: string;
}

