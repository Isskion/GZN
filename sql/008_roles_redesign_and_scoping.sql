-- ============================================================================
-- GZN POSTGIS MIGRATION 008 — REDISEÑO DE ROLES Y CONTROL DE ACCESO
-- Supresión de SUPER_ADMIN, jerarquía role_level, asignación de zonas a RSO
-- y soporte de permisos granulares por pantalla (screen_access JSONB)
-- Ejecutar en Supabase: https://supabase.com/dashboard/project/hyhfdzribmathwridokg/sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SANEAMIENTO PREVIO Y REESTRUCTURACIÓN DEL CONSTRAINT DE ROL
-- ----------------------------------------------------------------------------

-- Migración preventiva: si existiese alguna fila histórica con SUPER_ADMIN, se absorbe como ORG_ADMIN
UPDATE public.profiles 
SET role = 'ORG_ADMIN', updated_at = NOW() 
WHERE role = 'SUPER_ADMIN';

-- Actualizar el CHECK constraint de profiles.role para incluir CONTROL_TOWER y retirar SUPER_ADMIN
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('ORG_ADMIN', 'CONTROL_TOWER', 'RSO', 'OPERATOR'));

-- ----------------------------------------------------------------------------
-- 2. NUEVAS COLUMNAS EN PROFILES Y SINCRONIZACIÓN DETERMINISTA
-- ----------------------------------------------------------------------------

-- Columna de nivel jerárquico numérico
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_level INT;

-- Columna descriptiva para trazabilidad (GZN vs CLIENT, exclusivamente en ORG_ADMIN)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_origin TEXT;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_admin_origin_role;
ALTER TABLE public.profiles ADD CONSTRAINT check_admin_origin_role 
    CHECK (admin_origin IS NULL OR role = 'ORG_ADMIN');
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_admin_origin_val;
ALTER TABLE public.profiles ADD CONSTRAINT check_admin_origin_val 
    CHECK (admin_origin IS NULL OR admin_origin IN ('GZN', 'CLIENT'));

-- Columna de supervisión operativa (para que OPERATOR herede el alcance de su RSO)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS supervising_rso_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Columna de permisos granulares por pantalla (overrides específicos sobre la matriz de rol)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS screen_access JSONB DEFAULT NULL;

-- Trigger determinista: asegura que role_level siempre concuerde exactamente con role
CREATE OR REPLACE FUNCTION public.sync_profile_role_level()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'ORG_ADMIN' THEN NEW.role_level := 100;
    ELSIF NEW.role = 'CONTROL_TOWER' THEN NEW.role_level := 80;
    ELSIF NEW.role = 'RSO' THEN NEW.role_level := 60;
    ELSIF NEW.role = 'OPERATOR' THEN NEW.role_level := 40;
    ELSE RAISE EXCEPTION 'Rol no reconocido para cálculo de role_level: %', NEW.role;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_role_level ON public.profiles;
CREATE TRIGGER trg_sync_profile_role_level
BEFORE INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_level();

-- Backfill explícito obligatorio para filas preexistentes (Corrección 1 Claude)
UPDATE public.profiles SET role_level = CASE role
    WHEN 'ORG_ADMIN' THEN 100
    WHEN 'CONTROL_TOWER' THEN 80
    WHEN 'RSO' THEN 60
    WHEN 'OPERATOR' THEN 40
END;

ALTER TABLE public.profiles ALTER COLUMN role_level SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN role_level SET DEFAULT 60;

-- ----------------------------------------------------------------------------
-- 3. FUNCIÓN AUXILIAR SECURITY DEFINER: get_auth_role_level()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_auth_role_level()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role_level FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
$$;

-- ----------------------------------------------------------------------------
-- 4. EXTENSIÓN DE ZONES: ASIGNACIÓN A RSO
-- ----------------------------------------------------------------------------

ALTER TABLE public.zones 
ADD COLUMN IF NOT EXISTS assigned_rso_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_zones_assigned_rso ON public.zones(assigned_rso_id);

-- ----------------------------------------------------------------------------
-- 5. REESTRUCTURACIÓN DE POLÍTICAS RLS (ELIMINACIÓN TOTAL DE SUPER_ADMIN)
-- ----------------------------------------------------------------------------

-- A. ORGANIZATIONS
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
CREATE POLICY "Users can view their own organization"
ON public.organizations FOR SELECT
TO authenticated
USING (
    id = public.get_auth_org_id()
);

DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
CREATE POLICY "Admins can update their organization"
ON public.organizations FOR UPDATE
TO authenticated
USING (
    id = public.get_auth_org_id() AND public.get_auth_role_level() >= 100
);

