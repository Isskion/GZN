-- ==============================================================================
-- GZN — APROVISIONAMIENTO DE USUARIO ADMINISTRADOR (PLANTILLA GENÉRICA)
-- ==============================================================================
-- SEGURIDAD: este archivo se versiona en un repositorio PÚBLICO. No sustituyas los
-- placeholders de abajo por un email, nombre o contraseña reales al editarlo — solo
-- al ejecutarlo a mano en el SQL Editor de Supabase, nunca en una copia que se vaya
-- a comitear. Nunca escribas una contraseña real (ni de ejemplo con pinta de real)
-- en un archivo versionado.
--
-- INSTRUCCIONES:
--
-- MÉTODO RECOMENDADO (100% NATIVO Y SEGURO):
-- 1. Si ejecutaste un script previo que falló, corre la SECCIÓN 0 para limpiar.
-- 2. En el panel de Supabase: Ve a "Authentication" -> "Users" -> "Add User" -> "Create User"
--    - Email: <EMAIL_DEL_ADMIN>
--    - Password: <ELEGIDA_POR_TI_EN_EL_MOMENTO_NUNCA_ESCRITA_AQUI>
--    - Auto Confirm User?: SÍ (marcar la casilla)
--    - Clic en "Create User"
-- 3. Vuelve al SQL Editor y ejecuta la SECCIÓN 1 (Vinculación de Perfil ORG_ADMIN),
--    sustituyendo los placeholders <EMAIL_DEL_ADMIN> y <NOMBRE_COMPLETO> por los
--    valores reales solo en el editor, no en este archivo.
--
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECCIÓN 0: LIMPIEZA PREVENTIVA DE RESIDUOS PREVIOS (SI HUBIERA FALLADO ANTES)
-- ------------------------------------------------------------------------------
DELETE FROM public.profiles WHERE id = 'd0000001-0000-0000-0000-000000000001';
DELETE FROM auth.identities WHERE user_id = 'd0000001-0000-0000-0000-000000000001';
DELETE FROM auth.users WHERE email IN ('<EMAIL_DEL_ADMIN>', 'testclean9988@gmail.com');

-- ------------------------------------------------------------------------------
-- SECCIÓN 1: ASIGNACIÓN DE PERFIL ORG_ADMIN (NIVEL 100) AL USUARIO DE AUTH
-- (Ejecutar después de crear el usuario en Authentication -> Users)
-- ------------------------------------------------------------------------------

-- Asegurar que existe al menos una organización
INSERT INTO public.organizations (name)
VALUES ('GZN Global Operations')
ON CONFLICT DO NOTHING;

-- Vincular el usuario de auth al perfil ORG_ADMIN
INSERT INTO public.profiles (
  id,
  organization_id,
  full_name,
  role,
  role_level,
  admin_origin
)
SELECT
  u.id,
  o.id,
  '<NOMBRE_COMPLETO>',
  'ORG_ADMIN',
  100,
  'GZN'
FROM auth.users u
CROSS JOIN (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1) o
WHERE u.email = '<EMAIL_DEL_ADMIN>'
ON CONFLICT (id) DO UPDATE SET
  role = 'ORG_ADMIN',
  role_level = 100,
  admin_origin = 'GZN',
  full_name = '<NOMBRE_COMPLETO>';

-- Verificación final
SELECT p.id, p.full_name, p.role, p.role_level, p.admin_origin, o.name AS organization
FROM public.profiles p
JOIN public.organizations o ON p.organization_id = o.id
JOIN auth.users u ON p.id = u.id
WHERE u.email = '<EMAIL_DEL_ADMIN>';
