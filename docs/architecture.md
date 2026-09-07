# Architecture and data flow

LessonLedger uses one pnpm package with separate Next.js web and long-lived worker entrypoints. TypeScript is strict; Knex owns migration-based relational persistence. The application uses custom token-based CSS and original SVG artwork. Fonts are bundled locally under their upstream licenses.

## Environments

- **Local/sample:** SQLite WAL, private local files, local email JSON, deterministic fictional comparison rules. Each sample cookie maps through a hash to one 24-hour workspace session. No shared demo login is exposed.
- **Live:** PostgreSQL, Better Auth magic-link sessions, private S3-compatible object storage, SMTP, Stripe, and a configured OpenAI Responses model. Real accounts never silently fall back to fictional comparisons.

SQLite is a deliberate convenience for a reproducible sample, not the multi-host production database. Production web and worker share PostgreSQL; queue state lives in application tables rather than a second Redis service.

Local authentication uses the library's Kysely adapter with `BEGIN IMMEDIATE` transactions and bounded asynchronous lock acquisition. Reserving the writer before reading a token prevents the worker from invalidating the transaction's WAL snapshot. Atomic token consumption and rollback remain enabled. This follows [SQLite's documented transaction isolation behavior](https://www.sqlite.org/isolation.html).

## Tenant boundary

Every business record carries `workspace_id`. Membership comes from the authenticated user, or from an opaque sample token in sample mode. Client workspace IDs are never accepted as authorization. Owners manage billing, monitoring, preferences and deletion; editors manage course/review content. No invitation UI is shipped.

`tenantRow` scopes direct lookups, and composite foreign keys pair dependent entity IDs with workspace IDs. Workspace-row writes serialize quota reservations, initial resource limits, review edits, cancellation, scheduling, and result publication. On PostgreSQL this uses a row lock; SQLite serializes writers. Blob access is streamed through an authenticated tenant-checked API instead of exposing signed storage URLs. This strengthens revocation but adds web-server bandwidth.

## Records and evidence

Tables include users/sessions/accounts/verifications from Better Auth and application workspaces, memberships, courses, lessons, immutable lesson versions, sources, immutable captures, check runs/items, findings/events, exports, subscriptions, usage entries, email deliveries, webhook receipts, private blobs, schedules, and worker heartbeats.

Relational keys, ownership, status and queue columns are indexed. Evolving content is stored in validated JSON payloads. This keeps one migration layer portable between demo SQLite and live PostgreSQL. Public input is validated with Zod; tenant-critical keys are relational columns rather than untrusted JSON.

An imported original is retained privately. The server validates bytes and reparses that original when the creator accepts the preview. TXT/Markdown retain line starts, subtitle formats retain cue times, and PDF text layers retain page numbers. PDF parsing runs in a separate process with a heap cap, output cap and hard timeout; no uploaded input is executed.

Findings reference the exact lesson version, source snapshot, and check. Their fingerprints include stable lesson/source IDs, location, original quote and material evidence quote. Capture time and rewritten explanations do not change a fingerprint. Dismissed unchanged evidence stays suppressed. Material quote changes create a separate open finding so the dismissed record and its history remain intact. Reopening is explicit.

## Durable checks

1. Reserve one monthly check unit and create the queued run atomically. Save the current lesson version IDs and approved source IDs.
2. A worker claims a run with a unique lease token and bounded expiration. Heartbeats renew the lease; a restart can reclaim an expired lease.
3. Fetch source content through the public-network policy. Save immutable snapshots, including capture time, normalized content hash, conditional-fetch metadata and provenance.
4. Compare bounded input excerpts. Reserve each call and its conservative cost before contacting the provider. No tools are exposed to the comparison component; source/lesson text can return data only.
5. Validate the output schema and exact quotations. Retain uncertain, truncated, unreachable and budget-limited coverage as inconclusive.
6. In a workspace-locked transaction, verify ownership of the current lease, insert new findings and a completed check item, and checkpoint progress. Retries skip completed items and keep the same usage reservation.
7. Complete the run and enqueue one digest per owner if new findings were added and notifications are enabled.

There is at most one queued/running/retrying check per workspace. Jobs retry at most three times, with increasing delay. Check history exposes progress, warnings, errors, cancellation, and a new-run action for failed work. Cancellation and publication serialize on the workspace lock; a lost lease cannot publish new findings. An interrupted provider call may still incur a provider charge; late results are discarded.

## Reviews, schedules and email

Open findings can be confirmed or dismissed; confirmed findings can be resolved or reopened, and dismissed/resolved findings can be explicitly reopened. Applying a confirmed draft creates a new immutable lesson version and reserves a recheck in the same transaction. It does not resolve the finding. Stale-version edits return a conflict.

Monitoring persists an elapsed 7-day or 30-day interval, IANA display timezone, and next run. It does not promise a wall-clock time across daylight-saving changes. Quota or configuration failures defer the next attempt for an hour and display the reason. Monthly and manual work share the same reservation rules.

Email claims are atomic and delivery keys unique. SMTP does not provide transactional exactly-once delivery. The application therefore does not automatically retry `sending` or `uncertain` deliveries: operators reconcile those states with provider logs to avoid duplicate digests. This is an explicit reliability tradeoff.

## Known boundaries

The current comparison retrieves bounded prefixes, not a full semantic index of a product’s documentation. Quotes can be mechanically verified while the underlying reasoning is wrong. Broad source pages and conflicting/historical-version material require human evaluation. The sample rules demonstrate known fictional changes; they do not measure live model accuracy.

Only files and exports expire by the selected retention policy. Historical normalized content remains until workspace deletion so review evidence is not silently orphaned. Workspace deletion stops jobs and schedules, then the worker deletes private blobs and cascades relational records. Failed storage deletion leaves the deletion marker for a later cleanup attempt. Backup retention is operator-defined and must be disclosed before launch.
