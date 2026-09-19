-- ==============================================================================
-- GZN — MIGRACIÓN 014: CORRECCIÓN DE RECURSIÓN EN LA POLÍTICA SELECT DE PROFILES
-- ==============================================================================
-- La política "Users can view profiles of same or lower role level" (013) incluye
-- una excepción para que un OPERATOR vea la ficha de su RSO supervisor:
--
--   OR id = (SELECT supervising_rso_id FROM public.profiles WHERE id = auth.uid())
--
-- Esa subconsulta interroga directamente public.profiles DENTRO de la propia
-- política de public.profiles, sin pasar por una función SECURITY DEFINER (a
-- diferencia de get_auth_org_id()/get_auth_role_level(), que sí lo son). Postgres
-- evalúa esa subconsulta bajo la misma política RLS que está intentando resolver,
-- lo que dispara "infinite recursion detected in policy for relation profiles" —
-- confirmado en producción: incluso el propio ORG_ADMIN quedaba bloqueado con
-- 403 al consultar su propio perfil.
--
-- Fix: extraer la subconsulta a una función SECURITY DEFINER (mismo patrón que
-- get_auth_org_id()/get_auth_role_level()), que bypassa RLS igual que ellas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_supervising_rso_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT supervising_rso_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "Users can view profiles of same or lower role level" ON public.profiles;
CREATE POLICY "Users can view profiles of same or lower role level"
ON public.profiles FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
    AND (
        role_level <= public.get_auth_role_level()
        OR id = auth.uid()
        OR id = public.get_auth_supervising_rso_id()
    )
);
