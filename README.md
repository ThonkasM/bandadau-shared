# bandadau-shared — librerías `@bandada/*`

Librerías TypeScript compartidas (pnpm workspace propio; solo para servicios NestJS y apps JS/TS). Los demás
repos las consumen como dependencia local hermana: `file:../bandadau-shared/packages/<pkg>` (ajustando la
profundidad). Reglas, orden de dependencias y gotchas: **[`AGENTS.md`](AGENTS.md)**.

| Paquete | Propósito | Entradas |
|---|---|---|
| `@bandada/tsconfig` | `base`, `node`, `react`, `next`, `expo` | `@bandada/tsconfig/node.json` |
| `@bandada/eslint-config` | ESLint flat config: TS estricto, orden de imports, sin literales en JSX, sin paleta cruda ni hex en clases/estilos | `/node`, `/react`, `/next`, `/expo`, `/angular` |
| `@bandada/ui-tokens` | Tokens DTCG → CSS vars `--bd-*`, tema Tailwind v4, SCSS, TS tipado; script anti-FOUC; contraste WCAG AA | `.`, `/theme-script`, `/css/tokens.css`, `/css/tailwind-theme.css`, `/scss/_tokens.scss`, `/json/tokens.flat.json` |
| `@bandada/i18n` | Catálogos `es`/`en` (ICU: `common`, `enums`, `errors`), `format*`, `resolveLocale`, CLI `bandada-i18n-check` | `.`, `/format`, `/resolve-locale`, `/config`, `/errors`, `/locales/*` |
| `@bandada/contracts-ts` | Tipos generados de OpenAPI/AsyncAPI/GraphQL + `ProblemDetails`/`isProblem` | `.`, `/openapi/<servicio>`, `/events`, `/graphql/admin`, `/problem` |
| `@bandada/auth-ts` | Validación JWT por JWKS, `ServiceTokenProvider`; guards y decoradores Nest | `.`, `/nest` |
| `@bandada/idempotency-ts` | `Idempotency-Key` (DynamoDB / memoria), `@Idempotent()` | `.`, `/nest` |
| `@bandada/messaging-ts` | CloudEvents, RabbitMQ (publisher, consumer con reintentos/DLQ), outbox + inbox (Mongo, DynamoDB, memoria), relay | `.`, `/nest` |

## Quick start

Requisitos: Node ≥ 22.12 (el equipo usa 24) y Docker solo para las pruebas de integración. pnpm se obtiene con
Corepack (la versión queda fijada en `packageManager`):

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build        # dist/ de todos los paquetes, en orden de dependencia (tsup / Style Dictionary)
pnpm test         # Vitest de todos los paquetes
pnpm lint
pnpm i18n:check   # paridad es/en, ICU válido, placeholders, códigos de error de los contratos
pnpm smoke        # cada entrada exportada carga como ESM y CJS y tiene sus tipos
```

> `corepack pnpm …` funciona sin `corepack enable`. pnpm 12 no se instala con Corepack en el entorno del
> equipo (falta `pnpm.cjs`), por eso el repo fija pnpm 10 (`packageManager`).

## Scripts (raíz)

| Script | Qué hace |
|---|---|
| `pnpm build` | `pnpm -r build` (orden topológico). `ui-tokens` falla si algún par de colores no cumple WCAG AA |
| `pnpm test` | Pruebas unitarias y de contrato de puertos. Las pruebas contra motores reales se **omiten** si no hay `RABBITMQ_URL`/`MONGO_URL`/`DYNAMODB_ENDPOINT` |
| `pnpm test:integration` | Levanta contenedores efímeros (`bandadau-shared-test-*`, puertos 15690/17017/18000, límites de memoria), corre las pruebas con motores reales y los elimina |
| `pnpm contracts:gen` | Regenera `contracts-ts/src/generated/` desde `../bandadau-docs/contracts` (**la salida se commitea**) |
| `pnpm i18n:check` | `bandada-i18n-check locales --contracts ../bandadau-docs/contracts` |
| `pnpm lint` / `pnpm typecheck` / `pnpm smoke` | ESLint, `tsc --noEmit` por paquete, carga de entradas |

## Uso en Docker

`dist/` no se commitea: cada consumidor construye `bandadau-shared` dentro de su build. Con el layout de
hermanos (`/work/bandadau-backend`, `/work/bandadau-shared`) la ruta `file:../../../bandadau-shared/packages/<pkg>`
resuelve igual que en el host. En Compose: `build.additional_contexts: { shared: ../bandadau-shared }`.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /work

# 1) bandadau-shared (contexto nombrado "shared"): instalar y compilar una sola vez (capa cacheable)
COPY --from=shared . /work/bandadau-shared
RUN cd /work/bandadau-shared \
 && corepack enable \
 && pnpm install --frozen-lockfile \
 && pnpm build

# 2) el servicio, en la misma profundidad que en el host
COPY services/social-service /work/bandadau-backend/services/social-service
WORKDIR /work/bandadau-backend/services/social-service
RUN corepack enable && pnpm install && pnpm build
```

Notas:
- Solo hace falta compilar los paquetes que se usan: `pnpm install --frozen-lockfile --filter "@bandada/messaging-ts..." && pnpm --filter "@bandada/messaging-ts..." build`.
- `pnpm install` en el servicio copia cada paquete `file:` (con su `dist/`) y también instala sus dependencias de
  runtime (`jose`, `amqp-connection-manager`, AWS SDK…). Las **peer** (`@nestjs/*`, `rxjs`, `reflect-metadata`,
  `mongodb`) las aporta el servicio.
