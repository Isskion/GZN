-- ============================================================================
-- GZN POSTGIS MIGRATION 003 — RPC CREACIÓN DE ZONAS & SECRETOS DE DISPOSITIVOS
-- Ejecutar en Supabase: https://supabase.com/dashboard/project/hyhfdzribmathwridokg/sql
-- ============================================================================

-- 1. Soporte de Autenticación de Dispositivo Móvil (Escalón intermedio hacia ECDSA P-256)
ALTER TABLE public.travelers 
ADD COLUMN IF NOT EXISTS device_secret_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_travelers_device_secret_hash 
ON public.travelers(device_secret_hash);

-- 2. Función RPC para creación segura de zonas desde GeoJSON
CREATE OR REPLACE FUNCTION public.create_zone_with_geojson(
    p_org_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_color_hex TEXT DEFAULT NULL,
    p_geojson TEXT DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL
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
    v_new_zone public.zones;
BEGIN
    v_user_id := auth.uid();
    
    -- Determinar org_id: Si no es SUPER_ADMIN, forzar el tenant de la sesión para evitar suplantación
    IF public.get_auth_role() = 'SUPER_ADMIN' AND p_org_id IS NOT NULL THEN
        v_org_id := p_org_id;
    ELSE
        v_org_id := COALESCE(public.get_auth_org_id(), p_org_id);
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No se pudo determinar la organizacion del usuario o el usuario no esta autenticado';
    END IF;

    -- Control de acceso por rol: Solo RSO, ORG_ADMIN y SUPER_ADMIN pueden crear zonas
    IF public.get_auth_role() NOT IN ('RSO', 'ORG_ADMIN', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Rol insuficiente para crear zonas: se requiere RSO, ORG_ADMIN o SUPER_ADMIN';
    END IF;

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'El nombre de la zona (p_name) es obligatorio';
    END IF;

    -- Validar severidad
    IF p_severity NOT IN ('RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR') THEN
        RAISE EXCEPTION 'Severidad de zona no valida: %. Debe ser RED, AMBER, SAFE_HAVEN o CORRIDOR', p_severity;
    END IF;

    -- Asignar color por defecto según severidad táctica
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

    -- Insertar la zona en la base de datos
    INSERT INTO public.zones (
        organization_id,
        created_by,
        name,
        description,
        severity,
        color_hex,
        geom,
        valid_until,
        is_active
    )
    VALUES (
        v_org_id,
        v_user_id,
        p_name,
        p_description,
        p_severity,
        v_color,
        v_geom,
        p_valid_until,
        TRUE
    )
    RETURNING * INTO v_new_zone;

    RETURN v_new_zone;
END;
$$;

-- 3. Función auxiliar para lectura de zonas con geometría GeoJSON pre-convertida
CREATE OR REPLACE FUNCTION public.get_active_zones()
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    name TEXT,
    description TEXT,
    severity TEXT,
    color_hex TEXT,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    geojson JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT 
        z.id,
        z.organization_id,
        z.name,
        z.description,
        z.severity,
        z.color_hex,
        z.valid_from,
        z.valid_until,
        z.is_active,
        z.created_at,
        ST_AsGeoJSON(z.geom)::jsonb AS geojson
    FROM public.zones z
    WHERE z.is_active = TRUE
      AND (z.organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN')
      AND (z.valid_until IS NULL OR z.valid_until > NOW());
$$;
