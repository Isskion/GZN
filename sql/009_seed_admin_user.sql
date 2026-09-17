-- ==============================================================================
-- GZN — APROVISIONAMIENTO DIRECTO EN SQL DE USUARIO ADMIN (argoss01@gmail.com)
-- SQL puro (sin bloques PL/pgSQL ni comandos RAISE)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Asegurar organización por defecto
INSERT INTO public.organizations (name)
VALUES ('GZN Global Operations')
ON CONFLICT DO NOTHING;

-- 2. Insertar usuario en auth.users con email confirmado y contraseña Aleg0r1a
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token
)
VALUES (
  'd0000001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'argoss01@gmail.com',
  crypt('Aleg0r1a', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Daniel del Amo"}'::jsonb,
  now(),
  now(),
  ''
)
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('Aleg0r1a', gen_salt('bf')),
  email_confirmed_at = now(),
  updated_at = now();

-- 3. Insertar identidad GoTrue para autenticación por email y contraseña
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  'd0000001-0000-0000-0000-000000000001',
  'd0000001-0000-0000-0000-000000000001',
  '{"sub":"d0000001-0000-0000-0000-000000000001","email":"argoss01@gmail.com"}'::jsonb,
  'email',
  'd0000001-0000-0000-0000-000000000001',
  now(),
  now(),
  now()
)
ON CONFLICT DO NOTHING;

-- 4. Crear o actualizar perfil en public.profiles con rol ORG_ADMIN (nivel 100)
INSERT INTO public.profiles (
  id,
  organization_id,
  full_name,
  role,
  role_level,
  admin_origin
)
SELECT 
  'd0000001-0000-0000-0000-000000000001',
  id,
  'Daniel del Amo',
  'ORG_ADMIN',
  100,
  'GZN'
FROM public.organizations
LIMIT 1
ON CONFLICT (id) DO UPDATE SET 
  role = 'ORG_ADMIN',
  role_level = 100,
  admin_origin = 'GZN',
  full_name = 'Daniel del Amo';
