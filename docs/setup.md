# Setup and configuration

## Zero-service local sample

Node 22/24 LTS and pnpm 10.30.3 are required. Development defaults to an isolated sample environment when `DEMO_MODE` is not set. Do not import customer material into this environment.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The command applies the two application migrations and the Better Auth schema, then starts Next.js on `127.0.0.1:3000` and a separate worker process. Visit **http://localhost:3000** to match the default trusted origin. Stop with Ctrl+C. Original files, the SQLite WAL database, local auth secret, and development email live under ignored `data/`.

Fresh sample sessions seed their own fictional course on demand. `pnpm db:seed` prepares the database; it does not expose a shared administrator or prepopulate real accounts. Sample resets create a new session; old samples expire and the worker removes them after 24 hours.

For production-mode sample verification in PowerShell:

```powershell
pnpm build
$env:DEMO_MODE = 'true'
$env:NODE_ENV = 'production'
pnpm exec tsx scripts/dev.ts --production
```

This is a **sample-only environment**, not a deployment for real accounts. A real environment must explicitly set `DEMO_MODE=false`, use its own database/storage, and configure a private authentication secret.

## Live local services

`docker compose up -d` starts PostgreSQL, MinIO private storage, bucket initialization, and Mailpit. Compose binds services to loopback. The supplied development passwords must never be used on a public host.

Copy `.env.example` to `.env` and configure:

| Variable                                                        | Purpose                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DEMO_MODE=false`                                               | Disable sample sessions and fictional comparison adapter                                                              |
| `APP_URL`                                                       | Exact trusted public origin; HTTPS required in production                                                             |
| `BETTER_AUTH_SECRET`                                            | At least 32 unpredictable characters; e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATABASE_URL`                                                  | Local Compose: `postgres://lessonledger:local-development-only@localhost:5432/lessonledger`                           |
| `SMTP_HOST`, `SMTP_PORT`                                        | Local Mailpit: `localhost`, `1025`; production: your SMTP provider                                                    |
| `SMTP_USER`, `SMTP_PASSWORD`                                    | Provider credentials when authentication is required                                                                  |
| `EMAIL_FROM`                                                    | A verified production sender, or harmless local sender                                                                |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`                         | Local endpoint `http://localhost:9000`, region `us-east-1`, bucket `lessonledger`                                     |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`                                | Local values from Compose; production least-privilege object credentials                                              |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                                | A configured account key and an explicitly selected model supporting Responses structured outputs                     |
| `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION` | Current verified prices for that exact model; required for conservative per-check cost reservation                    |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                    | Test-mode keys during integration verification                                                                        |
| `STRIPE_STARTER_PRICE_ID`, `STRIPE_STUDIO_PRICE_ID`             | Recurring monthly price IDs created in your Stripe account                                                            |
| `LEGAL_BUSINESS_NAME`, `PRIVACY_CONTACT`                        | Owner details needed to finalize the privacy draft before launch                                                      |

Use server-side environment variables, never `NEXT_PUBLIC_` for credentials. The web and worker must share configuration. Migrations run with `pnpm db:migrate`; start `pnpm dev:web` and `pnpm worker` in separate terminals when using external services. Restart both after configuration changes.

## Stripe

Create Starter and Studio monthly recurring prices, configure the customer portal for cancellation and supported plan switching, and register `/api/billing/webhook` for `customer.subscription.created`, `.updated`, and `.deleted`. Forward test events with the Stripe CLI if testing locally. Verify the raw request body signature before processing.

Checkout writes a Stripe customer mapping before redirecting. Open sessions are reused under a workspace lock; changing plans expires the previous session. Current Stripe subscription state routes already-subscribed customers to the portal even before a webhook arrives. Cancel renewal before deleting a paid workspace; pending checkout is expired during deletion. Paid access comes only from reconciled subscription state. The webhook retrieves the current subscription, checks the configured price, deduplicates the event, and ignores older event timestamps. Active or trialing subscriptions require an unexpired period; past-due, unpaid, canceled, and unknown-price states do not grant access. Cancel-at-period-end remains active until the period ends. No trial is offered by the initial Checkout configuration.

## Comparison budget and source coverage

Use [official model documentation](https://developers.openai.com/api/docs/models) to choose a supported model and verify prices against [official pricing](https://developers.openai.com/api/docs/pricing). No model identifier is guessed or hardcoded. Run a capped live evaluation before selecting the production model.

Each check reserves usage in a database transaction. One accepted run consumes one monthly unit, including canceled or failed runs; retries do not consume another. The reset is the first day of the next UTC calendar month. A check attempts at most 20 calls and reserves at most $2 using a conservative UTF-8 byte-to-token bound plus prompt overhead and the full output allowance. Prices must reflect the selected model; incorrect operator prices invalidate a dollar estimate. Configure a provider-side spending limit as a second boundary.

The engine takes bounded lesson segments and source excerpts; it reports truncation or insufficient evidence as incomplete coverage. This v1 does not claim comprehensive semantic retrieval across an entire documentation site. Sources are capped at eight per course. URL validation and every redirect use public-only DNS validation with a pinned socket address. Browser-required, compressed-only, blocked, oversized, or unsupported responses remain visible as unavailable. Manual captures require creator approval and retain provenance.

## Missing services

- Unconfigured comparisons show “Checks are not configured” and reject enqueue attempts. Configure the key, model, and token prices.
- Unconfigured billing is disabled and never reports a fake payment success.
- Real accounts start empty and require server-verified paid access to check. Demo entitlement only applies to a sample record in a sample environment.
- A stopped worker leaves jobs durable in the database. Restart it to resume. Failed runs and warnings appear in Check history.

## Local verification and live checks

`pnpm test` uses a separate SQLite test database unless `TEST_DATABASE_URL` points to a disposable PostgreSQL test database. **The service suite clears test workspace records. Never point it at customer data.**

`pnpm test:e2e` starts a production-mode sample web/worker against `data/e2e.sqlite` when no server is running. Stop an existing development server to verify the production build specifically. The browser suite writes local sign-in emails and fixture records.

`RUN_LIVE_INTEGRATIONS=true pnpm test:live` opts into one public source fetch and one comparison call. Configure credentials and prices first. Stripe validation uses test keys only. This read-only smoke does not replace an interactive Checkout/portal/webhook lifecycle, real email delivery, or the human-reviewed evaluation required by the launch checklist.
