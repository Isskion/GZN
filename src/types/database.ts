export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'RSO' | 'OPERATOR';
export type TravelerStatus = 'SAFE' | 'WARNING' | 'DANGER' | 'PANIC' | 'INCOMMUNICADO';
export type ZoneSeverity = 'RED' | 'AMBER' | 'SAFE_HAVEN' | 'CORRIDOR';
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
  role: UserRole;
  phone?: string | null;
  emergency_contact?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Traveler {
  id: string;
  organization_id: string;
  assigned_rso_id?: string | null;
  full_name: string;
  email?: string | null;
  phone: string;
  callsign?: string | null;
  status: TravelerStatus;
  last_latitude?: number | null;
  last_longitude?: number | null;
  last_ping_at?: string | null;
  battery_level?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Zone {
  id: string;
  organization_id: string;
  created_by?: string | null;
  name: string;
  description?: string | null;
  severity: ZoneSeverity;
  color_hex: string;
  geom: GeoJSON.Polygon;
  valid_from: string;
  valid_until?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
