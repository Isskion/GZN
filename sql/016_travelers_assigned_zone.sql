-- ============================================================================
-- GZN POSTGIS MIGRATION 016 — ASOCIACIÓN DE TRAVELERS (EL REBAÑO) A ZONAS TÁCTICAS
-- Sincronización bidireccional por triggers y aislamiento RLS por ámbito de zona
-- ============================================================================

-- 1. Añadir columna assigned_zone_id a public.travelers
ALTER TABLE public.travelers
ADD COLUMN IF NOT EXISTS assigned_zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.travelers.assigned_zone_id IS
'Zona de seguridad táctica a la que está adscrito el recurso. El mando RSO y supervisión de Torre de Control se derivan de esta zona.';

-- 2. Índice compuesto para acelerar consultas por organización y zona
CREATE INDEX IF NOT EXISTS idx_travelers_org_zone
ON public.travelers(organization_id, assigned_zone_id);

-- ----------------------------------------------------------------------------
-- 3. TRIGGERS BIDIRECCIONALES DE SINCRONIZACIÓN DE RSO (Mandato Daniel / Claude)
-- ----------------------------------------------------------------------------

-- TRIGGER 1: Al fijarse o cambiar la zona de un viajero, resolver su assigned_rso_id
-- desde zones.assigned_rso_id de la zona destino (NULL si no tiene RSO o zona)
CREATE OR REPLACE FUNCTION public.sync_traveler_assigned_rso()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_zone_id IS NULL THEN
        NEW.assigned_rso_id := NULL;
    ELSE
        SELECT assigned_rso_id INTO NEW.assigned_rso_id
        FROM public.zones
        WHERE id = NEW.assigned_zone_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_traveler_assigned_rso ON public.travelers;
CREATE TRIGGER trg_sync_traveler_assigned_rso
BEFORE INSERT OR UPDATE OF assigned_zone_id ON public.travelers
FOR EACH ROW
EXECUTE FUNCTION public.sync_traveler_assigned_rso();

-- TRIGGER 2: Cuando cambia el assigned_rso_id de una zona, propagar en cascada
-- a todos los viajeros adscritos a dicha zona para que nunca queden desfasados
CREATE OR REPLACE FUNCTION public.propagate_zone_assigned_rso_to_travelers()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.assigned_rso_id IS DISTINCT FROM NEW.assigned_rso_id THEN
        UPDATE public.travelers
        SET assigned_rso_id = NEW.assigned_rso_id
        WHERE assigned_zone_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_propagate_zone_rso_to_travelers ON public.zones;
CREATE TRIGGER trg_propagate_zone_rso_to_travelers
AFTER UPDATE OF assigned_rso_id ON public.zones
FOR EACH ROW
EXECUTE FUNCTION public.propagate_zone_assigned_rso_to_travelers();

-- ----------------------------------------------------------------------------
-- 4. POLÍTICA RLS SELECT: ENDURECIMIENTO POR ÁMBITO OPERATIVO DE ZONA
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view travelers in organization" ON public.travelers;
DROP POLICY IF EXISTS "Users can view travelers in their operational zone scope" ON public.travelers;

CREATE POLICY "Users can view travelers in their operational zone scope"
ON public.travelers FOR SELECT
TO authenticated
USING (
    organization_id = public.get_auth_org_id()
    AND (
        -- 1. ORG_ADMIN (100): Visibilidad irrestricta de todo el tenant
        public.get_auth_role_level() >= 100

        -- 2. Recursos en tránsito o sin zona asignada: Visibles para todo el staff operativo
        -- (Permite al RSO o mando de sector ver personal no adscrito para incorporarlo a su zona)
        OR assigned_zone_id IS NULL

        -- 3. Recursos en zonas bajo el alcance del usuario:
        -- Reutiliza la misma lógica autoritativa de la migración 015 sin riesgo de recursión
        OR EXISTS (
            SELECT 1 FROM public.zones z
            WHERE z.id = travelers.assigned_zone_id
            AND z.organization_id = travelers.organization_id
            AND (
                -- CONTROL_TOWER (80): Todas las zonas excepto sus exclusiones explícitas
                (
                    public.get_auth_role_level() >= 80
                    AND NOT EXISTS (
                        SELECT 1 FROM public.zone_control_exclusions e
                        WHERE e.profile_id = auth.uid() AND e.zone_id = z.id
                    )
                )
                -- RSO / OPERATOR: Zonas asignadas directamente o a su supervisor
                OR z.assigned_rso_id IS NULL
                OR z.assigned_rso_id = auth.uid()
                OR z.assigned_rso_id = (SELECT supervising_rso_id FROM public.profiles WHERE id = auth.uid())
            )
        )
    )
);
