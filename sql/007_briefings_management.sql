-- ==============================================================================
-- GZN MIGRACIÓN 007: GESTIÓN ATÓMICA DE BRIEFING POIS (TRANSACCIÓN RPC)
-- ==============================================================================
-- Proporciona atomicidad real en PostgreSQL para la actualización de POIs:
-- Elimina los POIs previos e inserta la nueva colección dentro de la misma
-- transacción. Si cualquier POI falla la validación, la transacción se revierte
-- por completo (ROLLBACK), impidiendo la pérdida accidental de coordenadas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.replace_briefing_pois(
    p_briefing_id UUID,
    p_pois JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_count INT := 0;
    v_poi JSONB;
    v_name TEXT;
    v_cat TEXT;
    v_lat DOUBLE PRECISION;
    v_lon DOUBLE PRECISION;
    v_notes TEXT;
BEGIN
    -- 1. Eliminar los POIs actuales del briefing
    DELETE FROM public.briefing_pois WHERE briefing_id = p_briefing_id;

    -- 2. Si p_pois no es nulo y es un array, insertar los nuevos elementos
    IF p_pois IS NOT NULL AND jsonb_typeof(p_pois) = 'array' THEN
        FOR v_poi IN SELECT * FROM jsonb_array_elements(p_pois)
        LOOP
            v_name := v_poi->>'name';
            v_cat := v_poi->>'category';
            v_lat := (v_poi->>'latitude')::DOUBLE PRECISION;
            v_lon := (v_poi->>'longitude')::DOUBLE PRECISION;
            v_notes := v_poi->>'notes';

            -- Validar campos obligatorios
            IF v_name IS NULL OR trim(v_name) = '' THEN
                RAISE EXCEPTION 'El nombre del POI es obligatorio';
            END IF;

            IF v_cat NOT IN ('EXTRACTION_POINT', 'HOSPITAL', 'POLICE', 'SAFE_HOUSE', 'CHECKPOINT', 'DANGER_POINT') THEN
                RAISE EXCEPTION 'Categoría de POI inválida: %', v_cat;
            END IF;

            IF v_lat IS NULL OR v_lat < -90 OR v_lat > 90 OR v_lon IS NULL OR v_lon < -180 OR v_lon > 180 THEN
                RAISE EXCEPTION 'Coordenadas WGS84 de POI fuera de rango: lat=%, lon=%', v_lat, v_lon;
            END IF;

            INSERT INTO public.briefing_pois (
                briefing_id,
                name,
                category,
                latitude,
                longitude,
                notes
            ) VALUES (
                p_briefing_id,
                trim(v_name),
                v_cat,
                v_lat,
                v_lon,
                v_notes
            );

            v_count := v_count + 1;
        END LOOP;
    END IF;

    RETURN v_count;
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.replace_briefing_pois(UUID, JSONB) TO authenticated, service_role;
