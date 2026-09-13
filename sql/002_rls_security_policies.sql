-- ============================================================================
-- GZN RLS POLICIES v1.0 — SEGURIDAD MULTI-TENANT Y PERMISOS POR ROL
-- Ejecutar en Supabase: https://supabase.com/dashboard/project/hyhfdzribmathwridokg/sql
-- ============================================================================

-- 1. Funciones auxiliares SECURITY DEFINER para resolución de Tenancy y Rol sin recursión
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
$$;

-- 2. Habilitar Row Level Security (RLS) en todas las tablas
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefing_pois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- POLÍTICAS: ORGANIZATIONS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their own organization"
ON public.organizations FOR SELECT
TO authenticated
USING (
    id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Admins can update their organization"
ON public.organizations FOR UPDATE
TO authenticated
USING (
    (id = public.get_auth_org_id() AND public.get_auth_role() = 'ORG_ADMIN')
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

-- ----------------------------------------------------------------------------
-- POLÍTICAS: PROFILES
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view profiles in same organization"
ON public.profiles FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    id = auth.uid() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() = 'ORG_ADMIN')
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

-- ----------------------------------------------------------------------------
-- POLÍTICAS: ZONES (Zonas Rojas, Ámbar, Safe Havens y Corredores)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view zones in their organization"
ON public.zones FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "RSOs and Admins can insert zones"
ON public.zones FOR INSERT
TO authenticated
WITH CHECK (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "RSOs and Admins can update zones"
ON public.zones FOR UPDATE
TO authenticated
USING (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "RSOs and Admins can delete zones"
ON public.zones FOR DELETE
TO authenticated
USING (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

-- ----------------------------------------------------------------------------
-- POLÍTICAS: TRAVELERS (El Rebaño)
-- ----------------------------------------------------------------------------
CREATE POLICY "Staff can view travelers in organization"
ON public.travelers FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Staff can insert travelers"
ON public.travelers FOR INSERT
TO authenticated
WITH CHECK (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Staff or self can update traveler status"
ON public.travelers FOR UPDATE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

-- ----------------------------------------------------------------------------
-- POLÍTICAS: BRIEFINGS Y POIS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view briefings in organization"
ON public.briefings FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "RSOs can manage briefings"
ON public.briefings FOR ALL
TO authenticated
USING (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Users can view briefing POIs"
ON public.briefing_pois FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.briefings b 
        WHERE b.id = briefing_pois.briefing_id 
          AND (b.organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN')
    )
);

CREATE POLICY "RSOs can manage briefing POIs"
ON public.briefing_pois FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.briefings b 
        WHERE b.id = briefing_pois.briefing_id 
          AND (
              (b.organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
              OR public.get_auth_role() = 'SUPER_ADMIN'
          )
    )
);

-- ----------------------------------------------------------------------------
-- POLÍTICAS: ALERTS (Pánicos, Violaciones y Hombre Muerto)
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view alerts in organization"
ON public.alerts FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Authenticated users can insert alerts"
ON public.alerts FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Staff can acknowledge or resolve alerts"
ON public.alerts FOR UPDATE
TO authenticated
USING (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN', 'OPERATOR'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

-- ----------------------------------------------------------------------------
-- POLÍTICAS: AUDIT_LOGS (Inmutable por diseño)
-- ----------------------------------------------------------------------------
CREATE POLICY "Admins and RSOs can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('ORG_ADMIN', 'RSO', 'SUPER_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

CREATE POLICY "System and users can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id() OR public.get_auth_role() = 'SUPER_ADMIN'
);
-- Nota: No se definen políticas de UPDATE ni DELETE para audit_logs garantizando inmutabilidad.
