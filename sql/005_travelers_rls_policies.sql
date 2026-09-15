-- ============================================================================
-- GZN POSTGIS MIGRATION 005 — POLÍTICAS RLS DE GESTIÓN Y BAJA DE TRAVELERS
-- Ejecutar en Supabase: https://supabase.com/dashboard/project/hyhfdzribmathwridokg/sql
-- ============================================================================

-- 1. Sustituir la política permisiva de UPDATE por una restringida a RSO y Administradores
-- (Cierra el hueco detectado en auditoría donde OPERATOR podía modificar viajeros por RLS directo)
DROP POLICY IF EXISTS "Staff or self can update traveler status" ON public.travelers;
DROP POLICY IF EXISTS "RSOs and Admins can update travelers" ON public.travelers;

CREATE POLICY "RSOs and Admins can update travelers"
ON public.travelers FOR UPDATE
TO authenticated
USING (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);

-- 2. Habilitar política de DELETE para RSO y Administradores
-- (Necesaria para permitir el borrado físico legítimo cuando no existen alertas vinculadas)
DROP POLICY IF EXISTS "RSOs and Admins can delete travelers" ON public.travelers;

CREATE POLICY "RSOs and Admins can delete travelers"
ON public.travelers FOR DELETE
TO authenticated
USING (
    (organization_id = public.get_auth_org_id() AND public.get_auth_role() IN ('RSO', 'ORG_ADMIN'))
    OR public.get_auth_role() = 'SUPER_ADMIN'
);
