# AGENTS.md — bandadau-shared (`@bandada/*`)

Repositorio de paquetes compartidos (ADR-0017); los paquetes viven en `packages/`. Lee primero `../AGENTS.md` (workspace), `bandadau-docs/docs/03-arquitectura/arquitectura-general.md` §6,
`bandadau-docs/docs/04-patrones-y-reglas/convenciones-generales.md`, `design-tokens-y-temas.md` e `i18n.md`.

## Identidad

Librerías **TypeScript** compartidas (pnpm workspace propio de este repo). Los demás repos las consumen
como dependencia local hermana (`"@bandada/<pkg>": "file:<../…>/bandadau-shared/packages/<pkg>"`, con la
profundidad según la ubicación del `package.json`). Solo las consumen servicios NestJS y apps
JS/TS. Java y PHP **no** las usan: tienen equivalentes dentro de cada servicio; entre lenguajes se
comparten **contratos**, no código.

## Paquetes

| Paquete | Carpeta | Propósito | Consumidores |
|---|---|---|---|
| `@bandada/contracts-ts` | `contracts-ts/` | Tipos **generados** de `bandadau-docs/contracts/` (OpenAPI → `openapi-typescript`, AsyncAPI → tipos de `data` de cada CloudEvent, GraphQL → `graphql-codegen`). **No se edita a mano**: `pnpm contracts:gen` (lee `../bandadau-docs/contracts`) | Todos los TS |
| `@bandada/messaging-ts` | `messaging-ts/` | Sobre CloudEvents 1.0 (`createCloudEvent`, extensiones `correlationid`, `causationid`, `sagaid`, `traceparent`), conexión RabbitMQ, **outbox** (Mongo y DynamoDB) + relay, **inbox** (`processedMessages`), reintentos con backoff y DLX | social, media, ticketing, insights, admin-gateway |
| `@bandada/idempotency-ts` | `idempotency-ts/` | Interceptor NestJS de `Idempotency-Key` sobre `bandada-idempotency` (D3: `IN_PROGRESS/COMPLETED`, hash, réplica con `Idempotent-Replayed`, 409/422) | servicios Nest con endpoints ♻️ |
| `@bandada/auth-ts` | `auth-ts/` | Validación JWT por JWKS con caché, `JwtAuthGuard`, `RolesGuard`, `@CurrentUser()`, `ServiceTokenProvider` (client credentials) | servicios Nest |
| `@bandada/ui-tokens` | `ui-tokens/` | Tokens **DTCG** compilados con Style Dictionary v4 → `dist/css/tokens.css`, `dist/css/tailwind-theme.css`, `dist/scss/_tokens.scss`, `dist/ts/tokens.ts`; modos `light`/`dark` en la capa semántica; prueba de contraste WCAG AA | todas las apps, insights (gráficos) |
| `@bandada/i18n` | `i18n/` | `locales/{es,en}/{common,enums,errors}.json` (ICU), `format.ts` (`formatCredits`, `formatDate`, `formatRelative`…, zona `America/La_Paz`), `resolve-locale.ts`, `config.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE='es'`), `scripts/i18n-check.mjs` | todas las apps |
| `@bandada/eslint-config` | `eslint-config/` | ESLint flat config base (TS strict, import order, sin literales en JSX, sin paleta cruda en clases) + presets `node`, `react`, `next`, `expo`, `angular` | todos |
| `@bandada/tsconfig` | `tsconfig/` | `base.json`, `node.json`, `react.json`, `next.json`, `expo.json` | todos |

## Estructura común de un paquete

```
bandadau-shared/packages/<nombre>/
├── package.json        name @bandada/<nombre>, "type": "module", "exports" explícitos, "sideEffects": false
├── src/                (o tokens/ y locales/ en ui-tokens/i18n)
├── dist/               generado (no editar, no commitear salvo que el build del consumidor lo exija)
├── test/
├── README.md  AGENTS.md (opcional si el paquete crece)
└── tsconfig.json       extends @bandada/tsconfig
```

## Comandos (propuestos)

```bash
pnpm -r --filter "./packages/**" build
pnpm --filter @bandada/<nombre> test | lint | typecheck
pnpm contracts:gen                              # regenera contracts-ts desde ../bandadau-docs/contracts
pnpm --filter @bandada/ui-tokens build          # Style Dictionary → dist/
pnpm --filter @bandada/ui-tokens test           # contraste + mismas claves light/dark
pnpm --filter @bandada/i18n i18n:check          # paridad es/en, ICU válido, claves huérfanas
```

## Variables de entorno

Ninguna propia: los paquetes **reciben configuración por parámetros** (URL de JWKS, nombre de tabla,
URL de RabbitMQ). Prohibido leer `process.env` dentro de un paquete.

## Reglas específicas y gotchas

- Los paquetes **no dependen de servicios ni de apps**; solo entre sí en este orden:
  `tsconfig/eslint-config` ← `contracts-ts` ← `messaging-ts`, `auth-ts`, `idempotency-ts`;
  `ui-tokens` e `i18n` son independientes.
- Nada de lógica de negocio de un contexto: si solo lo usa un servicio, vive en ese servicio.
- `messaging-ts`, `auth-ts`, `idempotency-ts` exponen piezas para la capa **interface-adapters/frameworks**
  de Clean; nunca se importan desde `entities`/`use-cases` (dependency-cruiser lo bloquea).
- `ui-tokens`: se editan los JSON de `tokens/`, nunca `dist/`. Un token semántico nuevo debe existir en
  `light` **y** `dark` y pasar contraste AA. Los primitivos no se usan en componentes.
- `i18n`: `es` es la fuente; toda clave nueva en `es` y `en` en el mismo PR; mensajes de error por **código**
  estable de Problem Details (`errors.<CODE>`), etiquetas de enums por valor del dominio.
- Cambios incompatibles → versión mayor (SemVer) y PRs coordinados en cada repo consumidor (un commit
  nunca cruza repositorios).
- Verificar versiones de `openapi-typescript`, `graphql-codegen`, Style Dictionary v4 e i18next al implementar.

## Casos de uso

Transversales: T8 (idempotencia), T4 (contratos), D13/D14 (tokens e i18n) en todas las UI.

## Definición de hecho

`definition-of-done.md` §0 + pruebas unitarias del paquete + build de **todos** los consumidores en verde.
