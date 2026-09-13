# Reglas de Proyecto — GZN (Green Zone Network / Secure Route)

## 1. Naturaleza del Proyecto: Misión Crítica
GZN es una plataforma de protección y movilidad táctica para personal desplazado en zonas de alto riesgo y conflicto (Duty of Care corporativo). Los errores aquí comprometen la integridad física de las personas. La seguridad, el modo offline y la fiabilidad de las alertas son no negociables.

## 2. La Memoria del Proyecto (`MEMORIA.md`)
- **Regla de Oro:** TODO cambio en la arquitectura, esquema de base de datos, endpoints, protocolos de crisis o integraciones DEBE registrarse inmediatamente en `MEMORIA.md`.
- `MEMORIA.md` es el cuaderno de bitácora y la memoria técnica viva del proyecto.
- Nunca se da por concluida una tarea técnica sin haber sincronizado la memoria del proyecto.
- Existe un hook en `.agents/hooks.json` y en `.githooks/pre-commit` que vigila el cumplimiento de esta norma.

## 3. Servicios y Credenciales
- **Repositorio:** `https://github.com/Isskion/GZN`
- **Supabase (PostgreSQL + PostGIS):** Proyecto `hyhfdzribmathwridokg` (`https://hyhfdzribmathwridokg.supabase.co`).
- **Firebase / Firestore:** Proyecto `greenzonenavigator` (FCM Alertas prioritarias y telemetría rápida).
- **Vercel:** Despliegue de consola web Next.js y endpoints serverless.
