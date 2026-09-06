# Security

Maintainer: Vardhan. A private vulnerability-reporting contact has not yet been supplied. Do not publish credentials, lesson content, private captures, or sensitive reproduction data in public issues. Before public launch, configure a private reporting channel and update this document.

## Implemented boundaries

- Better Auth owns passwordless authentication, hashed single-use tokens, session cookies, trusted redirects and session expiration. Application mutations independently verify the request origin.
- Tenant-scoped server operations and composite database foreign keys protect courses, immutable versions, findings, exports and private files. Owner permissions protect billing and destructive settings.
- Public-source fetching rejects credentials, non-HTTP(S) protocols, nonstandard ports, private/local/reserved IPv4/IPv6 addresses and mixed public/private DNS responses. Every redirect is revalidated. The actual socket uses the validated address, closing a second-DNS-lookup rebinding window. Redirect, deadline, body size and content-type limits apply.
- Uploads have byte/type/format limits, UTF-8 validation and a bounded PDF subprocess. Scanned/encrypted/unreadable PDFs fail explicitly. Saved originals are reparsed before lesson creation.
- Lesson/source strings are rendered as text. Exports escape Markdown markup and CSV formula prefixes. Comparison outputs are schema checked and must quote actual saved text at a valid location.
- Dynamic pages use per-response script nonces. Production script policy excludes unsafe inline scripts and eval. Inline styles remain permitted for UI state. Framing, MIME sniffing and unnecessary browser permissions are restricted.
- Check quota and call budgets are reserved before execution. Worker leases, checkpointing, bounded retries and cancellation protect against duplicate or late publication.
- Stripe verifies raw signed webhook bodies; durable receipts and current-state reconciliation prevent duplicate/stale entitlement grants. Success redirects never grant paid access.
- Private files are served only after current-session tenant authorization, with attachment and no-store headers. Object keys use generated IDs. No public storage ACL is created.

## Operational requirements

Use HTTPS, a fresh strong authentication secret, database TLS, private buckets, least-privilege provider keys, backup encryption, and network-level egress restrictions in production. Keep the web and worker in the same trusted environment. Do not host real accounts in `DEMO_MODE=true` or share its database/bucket with production.

All `data/`, `.env*` files except the example, local email, build notes, test reports and the build brief are ignored. The app emits sanitized correlation IDs and job identifiers; framework and reverse-proxy access logs must redact query strings on magic-link routes. Never enable provider-response logging in production. A centralized error-reporting service is not bundled; forward sanitized structured process logs to your chosen collector.

An active subscription is required for real checks, but accounts may prepare limited course content before subscribing. The sample has fixed server-side allowances. A source is creator-approved; LessonLedger cannot automatically establish that a creator owns a lesson or that a public page is authoritative.

## Verification and remaining release work

The deterministic tests exercise parsing, tenant authorization, database constraints, quota races, cancellation, worker lease recovery, scheduling, SMTP claim deduplication, Stripe signatures/event ordering, source address/redirect/DNS/socket limits, stored hostile text and CSV escaping. Browser checks include two independent sessions and accessibility scans.

These are local checks, not an independent security audit. PostgreSQL/container operation, live provider behavior, backup policy, dependency review and deployed smoke checks must pass the [launch checklist](docs/launch-checklist.md). Do not describe a successful build as proof of production security.
