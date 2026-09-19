-- ==============================================================================
-- GZN — MIGRACIÓN 015: EXCLUSIONES DE CONTROL DE ZONAS PARA CONTROL TOWER
-- ==============================================================================
-- 1. Crear tabla public.zone_control_exclusions (lista de exclusión para CONTROL_TOWER).
-- 2. Políticas RLS para zone_control_exclusions: Mandos (role_level >= 60) pueden
--    consultar y gestionar exclusiones acotadas a su propia organización vía join con profiles.
-- 3. Sustitución de política SELECT en public.zones:
--    - ORG_ADMIN (role_level >= 100): Visibilidad total sin excepción (techo del tenant).
--    - CONTROL_TOWER (role_level >= 80): Visibilidad total EXCEPTO zonas registradas
--      en zone_control_exclusions para auth.uid().
--    - RSO / OPERATOR: Visibilidad de zonas asignadas (assigned_rso_id = auth.uid(),
--      supervisor asignado, o zonas sin asignar).
-- ==============================================================================

-- 1. Tabla de exclusiones de control de zonas
CREATE TABLE IF NOT EXISTS public.zone_control_exclusions (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (profile_id, zone_id)
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_zone_control_exclusions_profile ON public.zone_control_exclusions(profile_id);
CREATE INDEX IF NOT EXISTS idx_zone_control_exclusions_zone ON public.zone_control_exclusions(zone_id);

ALTER TABLE public.zone_control_exclusions ENABLE ROW LEVEL SECURITY;

-- 2. Políticas RLS para zone_control_exclusions
DROP POLICY IF EXISTS "Command staff can view zone exclusions in their org" ON public.zone_control_exclusions;
CREATE POLICY "Command staff can view zone exclusions in their org"
ON public.zone_control_exclusions FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = zone_control_exclusions.profile_id
        AND p.organization_id = public.get_auth_org_id()
    )
    AND public.get_auth_role_level() >= 60
);

DROP POLICY IF EXISTS "Command staff can manage zone exclusions in their org" ON public.zone_control_exclusions;
CREATE POLICY "Command staff can manage zone exclusions in their org"
ON public.zone_control_exclusions FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = zone_control_exclusions.profile_id
        AND p.organization_id = public.get_auth_org_id()
    )
    AND public.get_auth_role_level() >= 60
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = zone_control_exclusions.profile_id
        AND p.organization_id = public.get_auth_org_id()
    )
    AND public.get_auth_role_level() >= 60
);

-- 3. Sustituir la política SELECT de public.zones
DROP POLICY IF EXISTS "Users can view zones in their organization" ON public.zones;
CREATE POLICY "Users can view zones in their organization"
ON public.zones FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
    AND (
        -- ORG_ADMIN (100): Visibilidad total irrestricta de todo el tenant
        public.get_auth_role_level() >= 100
        -- CONTROL_TOWER (80): Visibilidad total EXCEPTO zonas excluidas explícitamente
        OR (
            public.get_auth_role_level() >= 80
            AND NOT EXISTS (
                SELECT 1 FROM public.zone_control_exclusions e
                WHERE e.profile_id = auth.uid() AND e.zone_id = zones.id
            )
        )
        -- RSO / OPERATOR: Zonas bajo mando directo o de su RSO supervisor
        OR assigned_rso_id IS NULL
        OR assigned_rso_id = auth.uid()
        OR assigned_rso_id = (SELECT supervising_rso_id FROM public.profiles WHERE id = auth.uid())
    )
);