- El `.dockerignore` de este repo excluye `node_modules`, `dist` y `.git` del contexto.
- Verificado con `node:24-slim`: `corepack enable && pnpm install --frozen-lockfile && pnpm build` ≈ 25 s.

## Ejemplos de consumo

```jsonc
// bandadau-backend/services/social-service/package.json
{
  "dependencies": {
    "@bandada/auth-ts": "file:../../../bandadau-shared/packages/auth-ts",
    "@bandada/contracts-ts": "file:../../../bandadau-shared/packages/contracts-ts",
    "@bandada/idempotency-ts": "file:../../../bandadau-shared/packages/idempotency-ts",
    "@bandada/messaging-ts": "file:../../../bandadau-shared/packages/messaging-ts",
    "@bandada/i18n": "file:../../../bandadau-shared/packages/i18n"
  },
  "devDependencies": {
    "@bandada/tsconfig": "file:../../../bandadau-shared/packages/tsconfig",
    "@bandada/eslint-config": "file:../../../bandadau-shared/packages/eslint-config"
  }
}
```

```jsonc
// bandadau-frontend/package.json  (profundidad 1)         // bandadau-admin/shell/package.json (profundidad 2)
"@bandada/ui-tokens": "file:../bandadau-shared/packages/ui-tokens"   "@bandada/ui-tokens": "file:../../bandadau-shared/packages/ui-tokens"
```

**NestJS: auth + idempotencia + mensajería**

```ts
// app.module.ts
@Module({
  imports: [
    AuthModule.forRoot({ jwksUrl: cfg.JWKS_URL, issuer: cfg.JWT_ISSUER }),          // @bandada/auth-ts/nest
    IdempotencyModule.forRoot({ service: 'social-service', client: dynamoDocClient }), // @bandada/idempotency-ts/nest
    MessagingModule.forRoot({                                                         // @bandada/messaging-ts/nest
      rabbit: { url: cfg.RABBITMQ_URL },
      queues: { 'social-service.events': { inbox: mongoInbox } },
      relay: { outbox: mongoOutbox },
    }),
  ],
  providers: [{ provide: APP_GUARD, useExisting: JwtAuthGuard }, { provide: APP_GUARD, useExisting: RolesGuard }],
})
export class AppModule {}

@Controller('posts')
export class PostsController {
  @Post() @Idempotent() @Roles('STUDENT')
  create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthPrincipal) { /* ... */ }
}

@Injectable()
export class UserRegisteredConsumer {
  @ConsumeMessage({ queue: 'social-service.events', type: 'bandada.identity.user.registered.v1' })
  async handle(event: CloudEvent<EventData<'bandada.identity.user.registered.v1'>>, ctx: MessageContext<ClientSession>) {
    /* ctx.tx = sesión Mongo de la transacción que ya incluye el inbox; encola el outbox con la misma sesión */
  }
}
```

**Web (Tailwind v4 + tokens + i18n)**

```css
/* app/globals.css */
@import "tailwindcss";
@import "@bandada/ui-tokens/css/tokens.css";
@import "@bandada/ui-tokens/css/tailwind-theme.css"; /* bg-surface, text-primary, border-default, bg-action-primary... */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

```tsx
import { themeScript } from '@bandada/ui-tokens/theme-script';   // <script dangerouslySetInnerHTML={{ __html: themeScript }} /> en <head>
import { tokens } from '@bandada/ui-tokens';                      // tokens[effective].color.bg.surface (React Native, gráficos)
import { resources, formatCredits, resolveLocale } from '@bandada/i18n';
```

```bash
# en cualquier app: paridad de textos y claves usadas
npx bandada-i18n-check src/locales --src src
```

```js
// eslint.config.mjs (Next.js)
import next from '@bandada/eslint-config/next';
export default [...next];
```

## Pruebas: qué se probó contra qué

| Pieza | Unitarias / contrato de puerto | Motor real (`pnpm test:integration`) |
|---|---|---|
| `idempotency-ts` | Hash canónico (vectores), llave, interceptor Nest sobre Express real, tienda en memoria | DynamoDB Local 3.3.1: contrato completo del puerto + forma del ítem |
| `messaging-ts` | CloudEvents, `DeliveryProcessor` (reintentos, DLQ, inbox), relay, contrato de inbox/outbox en memoria | RabbitMQ 4 (confirms, `mandatory`, reintentos y DLQ reales, `verifyTopology`, módulo Nest), MongoDB 8.0.19 replica set (inbox + outbox transaccionales), DynamoDB Local (inbox + outbox + GSI1) |
| `auth-ts` | Servidor JWKS HTTP real en proceso: rotación por `kid`, caché, cooldown, `alg` ≠ RS256, guards Nest sobre Express | — (no requiere motor) |
| `ui-tokens`, `i18n`, `contracts-ts`, `eslint-config` | Todo en proceso (Sass compila `_tokens.scss`; ESLint ejecuta las reglas; los tipos generados se comprueban con `expectTypeOf`). El tema Tailwind v4 se verificó a mano con `@tailwindcss/cli` 4.3.3 (utilidades `bg-surface`, `text-primary`, `border-default`, `bg-action-primary`, `rounded-md`, `shadow-sm`, `text-sm`) | — |

No probado contra motores reales: reconexión del broker durante una caída, `Mongo` con varios relays concurrentes
en réplicas distintas, TTL de DynamoDB/Mongo (borrado diferido), AWS DynamoDB (solo Local).
