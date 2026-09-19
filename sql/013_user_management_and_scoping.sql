-- ==============================================================================
-- GZN — MIGRACIÓN 013: GESTIÓN DE PERSONAL Y AISLAMIENTO JERÁRQUICO POR ROL
-- ==============================================================================
-- 1. Añadir columna email en public.profiles para gestión e identificación unificada.
-- 2. Backfill de emails desde auth.users.
-- 3. Creación de índices optimizados para email y filtrado por role_level.
-- 4. Actualización de políticas RLS:
--    - SELECT: Visibilidad jerárquica estricta (role_level <= get_auth_role_level(), 
--      con autoservicio de perfil propio y acceso al supervisor directo).
--    - UPDATE: Autorización jerárquica para modificación y desactivación (role_level >= 60
--      y target role_level <= caller, conservando autoservicio).
--    - INSERT: Creación restringida a mandos (role_level >= 60) con techo en su propio nivel.
--    - DELETE: Borrado físico reservado exclusivamente a ORG_ADMIN (role_level >= 100).
-- ==============================================================================

-- 1. Añadir columna email
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill de emails desde auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_profiles_role_level ON public.profiles(organization_id, role_level DESC);

-- 4. Políticas RLS
-- A. SELECT: Visibilidad por rol (mismo nivel o inferior)
DROP POLICY IF EXISTS "Users can view profiles in same organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of same or lower role level" ON public.profiles;
CREATE POLICY "Users can view profiles of same or lower role level"
ON public.profiles FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
    AND (
        -- Regla central: nivel numérico igual o inferior al del usuario autenticado
        role_level <= public.get_auth_role_level()
        -- Excepción: ver el propio perfil
        OR id = auth.uid()
        -- Excepción: un operador supervisado puede ver la ficha de su RSO asignado
        OR id = (SELECT supervising_rso_id FROM public.profiles WHERE id = auth.uid())
    )
);

-- B. UPDATE: Modificación jerárquica (Corrección 2 Claude)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update profiles within hierarchical authority" ON public.profiles;
CREATE POLICY "Users can update profiles within hierarchical authority"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
    AND (
        -- Autoservicio del propio perfil
        id = auth.uid()
        -- Mandos (>= 60) pueden modificar perfiles de rango igual o inferior
        OR (
            public.get_auth_role_level() >= 60
            AND role_level <= public.get_auth_role_level()
        )
    )
)
WITH CHECK (
    organization_id = public.get_auth_org_id()
    AND (
        id = auth.uid()
        OR (
            public.get_auth_role_level() >= 60
            AND role_level <= public.get_auth_role_level()
        )
    )
);

-- C. INSERT: Creación restringida a mandos (role_level >= 60) hasta su propio nivel
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authorized users can insert profiles" ON public.profiles;
CREATE POLICY "Authorized users can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
    organization_id = public.get_auth_org_id()
    AND role_level <= public.get_auth_role_level()
    AND public.get_auth_role_level() >= 60
);

-- D. DELETE: Purga física reservada exclusivamente a Administrador de Organización (>= 100)
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (
    organization_id = public.get_auth_org_id() 
    AND public.get_auth_role_level() >= 100
);
