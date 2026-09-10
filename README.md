# Ben Ami Shop

Production-oriented foundation for the Ben Ami Shop fashion and footwear storefront.

## Local development

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Database

Prisma is configured exclusively for Neon PostgreSQL. Copy `.env.example` to `.env.local` after provisioning a Neon database, then provide:

- `DATABASE_URL` — pooled connection for application traffic
- `DIRECT_URL` — direct connection for migrations
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` — initial seed administrator

Never commit credentials. Apply the schema and seed only against an intended Neon branch:

```bash
npm run prisma:migrate
npm run prisma:seed
```

For production and preview environments, apply committed migrations with `npm run prisma:migrate:deploy`.

## Routes

- `/` — storefront introduction
- `/shop` — catalogue public
- `/admin` — administration authentifiée

The administration area includes product, category, brand, stock, homepage
content, and store-setting management.
