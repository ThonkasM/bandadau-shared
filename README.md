# bandadau-shared — librerías `@bandada/*`

Librerías TypeScript compartidas en `packages/` (pnpm workspace propio; solo para servicios NestJS y apps
JS/TS). Los demás repos las consumen como dependencia local hermana: `file:../bandadau-shared/packages/<pkg>`
(ajustando la profundidad).

| Paquete | Propósito |
|---|---|
| `@bandada/contracts-ts` | Tipos generados de OpenAPI, AsyncAPI y GraphQL (`pnpm contracts:gen`) |
| `@bandada/messaging-ts` | CloudEvents, RabbitMQ, outbox e inbox |
| `@bandada/idempotency-ts` | Interceptor `Idempotency-Key` sobre DynamoDB |
| `@bandada/auth-ts` | JWT por JWKS, guards y token de servicio |
| `@bandada/ui-tokens` | Tokens de diseño DTCG (claro/oscuro) → CSS, Tailwind v4, SCSS, TS |
| `@bandada/i18n` | Mensajes comunes `es`/`en` (ICU), enums, errores por código y formateo |
| `@bandada/eslint-config`, `@bandada/tsconfig` | Configuración base |

```bash
pnpm -r --filter "./packages/**" build
```

Reglas y orden de dependencias: **[`AGENTS.md`](AGENTS.md)**.