-- B. PROFILES
DROP POLICY IF EXISTS "Users can view profiles in same organization" ON public.profiles;
CREATE POLICY "Users can view profiles in same organization"
ON public.profiles FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
);

-- Corrección 2 Claude: Conservar autoservicio para edición del propio perfil
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    id = auth.uid() 
    OR (organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 100)
);

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 100
);

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 100
);

-- C. ZONES (Filtro por RSO asignado para RSO/OPERATOR; todo el tenant para CONTROL_TOWER y ORG_ADMIN)
DROP POLICY IF EXISTS "Users can view zones in their organization" ON public.zones;
CREATE POLICY "Users can view zones in their organization"
ON public.zones FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
    AND (
        -- Torre de Control (80) y Administradores (100) supervisan todas las zonas
        public.get_auth_role_level() >= 80
        -- Zonas de uso común / compartidas (Safe Havens centrales, corredores primarios)
        OR assigned_rso_id IS NULL
        -- Zonas asignadas al RSO autenticado
        OR assigned_rso_id = auth.uid()
        -- Zonas asignadas al RSO supervisor del operador autenticado
        OR assigned_rso_id = (SELECT supervising_rso_id FROM public.profiles WHERE id = auth.uid())
    )
);

DROP POLICY IF EXISTS "RSOs and Admins can insert zones" ON public.zones;
CREATE POLICY "RSOs and Admins can insert zones"
ON public.zones FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 60
);

DROP POLICY IF EXISTS "RSOs and Admins can update zones" ON public.zones;
CREATE POLICY "RSOs and Admins can update zones"
ON public.zones FOR UPDATE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 60
);

DROP POLICY IF EXISTS "RSOs and Admins can delete zones" ON public.zones;
CREATE POLICY "RSOs and Admins can delete zones"
ON public.zones FOR DELETE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 60
);

-- D. TRAVELERS (Dropping nombres de migración 002 y 005 para evitar políticas vivas)
DROP POLICY IF EXISTS "Staff can view travelers in organization" ON public.travelers;
CREATE POLICY "Staff can view travelers in organization"
ON public.travelers FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
);

DROP POLICY IF EXISTS "Staff can insert travelers" ON public.travelers;
CREATE POLICY "Staff can insert travelers"
ON public.travelers FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 60
);

DROP POLICY IF EXISTS "RSOs and Admins can update travelers" ON public.travelers;
DROP POLICY IF EXISTS "Staff or self can update traveler status" ON public.travelers;
CREATE POLICY "RSOs and Admins can update travelers"
ON public.travelers FOR UPDATE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 60
);

DROP POLICY IF EXISTS "RSOs and Admins can delete travelers" ON public.travelers;
CREATE POLICY "RSOs and Admins can delete travelers"
ON public.travelers FOR DELETE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 60
);

-- E. BRIEFINGS Y POIS
DROP POLICY IF EXISTS "Users can view briefings in organization" ON public.briefings;
CREATE POLICY "Users can view briefings in organization"
ON public.briefings FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
);

DROP POLICY IF EXISTS "RSOs can manage briefings" ON public.briefings;
CREATE POLICY "RSOs can manage briefings"
ON public.briefings FOR ALL
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 60
);

DROP POLICY IF EXISTS "Users can view briefing POIs" ON public.briefing_pois;
CREATE POLICY "Users can view briefing POIs"
ON public.briefing_pois FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.briefings b 
        WHERE b.id = briefing_pois.briefing_id 
          AND b.organization_id = public.get_auth_org_id()
    )
);

DROP POLICY IF EXISTS "RSOs can manage briefing POIs" ON public.briefing_pois;
CREATE POLICY "RSOs can manage briefing POIs"
ON public.briefing_pois FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.briefings b 
        WHERE b.id = briefing_pois.briefing_id 
          AND b.organization_id = public.get_auth_org_id()
          AND public.get_auth_role_level() >= 60
    )
);

-- F. ALERTS
DROP POLICY IF EXISTS "Users can view alerts in organization" ON public.alerts;
CREATE POLICY "Users can view alerts in organization"
ON public.alerts FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
);

DROP POLICY IF EXISTS "Authenticated users can insert alerts" ON public.alerts;
CREATE POLICY "Authenticated users can insert alerts"
ON public.alerts FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id()
);

DROP POLICY IF EXISTS "Staff can acknowledge or resolve alerts" ON public.alerts;
CREATE POLICY "Staff can acknowledge or resolve alerts"
ON public.alerts FOR UPDATE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 40
);

