import Link from 'next/link';
import { Brand } from '@/components/brand';
export default function Privacy() {
  return (
    <div className="document-page">
      <Brand />
      <main id="main">
        <div className="eyebrow">PRIVACY POLICY DRAFT</div>
        <h1>Your lessons are your work.</h1>
        <p>
          This draft describes the implemented data flow. Public launch requires the owner’s legal
          business name, contact address, hosting region, and finalized processor agreements.
        </p>
        <h2>What is stored</h2>
        <p>
          Your account email, workspace and course details, imported text, lesson versions, approved
          source captures, findings and review history, usage records, and subscription identifiers.
          Payment card details are handled by Stripe and are not stored by LessonLedger.
        </p>
        <h2>How information is processed</h2>
        <p>
          Live comparisons send selected lesson text and reference excerpts to OpenAI. Email uses
          the operator’s configured SMTP provider. PostgreSQL and private S3-compatible storage hold
          application data. Stripe handles subscriptions. The host and email provider must be named
          before launch. Comparison requests disable API response storage; provider abuse-monitoring
          and contractual retention may still apply.
        </p>
        <h2>Your controls and retention</h2>
        <p>
          Workspace owners can export their data and request deletion in Settings. Deletion stops
          pending checks and the worker removes workspace records and stored files. Original and
          derived files expire after your selected 30, 90, or 365 day retention period. Normalized
          lesson versions and historical evidence remain until workspace deletion to preserve review
          history. The local sample expires after 24 hours. Backup retention depends on the
          operator’s finalized backup policy and must be disclosed before launch.
        </p>
        <h2>Cookies and notifications</h2>
        <p>
          Essential cookies maintain authenticated sessions, selected workspaces, and isolated
          sample sessions. A browser preference stores your chosen theme. No advertising analytics
          are installed. You can disable finding digests in Settings.
        </p>
        <h2>Contact</h2>
        <p>
          The maintainer is Vardhan. A privacy contact has not been supplied; live customer
          onboarding is a launch blocker until this draft is finalized.
        </p>
        <Link className="inline-link" href="/">
          Return to LessonLedger
        </Link>
      </main>
    </div>
  );
}
