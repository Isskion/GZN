-- ============================================================================
-- GZN POSTGIS MIGRATION 010 — ACTUALIZACIÓN DE RPC DE CREACIÓN DE ZONAS
-- Sincronización con role_level (>= 60), soporte de assigned_rso_id
-- y retirada de la función incompleta create_tactical_zone
-- Ejecutar en Supabase: https://supabase.com/dashboard/project/hyhfdzribmathwridokg/sql
-- ============================================================================

-- 1. Retirar la función create_tactical_zone (código incompleto creado en migración 008)
DROP FUNCTION IF EXISTS public.create_tactical_zone(TEXT, TEXT, JSONB, TEXT, TEXT, TIMESTAMPTZ, UUID, UUID);

-- 2. Actualizar create_zone_with_geojson con soporte integral de role_level y assigned_rso_id
CREATE OR REPLACE FUNCTION public.create_zone_with_geojson(
    p_org_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_color_hex TEXT DEFAULT NULL,
    p_geojson TEXT DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_buffer_meters INT DEFAULT 0,
    p_is_curfew BOOLEAN DEFAULT FALSE,
    p_curfew_start TIME WITHOUT TIME ZONE DEFAULT NULL,
    p_curfew_end TIME WITHOUT TIME ZONE DEFAULT NULL,
    p_contact_phone TEXT DEFAULT NULL,
    p_radio_frequency TEXT DEFAULT NULL,
    p_gate_access_protocol TEXT DEFAULT NULL,
    p_assigned_rso_id UUID DEFAULT NULL
)
RETURNS public.zones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_org_id UUID;
    v_color TEXT;
    v_geom GEOMETRY;
    v_user_id UUID;
    v_role_level INT;
    v_new_zone public.zones;
    v_buffer INT;
    v_curfew BOOLEAN;
    v_assigned_rso UUID;
BEGIN
    v_user_id := auth.uid();
    v_org_id := COALESCE(public.get_auth_org_id(), p_org_id);
    v_role_level := public.get_auth_role_level();

    IF v_user_id IS NULL OR v_org_id IS NULL OR v_role_level IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado o no se pudo determinar la organizacion del usuario.';
    END IF;

    -- Control de acceso por rol: Se requiere RSO o superior (role_level >= 60: RSO, CONTROL_TOWER, ORG_ADMIN)
    IF v_role_level < 60 THEN
        RAISE EXCEPTION 'Rol insuficiente para crear zonas: se requiere nivel RSO (60) o superior.';
    END IF;

    -- Validar nombre de zona
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'El nombre de la zona (p_name) es obligatorio';
    END IF;

    -- Validar severidad táctica
    IF p_severity NOT IN ('RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR') THEN
        RAISE EXCEPTION 'Severidad de zona no valida: %. Debe ser RED, AMBER, SAFE_HAVEN o CORRIDOR', p_severity;
    END IF;

    -- Validar RSO asignado si se especifica
    IF p_assigned_rso_id IS NOT NULL THEN
        SELECT id INTO v_assigned_rso
        FROM public.profiles
        WHERE id = p_assigned_rso_id
          AND organization_id = v_org_id
          AND is_active = TRUE
          AND role_level >= 60;

        IF v_assigned_rso IS NULL THEN
            RAISE EXCEPTION 'El RSO asignado (%) no existe, está inactivo, pertenece a otra organización o no tiene nivel suficiente.', p_assigned_rso_id;
        END IF;
    END IF;

    -- Validar buffer
    v_buffer := COALESCE(p_buffer_meters, 0);
    IF v_buffer < 0 THEN
        RAISE EXCEPTION 'El buffer de la zona no puede ser negativo: %', v_buffer;
    END IF;

    -- Validar toques de queda
    v_curfew := COALESCE(p_is_curfew, FALSE);
    IF v_curfew IS TRUE AND (p_curfew_start IS NULL OR p_curfew_end IS NULL) THEN
        RAISE EXCEPTION 'Para zonas con toque de queda activo (is_curfew=TRUE) se debe definir hora de inicio y fin (curfew_start y curfew_end)';
    END IF;

    -- Asignar color por defecto según severidad táctica si no se especifica
    v_color := COALESCE(p_color_hex, 
        CASE p_severity 
            WHEN 'RED' THEN '#EF4444' 
            WHEN 'AMBER' THEN '#F59E0B' 
            WHEN 'SAFE_HAVEN' THEN '#10B981'
            WHEN 'CORRIDOR' THEN '#3B82F6'
            ELSE '#6B7280' 
        END
    );

    IF p_geojson IS NULL OR TRIM(p_geojson) = '' THEN
        RAISE EXCEPTION 'La geometria GeoJSON (p_geojson) no puede estar vacia';
    END IF;

    -- Parsear geometría GeoJSON usando PostGIS ST_GeomFromGeoJSON
    BEGIN
        v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson), 4326);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Geometria GeoJSON invalida: %', SQLERRM;
    END;

    IF v_geom IS NULL THEN
        RAISE EXCEPTION 'La geometria proporcionada no pudo ser procesada por PostGIS';
    END IF;

    -- Validar que la geometría sea de tipo Polygon
    IF GeometryType(v_geom) != 'POLYGON' THEN
        RAISE EXCEPTION 'Tipo de geometria no soportado: %. Debe ser POLYGON', GeometryType(v_geom);
    END IF;

    -- Validar validez topológica (sin bucles auto-intersectantes)
    IF NOT ST_IsValid(v_geom) THEN
        RAISE EXCEPTION 'El poligono GeoJSON no es topologicamente valido: %', ST_IsValidReason(v_geom);
    END IF;

    -- Insertar la zona enriquecida en la base de datos
    INSERT INTO public.zones (
        organization_id,
        created_by,
        assigned_rso_id,
        name,
        description,
        severity,
        color_hex,
        geom,
        buffer_meters,
        is_curfew,
        curfew_start,
        curfew_end,
        contact_phone,
        radio_frequency,
        gate_access_protocol,
        valid_until,
        is_active
    )
    VALUES (
        v_org_id,
        v_user_id,
        v_assigned_rso,
        p_name,
        p_description,
        p_severity,
        v_color,
        v_geom,
        v_buffer,
        v_curfew,
        p_curfew_start,
        p_curfew_end,
        p_contact_phone,
        p_radio_frequency,
        p_gate_access_protocol,
        p_valid_until,
        TRUE
    )
    RETURNING * INTO v_new_zone;

    RETURN v_new_zone;
END;
$$;
