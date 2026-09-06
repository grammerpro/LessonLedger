# Deployment, backup and rollback

## Target

Use a Docker-capable host for a web process and a separate long-lived worker, managed PostgreSQL, a private S3-compatible bucket, SMTP, Stripe and the configured comparison provider. A serverless web deployment by itself does not run the durable worker. No public target or hosting cost arrangement has been authorized.

The multi-stage Dockerfile installs from the pnpm lockfile, builds Next.js, and runs as the non-root `node` user. The image retains runtime TypeScript tooling for the worker and migration scripts. Database state and originals are external in live mode. `compose.production.yaml` binds the web port to loopback for an HTTPS reverse proxy.

## Release procedure

1. Complete the release gates in `launch-checklist.md` and verify the chosen container image tags on the build host. Pin image digests in the approved deployment environment.
2. Create a private `.env.production` with `DEMO_MODE=false`, HTTPS `APP_URL`, a fresh authentication secret, PostgreSQL, bucket, email, Stripe and comparison configuration. No values are baked into the image.
3. Create a database backup. Build the image: `docker compose -f compose.production.yaml build`.
4. Run the migration service before starting traffic. Better Auth schema migration is performed from its installed package version; review generated schema changes when upgrading that dependency.
5. Start with `docker compose -f compose.production.yaml up -d`. The web and worker depend on successful migration completion.
6. Configure TLS termination, private service networking and outbound source-fetch policy. Do not expose PostgreSQL, storage administration, or local email ports.
7. Verify `/api/health/live`, `/api/health/ready`, and worker heartbeat health. Sign in, create a disposable course, import a lesson, check a small approved source, review/export, and verify test-mode billing before enabling customer traffic.

Run `pnpm worker` independently when managing processes without Compose. The worker finishes its current bounded work on SIGTERM; if the host kills it first, its lease expires and another worker can resume completed-item checkpoints. Give the worker sufficient shutdown grace. A heartbeat is written each tick; very long work requires heartbeat renewal within the 180-second health window.

## Diagnostics and incidents

Check history exposes each run’s status, coverage, warnings, attempt count and cancellation. `/api/diagnostics` requires an owner session and returns only that workspace’s jobs and digest delivery states. Liveness/readiness responses disclose no secrets.

- **Worker stopped:** restart it against the same database; queued work persists.
- **Repeated check failure:** inspect approved source accessibility and provider configuration. Failed runs remain visible; starting a new check reserves a new unit.
- **Ambiguous email:** inspect `sending`/`uncertain` delivery keys against SMTP logs. Do not blindly resend. The app chooses duplicate avoidance over guaranteed delivery after ambiguity.
- **Provider outage:** disable schedules or cancel pending runs; no fallback to fictional results occurs.
- **Deletion pending:** keep the worker running. A storage deletion error leaves the workspace marked for deletion so cleanup can retry.

## Backups and restore exercises

For the local sample, `pnpm backup:verify` uses SQLite’s online backup API, opens the result independently, runs `integrity_check`, and compares six entity counts. Backups are private under ignored `data/backups/`. This does not validate managed PostgreSQL or S3 recovery.

For PostgreSQL, use a disposable restore database and an encrypted backup destination:

```sh
pg_dump "$DATABASE_URL" --format=custom --file=ledger-backup.dump
createdb "$RESTORE_DATABASE_URL"
pg_restore --dbname="$RESTORE_DATABASE_URL" --exit-on-error ledger-backup.dump
psql "$RESTORE_DATABASE_URL" -c 'SELECT count(*) FROM workspaces;'
```

The `RESTORE_DATABASE_URL` must name a new disposable database and an appropriate operator role. Verify schema versions, entity counts, foreign-key checks, sample sign-in, worker recovery and a real restored object reference. Never run test cleanup against a production database. The CI PostgreSQL job defines a disposable database dump/restore check; its status is pending until CI runs.

Back up/version S3 objects separately and test restoration with database references. An actual production retention period, RPO and RTO have not been selected; the owner must choose, implement and disclose them. Do not claim deleted data disappears from backups immediately. After a restore, reapply deletion requests and reconcile external subscription state before traffic resumes.

## Rollback

Keep the previous tested image and pre-migration backup. Prefer additive, backward-compatible migrations. If a release fails, stop traffic and the worker, inspect migration compatibility, and restore the previous image only if it can read the current schema. Otherwise restore into a new database/bucket namespace, verify it, reconcile deletions/subscriptions, and then switch traffic. Do not automatically run destructive `down` migrations against customer data.

## Environment-specific verification status

This workstation has no Docker runtime or PostgreSQL service. The artifacts are supplied, but container execution, PostgreSQL migrations/worker behavior, managed backup restore and deployed smoke tests have not been claimed as verified. Run those gates on the authorized target before release.
