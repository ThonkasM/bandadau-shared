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

## Comandos

```bash
corepack enable && pnpm install --frozen-lockfile    # pnpm 10 fijado en packageManager (pnpm 12 no funciona con Corepack aquí)
pnpm build                                          # todos los paquetes, en orden de dependencia (dist/ no se commitea)
pnpm test                                           # Vitest; lo que necesita motores reales se omite sin *_URL
pnpm test:integration                               # contenedores efímeros bandadau-shared-test-* (DynamoDB Local, Mongo rs0, RabbitMQ)
pnpm lint | pnpm typecheck | pnpm smoke             # ESLint, tsc --noEmit, carga ESM/CJS de cada entrada exportada
pnpm contracts:gen                                  # regenera contracts-ts/src/generated desde ../bandadau-docs/contracts (SE COMMITEA)
pnpm --filter @bandada/ui-tokens build              # Style Dictionary → dist/ + contraste WCAG AA (falla si no cumple)
pnpm i18n:check                                     # paridad es/en, ICU válido, placeholders, códigos de error de los contratos
```

Cada paquete expone `exports` explícitos (ESM + CJS + d.ts) y `typesVersions` (resolución `node10` de los servicios
Nest). Los subpaths `/nest` (auth, idempotency, messaging) son los únicos que importan `@nestjs/*` (peer opcional);
el núcleo de cada paquete no depende de Nest. Docker: ver "Uso en Docker" del `README.md`.

## Notas de implementación por paquete

- **tsconfig / eslint-config**: presets `node`, `react`, `next`, `expo`, `angular` (flat config). Las reglas
  `no-restricted-syntax` rechazan paleta cruda (`bg-blue-600`), colores arbitrarios (`bg-[#fff]`) y colores literales
  en estilos; `react/jsx-no-literals` rechaza texto en JSX. Probado con `ESLint.lintText`.
- **ui-tokens**: fuentes en `tokens/{primitive,semantic,component}`; `build/style-dictionary.config.mjs` (Style
  Dictionary 4.4) resuelve cada modo por separado y genera `dist/css/tokens.css` (`:root,[data-theme='light']` y
  `[data-theme='dark']` solo con lo que difiere), `dist/css/tailwind-theme.css` (`@theme inline` con
  `--color-*: initial` para que la paleta cruda no exista como utilidad; `text.muted`→`text-muted`,
  `bg.muted`→`bg-surface-muted`), `dist/scss/_tokens.scss`, `dist/json/tokens.flat.json`, `dist/ts/tokens.ts`
  (`tokens: {light,dark}` con dimensiones numéricas para React Native, `tokenNames`, `flatTokens`, `cssVarName`).
  `contrast-pairs.json` declara los pares de `check-contrast.mjs`. `src/theme-script.ts`: `themeScript` (anti-FOUC),
  `applyTheme`, `resolveEffectiveTheme`. `src/generated/` se genera en el build (no se commitea).
- **i18n**: `locales/{es,en}/{common,enums,errors}.json` (sin envoltorio de namespace). `errors.json` cubre todos los
  `code` de error de `bandadau-docs/contracts/openapi` (script `scripts/extract-error-codes.mjs`, que además agrega
  los códigos de protocolo: `IDEMPOTENCY_KEY_*`, `TOO_MANY_ATTEMPTS`, códigos de campo `REQUIRED`/`TOO_LONG`…) y los
  enums del modelo (OpenAPI + GraphQL). `bandada-i18n-check <dir> [--src <dir>] [--contracts <dir>] [--strict]`.
  Formato: `es-BO`/`en-US`, `America/La_Paz` (`14 oct 2026, 18:30` / `Oct 14, 2026, 6:30 PM`).
- **contracts-ts**: un módulo por servicio OpenAPI (`/openapi/<servicio>`), `EventDataMap`/`EventType`/`eventMeta`
  desde AsyncAPI (los esquemas se pasan por `openapi-typescript`), tipos GraphQL con `graphql-codegen`
  (`enumsAsTypes`, escalares `DateTime/Date/UUID`→`string`, `JSON`→`unknown`, `Long`→`number`).
- **auth-ts**: `createJwtVerifier` (jose: `createRemoteJWKSet`, RS256 obligatorio, `iss`/`aud`/`typ`, tolerancia 30 s,
  refetch por `kid` desconocido con cooldown 30 s), `ServiceTokenProvider` (JSON `{clientId, clientSecret, scopes}`
  según OpenAPI; single-flight; refresco 30 s antes de `exp`). Nest: `AuthModule.forRoot`, `JwtAuthGuard`
  (`@Public()`), `RolesGuard` (`@Roles()`), `ServiceAuthGuard` + `@Internal(...scopes)` para `/internal/v1`,
  `@CurrentUser()`. Los errores son `HttpException` con cuerpo Problem Details (`UNAUTHORIZED`, `FORBIDDEN`, 503).
- **idempotency-ts**: puerto `IdempotencyStore` (`reserve/complete/release`), adaptadores `DynamoIdempotencyStore`
  e `InMemoryIdempotencyStore`; `hashRequest` (SHA-256 sobre método, ruta plantilla, params, principal, cuerpo
  canónico). Interceptor: 400 `IDEMPOTENCY_KEY_MISSING/INVALID`, 409 `IDEMPOTENCY_IN_PROGRESS` (+`Retry-After: 1`),
  422 `IDEMPOTENCY_KEY_REUSED`, 409 `IDEMPOTENCY_RESPONSE_UNAVAILABLE` (>300 KB); guarda 2xx y 400/404/409/422, libera
  401/403/429/5xx. Errores de dominio que no sean `HttpException` se guardan solo si el servicio da `mapError`.
- **messaging-ts**: fase 1 → `topology: 'verify'` (por defecto) comprueba exchanges, cola, `.retry.*` y `.dlq` y
  reintenta al arrancar; `'declare'` crea la topología de eventos-y-mensajeria.md §2.2 (para pruebas o fase 2).
  Reintentos 5 s / 30 s / 5 min (`DEFAULT_RETRY_DELAYS`, configurables); permanentes, tipos desconocidos y reintentos
  agotados → `nack(requeue=false)` → DLQ. Inbox/outbox: `Inbox<Tx>.runOnce(key, work)` y `Outbox<Tx>.enqueue(tx, event)`
  con `Tx` = sesión Mongo, `DynamoTransaction` (`TransactWriteItems`, máx. 100 ítems) o `MemoryTx`.
  Mongo: `outbox` / `processedMessages` (el inbox usa upsert, no insert, para no abortar la transacción);
  Dynamo: `OUTBOX#<id>`/`META` con `gsi1pk=OUTBOX#PENDING` (índice `GSI1`) e `INBOX#<id>`/`META`.
- Diferencias **entre contratos y guías** (bandadau-docs es solo lectura; se implementó lo contractual y hay que
  corregir la fuente): (1) `seguridad-y-sso.md` §6.2 describe `service-token` como formulario `grant_type=client_credentials`
  con `access_token`, pero `identity-service.yaml` define JSON `{clientId, clientSecret, scopes}` → `{accessToken, expiresIn}`
  (el proveedor envía JSON y tolera snake_case en la respuesta); (2) `bandada-events.yaml` dice reintentos 1 s/5 s/25 s,
  `eventos-y-mensajeria.md` §2.3 dice colas de espera 5 s/30 s/5 min (se implementó esto último).

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
