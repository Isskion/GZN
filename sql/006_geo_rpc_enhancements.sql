-- ==============================================================================
-- GZN MIGRACIÓN 006: MEJORAS Y VIGENCIA TEMPORAL EN RPCS GEOESPACIALES
-- ==============================================================================
-- Actualiza public.find_nearest_safe_haven para verificar vigencia temporal:
-- AND (z.valid_until IS NULL OR z.valid_until > NOW())
-- Alineando su comportamiento con check_point_zones y get_active_zones.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.find_nearest_safe_haven(UUID, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.find_nearest_safe_haven(
    p_org_id UUID,
    p_lat DOUBLE PRECISION,
    p_lon DOUBLE PRECISION
)
RETURNS TABLE (
    zone_id UUID,
    zone_name TEXT,
    description TEXT,
    contact_phone TEXT,
    radio_frequency TEXT,
    gate_access_protocol TEXT,
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        z.id AS zone_id,
        z.name AS zone_name,
        z.description,
        z.contact_phone,
        z.radio_frequency,
        z.gate_access_protocol,
        ST_Distance(
            z.geom::geography, 
            ST_SetSRID(ST_Point(p_lon, p_lat), 4326)::geography
        ) AS distance_meters
    FROM public.zones z
    WHERE z.organization_id = p_org_id
      AND z.severity = 'SAFE_HAVEN'
      AND z.is_active = TRUE
      AND (z.valid_until IS NULL OR z.valid_until > NOW())
    ORDER BY distance_meters ASC
    LIMIT 1;
$$;

-- Permisos explícitos de ejecución (hardening de seguridad en Supabase)
GRANT EXECUTE ON FUNCTION public.find_nearest_safe_haven(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_point_zones(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated, service_role;