-- G. AUDIT_LOGS (Subida de umbral confirmada por Daniel: solo CONTROL_TOWER y ORG_ADMIN)
DROP POLICY IF EXISTS "Admins and RSOs can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins and Control Tower can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id() AND public.get_auth_role_level() >= 80
);

DROP POLICY IF EXISTS "System and users can insert audit logs" ON public.audit_logs;
CREATE POLICY "System and users can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id()
);

-- ----------------------------------------------------------------------------
-- 6. ACTUALIZACIÓN DE RPC DE CREACIÓN DE ZONAS (003 Y 004 SANEADAS)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_tactical_zone(
    p_name TEXT,
    p_severity TEXT,
    p_coordinates_geojson JSONB,
    p_description TEXT DEFAULT NULL,
    p_color_hex TEXT DEFAULT '#EF4444',
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_org_id UUID DEFAULT NULL,
    p_assigned_rso_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_org_id UUID;
    v_user_id UUID;
    v_role_level INT;
    v_geom GEOMETRY;
    v_new_zone_id UUID;
    v_assigned_rso UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_user_id := auth.uid();
    v_org_id := public.get_auth_org_id();
    v_role_level := public.get_auth_role_level();

    -- Control de autenticación
    IF v_user_id IS NULL OR v_org_id IS NULL OR v_role_level IS NULL THEN
        RAISE EXCEPTION 'Acceso no autenticado o usuario inactivo en la organización.';
    END IF;

    -- Control de rol estricto: Se requiere RSO o superior (>= 60)
    IF v_role_level < 60 THEN
        RAISE EXCEPTION 'Rol insuficiente para crear zonas: se requiere nivel 60 o superior (RSO, CONTROL_TOWER u ORG_ADMIN).';
    END IF;

    -- Validación de parámetros
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'El nombre de la zona es obligatorio.';
    END IF;

    IF p_severity NOT IN ('RED', 'AMBER', 'SAFE_HAVEN', 'CORRIDOR') THEN
        RAISE EXCEPTION 'Severidad inválida: %, permitidos RED, AMBER, SAFE_HAVEN, CORRIDOR', p_severity;
    END IF;

    IF p_color_hex !~ '^#([A-Fa-f0-9]{6})$' THEN
        RAISE EXCEPTION 'Color hexadecimal inválido: %, formato requerido #RRGGBB', p_color_hex;
    END IF;

    -- Construcción de geometría
    BEGIN
        v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_coordinates_geojson::text), 4326);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Geometría GeoJSON inválida: %', SQLERRM;
    END;

    IF GeometryType(v_geom) != 'POLYGON' THEN
        RAISE EXCEPTION 'La zona debe ser de tipo POLYGON, recibido: %', GeometryType(v_geom);
    END IF;

    IF NOT ST_IsValid(v_geom) THEN
        v_geom := ST_MakeValid(v_geom);
        IF GeometryType(v_geom) != 'POLYGON' THEN
            RAISE EXCEPTION 'El polígono corregido no es un POLYGON simple válido.';
        END IF;
    END IF;

    -- Determinación de RSO asignado (si se proporciona explícitamente o el propio creador si es RSO)
    IF p_assigned_rso_id IS NOT NULL THEN
        v_assigned_rso := p_assigned_rso_id;
    ELSIF v_role_level = 60 THEN
        v_assigned_rso := v_user_id;
    ELSE
        v_assigned_rso := NULL;
    END IF;

    -- Inserción en public.zones
    INSERT INTO public.zones (
        organization_id,
        created_by,
        assigned_rso_id,
        name,
        description,
        severity,
        color_hex,
        geom,
        valid_from,
        valid_until,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_org_id,
        v_user_id,
        v_assigned_rso,
        TRIM(p_name),
        p_description,
        p_severity,
        p_color_hex,
        v_geom,
        v_now,
        p_valid_until,
        TRUE,
        v_now,
        v_now
    ) RETURNING id INTO v_new_zone_id;

    -- Registro forense en auditoría
    INSERT INTO public.audit_logs (
        organization_id,
        performed_by,
        action,
        entity_type,
        entity_id,
        payload,
        created_at
    ) VALUES (
        v_org_id,
        v_user_id,
        'ZONE_CREATED',
        'ZONE',
        v_new_zone_id::text,
        jsonb_build_object(
            'name', TRIM(p_name),
            'severity', p_severity,
            'assigned_rso_id', v_assigned_rso,
            'created_via', 'RPC_CREATE_TACTICAL_ZONE_V2'
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'zone_id', v_new_zone_id,
        'assigned_rso_id', v_assigned_rso,
        'message', 'Zona táctica creada y perimetrada exitosamente.'
    );
END;
$$;
