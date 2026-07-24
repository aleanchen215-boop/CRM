# CRM Paracao

CRM interno: clientes, conversaciones de WhatsApp, ventas, stock, IA y automatizaciones,
en un solo sistema. Ver el plan de arquitectura completo para el diseño de fondo
(base de datos, fases de desarrollo, decisiones de stack).

Stack: Next.js 16 (App Router) + TypeScript, Tailwind CSS v4 + shadcn/ui, tRPC,
Prisma 7 (Postgres vía Supabase), Supabase Auth.

## Estado actual (Fase 0 — Fundaciones)

Lo que ya existe:
- App Next.js con Tailwind + shadcn/ui, tema claro/oscuro automático.
- Shell del dashboard: sidebar de navegación (Clientes, Conversaciones, Ventas,
  Stock, IA, Automatizaciones, Reportes, Configuración) con páginas placeholder.
- Login con Supabase Auth (email + contraseña) y protección de rutas vía `src/proxy.ts`.
- Esquema de base de datos completo en `prisma/schema.prisma` (clientes, conversaciones,
  productos/stock, ventas/facturación, IA, automatizaciones, auditoría).
- Capa de API con tRPC (`src/server/trpc`) con middleware de permisos por rol
  (matriz en `src/server/trpc/permissions.ts`).

Lo que falta (fases siguientes, ver plan): CRUD real de cada módulo, integración
WhatsApp Cloud API, integración Mercado Pago, asistente de IA (OpenAI + RAG),
editor de automatizaciones, reportes.

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el proyecto de Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings → API**, copiar `Project URL` y `anon public key`.
3. En **Project Settings → Database**, copiar la **Direct connection** string
   (no la de connection pooling — el driver adapter de Prisma 7 se conecta directo).

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Completar `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
con los valores del paso anterior. Las demás variables (`OPENAI_API_KEY`, WhatsApp,
Mercado Pago, Inngest) no son necesarias todavía — se usan a partir de la Fase 1/2.

### 4. Aplicar el esquema de base de datos

```bash
npx prisma migrate dev --name init
```

Esto crea las tablas en Supabase y genera el cliente de Prisma en `src/generated/prisma`
(no se versiona en git — se regenera con `npx prisma generate` después de cada
cambio a `prisma/schema.prisma`).

### 5. Crear el primer usuario admin

Los usuarios de la app viven en dos lugares: Supabase Auth (credenciales) y la
tabla `users` de Prisma (rol y datos de perfil). Para el primer usuario:

1. Crearlo en **Authentication → Users** del dashboard de Supabase (o con
   `supabase.auth.admin.createUser` desde un script).
2. Insertar la fila correspondiente en la tabla `users` con `authId` igual al
   `id` que Supabase le asignó y `role = 'ADMIN'`:

   ```sql
   insert into users (id, "authId", email, name, role)
   values (gen_random_uuid(), '<auth-user-id>', 'vos@ejemplo.com', 'Tu nombre', 'ADMIN');
   ```

### 6. Correr en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) — redirige a `/login`.

## Deploy

Pensado para Vercel (app) + Supabase (base de datos/auth), ambos con plan gratuito
alcanzan sobradamente para la escala inicial. Requiere una cuenta de Vercel propia
del usuario — no se puede hacer desde acá; conectar el repo de GitHub en
[vercel.com/new](https://vercel.com/new) y cargar las mismas variables de entorno
del `.env.local`.

## Comandos útiles

```bash
npm run dev             # servidor de desarrollo (Turbopack)
npm run build            # build de producción
npx prisma studio         # explorador visual de la base de datos
npx prisma migrate dev     # aplicar cambios de schema.prisma como migración
npx eslint .                # lint
```
