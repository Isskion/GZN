-- ============================================================================
-- GZN POSTGIS MIGRATION 004 — AMPLIACIÓN DE ZONAS, CURFEWS Y SAFE HAVENS
-- Ejecutar en Supabase: https://supabase.com/dashboard/project/hyhfdzribmathwridokg/sql
-- ============================================================================

-- 1. Ampliación de columnas en public.zones (Punto 4 de Auditoría / Hoja de Ruta v0.8)
ALTER TABLE public.zones
ADD COLUMN IF NOT EXISTS buffer_meters INT DEFAULT 0 CHECK (buffer_meters >= 0),
ADD COLUMN IF NOT EXISTS is_curfew BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS curfew_start TIME WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS curfew_end TIME WITHOUT TIME ZONE,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS radio_frequency TEXT,
ADD COLUMN IF NOT EXISTS gate_access_protocol TEXT;

-- Restricción de consistencia en toques de queda
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_curfew_consistency'
    ) THEN
        ALTER TABLE public.zones 
        ADD CONSTRAINT check_curfew_consistency 
        CHECK (is_curfew = FALSE OR (curfew_start IS NOT NULL AND curfew_end IS NOT NULL));
    END IF;
END $$;

-- 2. Columna opcional para enlace con identidad Supabase Auth en travelers (Preparación App Móvil)
ALTER TABLE public.travelers
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_travelers_user_id ON public.travelers(user_id);
CREATE INDEX IF NOT EXISTS idx_zones_curfew ON public.zones(organization_id, is_curfew) WHERE is_active = TRUE;

-- 3. Actualización de la función RPC create_zone_with_geojson con soporte para los nuevos atributos
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
    p_gate_access_protocol TEXT DEFAULT NULL
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
    v_buffer INT;
    v_curfew BOOLEAN;
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

-- 4. Actualización de get_active_zones con los nuevos atributos tácticos
CREATE OR REPLACE FUNCTION public.get_active_zones()
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    name TEXT,
    description TEXT,
    severity TEXT,
    color_hex TEXT,
    buffer_meters INT,
    is_curfew BOOLEAN,
    curfew_start TIME WITHOUT TIME ZONE,
    curfew_end TIME WITHOUT TIME ZONE,
    contact_phone TEXT,
    radio_frequency TEXT,
    gate_access_protocol TEXT,
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
        z.buffer_meters,
        z.is_curfew,
        z.curfew_start,
        z.curfew_end,
        z.contact_phone,
        z.radio_frequency,
        z.gate_access_protocol,
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

-- 5. Actualización de find_nearest_safe_haven con metadatos tácticos de contacto y acceso
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
    ORDER BY distance_meters ASC
    LIMIT 1;
$$;

-- 6. Actualización de check_point_zones para evaluar toques de queda y buffers espaciales
CREATE OR REPLACE FUNCTION public.check_point_zones(
    p_org_id UUID,
    p_lat DOUBLE PRECISION,
    p_lon DOUBLE PRECISION
)
RETURNS TABLE (
    zone_id UUID,
    zone_name TEXT,
    severity TEXT,
    color_hex TEXT,
    buffer_meters INT,
    is_in_buffer BOOLEAN,
    is_curfew BOOLEAN,
    curfew_active_now BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_current_time TIME WITHOUT TIME ZONE;
BEGIN
    v_current_time := CURRENT_TIME;
    
    RETURN QUERY
    SELECT 
        z.id AS zone_id,
        z.name AS zone_name,
        z.severity,
        z.color_hex,
        z.buffer_meters,
        -- Detecta si está en el buffer perimetral pero fuera del núcleo de la zona
        (NOT ST_Contains(z.geom, ST_SetSRID(ST_Point(p_lon, p_lat), 4326))
         AND z.buffer_meters > 0
         AND ST_DWithin(z.geom::geography, ST_SetSRID(ST_Point(p_lon, p_lat), 4326)::geography, z.buffer_meters)
        ) AS is_in_buffer,
        z.is_curfew,
        -- Evaluación de si el toque de queda está en curso a la hora actual
        CASE 
            WHEN z.is_curfew IS NOT TRUE THEN FALSE
            WHEN z.curfew_start <= z.curfew_end THEN 
                (v_current_time >= z.curfew_start AND v_current_time <= z.curfew_end)
            ELSE -- Caso que cruza la medianoche (ej. 22:00 a 06:00)
                (v_current_time >= z.curfew_start OR v_current_time <= z.curfew_end)
        END AS curfew_active_now
    FROM public.zones z
    WHERE z.organization_id = p_org_id
      AND z.is_active = TRUE
      AND (z.valid_until IS NULL OR z.valid_until > NOW())
      AND (
          ST_Contains(z.geom, ST_SetSRID(ST_Point(p_lon, p_lat), 4326))
          OR (z.buffer_meters > 0 AND ST_DWithin(z.geom::geography, ST_SetSRID(ST_Point(p_lon, p_lat), 4326)::geography, z.buffer_meters))
      )
    ORDER BY 
        CASE z.severity 
            WHEN 'RED' THEN 1 
            WHEN 'AMBER' THEN 2 
            WHEN 'SAFE_HAVEN' THEN 3 
            ELSE 4 
        END ASC;
END;
$$;
