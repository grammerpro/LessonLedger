# Launch checklist

This is a release gate, not a claim that the software has been deployed.

## Local implementation and verification

- [x] Working web interface and isolated fictional sample
- [x] Database migrations and immutable lesson/source evidence
- [x] Passwordless sign-in exercised through the actual authentication library and local inbox
- [x] Import, source creation, durable check, review, draft, export and persistence browser path
- [x] Tenant isolation, owner restrictions, quotas, cancellation, worker lease recovery and billing fixtures
- [x] Actual application screenshots; responsive and automated accessibility checks at three widths
- [x] Production compilation and strict type checking
- [x] Local SQLite backup restored with integrity and entity-count checks
- [x] Clean lockfile install and complete local verification; see verification report
- [ ] PostgreSQL-specific suite and container startup on a Docker-capable host

## Live providers and quality

- [ ] Configure the comparison key, exact model and verified token prices; run a capped live comparison
- [ ] Complete the human-labeled evaluation and meet the predeclared precision/recall targets
- [ ] Verify SMTP delivery and uncertain-delivery reconciliation using the actual provider
- [ ] Verify S3 privacy, original upload/download, retention and deletion
- [ ] Complete Stripe test-mode Checkout, portal, webhook duplication/delay, cancellation and entitlement lifecycle
- [ ] Configure provider-side spending and delivery limits

## Production operations

- [ ] Authorize a hosting target, region and cost arrangement
- [ ] Validate production environment, HTTPS, secrets, private services and egress controls
- [ ] Apply migrations after a reviewed backup
- [ ] Exercise PostgreSQL and object restore in a disposable environment
- [ ] Select and disclose backup retention, recovery objectives and deletion handling after restore
- [ ] Configure structured log collection, access-log token redaction and alerting
- [ ] Review dependencies and outstanding findings; resolve critical/high release risks
- [ ] Perform deployed sign-in/check/review/export/billing smoke tests

## Owner and publication details

- [ ] Supply the legal business name, privacy contact, hosting/email processor names and final privacy policy
- [ ] Choose licensing terms; rights currently remain with Vardhan
- [ ] Supply the authorized GitHub repository URL, or account/name/visibility for a new repository
- [x] Review tracked files and staged diff for secrets and private content
- [ ] Push the tested feature branch; record its full commit SHA
- [ ] Inspect the actual CI result after push

Unavailable credentials do not prevent the local sample from working. They do prevent calling live integrations or production operation verified.
