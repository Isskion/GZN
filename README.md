# GZN (Green Zone Network) — Secure Route

Aplicación y plataforma de gestión, monitorización táctica y movilidad segura para recursos expatriados, personal diplomático y convoyes en zonas de conflicto y alto riesgo.

## Memoria del Proyecto
Toda la arquitectura, esquema de datos, decisiones técnicas (ADR) y registro de avance se encuentra documentado de forma viva en:
👉 **[MEMORIA.md](./MEMORIA.md)**

## Infraestructura y Servicios
*   **Base de Datos & Geo:** Supabase (`hyhfdzribmathwridokg` — PostgreSQL + PostGIS nativo)
*   **Canal de Alertas & Push:** Firebase (`greenzonenavigator` — FCM & Firestore)
*   **Despliegue Consola:** Vercel (Next.js + MapLibre GL)
*   **Repositorio Central:** [github.com/Isskion/GZN](https://github.com/Isskion/GZN)

## Guía de Arranque Rápido
1. Consultar [MEMORIA.md](./MEMORIA.md) para el diseño del sistema.
2. Esquema inicial de base de datos y políticas de seguridad desplegados desde [`sql/001_initial_schema_postgis.sql`](./sql/001_initial_schema_postgis.sql) y [`sql/002_rls_security_policies.sql`](./sql/002_rls_security_policies.sql).
3. Consola RSO ejecutable localmente con `pnpm dev` (Next.js 15 + MapLibre GL).
