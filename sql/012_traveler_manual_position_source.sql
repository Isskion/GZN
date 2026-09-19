-- ============================================================================
-- GZN POSTGIS MIGRATION 012 — ORIGEN DE POSICIÓN DE VIAJEROS (RSO VS. HARDWARE)
-- Añade la columna 'position_source' para distinguir inequívocamente entre
-- fijación de posición manual por el RSO y telemetría de hardware verificada (M2M/GPS).
-- Ejecutar en Supabase: https://supabase.com/dashboard/project/hyhfdzribmathwridokg/sql
-- ============================================================================

-- 1. Añadir columna position_source (nullable: NULL indica viajero sin coordenadas)
ALTER TABLE public.travelers
  ADD COLUMN IF NOT EXISTS position_source TEXT;

-- 2. Restricción de dominio CHECK estricta
ALTER TABLE public.travelers
  DROP CONSTRAINT IF EXISTS check_travelers_position_source;

ALTER TABLE public.travelers
  ADD CONSTRAINT check_travelers_position_source
  CHECK (position_source IS NULL OR position_source IN ('MANUAL_RSO', 'DEVICE_TELEMETRY'));

-- 3. Documentación formal del esquema para auditorías DPIA / RGPD Art. 35
COMMENT ON COLUMN public.travelers.position_source IS 'Distingue entre fijación de posición manual por el RSO (MANUAL_RSO) y telemetría de hardware verificada (DEVICE_TELEMETRY).';

-- 4. Índice para optimizar consultas de telemetría y geofencing
CREATE INDEX IF NOT EXISTS idx_travelers_position_source
  ON public.travelers(organization_id, position_source)
  WHERE last_latitude IS NOT NULL AND last_longitude IS NOT NULL;
