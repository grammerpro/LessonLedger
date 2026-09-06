import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, BookOpen, ScanLine, FileCheck2, ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/brand';
import { DemoButton } from '@/components/demo-button';
import { config } from '@/server/config';
export const dynamic = 'force-dynamic';
export default function Home() {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <Brand />
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login">Sign in</Link>
        </div>
        <Link className="button primary small" href="/login">
          Start reviewing <ArrowUpRight size={15} />
        </Link>
      </nav>
      <main id="main">
        <section className="hero">
          <div className="eyebrow">
            <span className="status-dot" /> A little upkeep. A lot of confidence.
          </div>
          <h1>
            Your software changes.
            <br />
            Your lessons should
            <br />
            <em>keep up.</em>
          </h1>
          <p>
            You put care into your course. Keep it that way.
            <br className="desktop-break" /> Catch changing instructions, see the evidence, and give
            <br className="desktop-break" /> every lesson a thoughtful update.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="button primary">
              Start reviewing <ArrowRight size={17} />
            </Link>
            {config.demo && <DemoButton className="button text-button" />}
          </div>
          <div className="hero-note">Your expertise. A clearer place to start.</div>
          <div className="hero-margin-note">
            <span>
              THE COURSE
              <br />
              IS ONLY THE
              <br />
              BEGINNING.
            </span>
            <svg width="80" height="65" viewBox="0 0 80 65" fill="none" aria-hidden="true">
              <path
                d="M5 3C65 0 75 20 52 56m0 0 0-17m0 17 17-6"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </div>
        </section>
        <section className="product-frame" aria-label="Actual sample workspace screenshot">
          <div className="frame-top">
            <span>
              <i />
              <i />
              <i />
            </span>
            <span>LESSONLEDGER / YOUR WORKSPACE</span>
            <span className="frame-live">A clearer view of what needs care</span>
          </div>
          <Image
            src="/images/dashboard.png"
            alt="Actual LessonLedger sample workspace showing three findings to review, six lessons, and source coverage."
            width={1440}
            height={1050}
            priority
            unoptimized
          />
          <div className="screenshot-caption">
            <span>MEET YOUR COURSE’S NEW HOME</span>
            <p>Everything that needs your attention. Nothing that doesn’t.</p>
          </div>
        </section>
        <section id="how-it-works" className="section steps-section">
          <div className="section-heading">
            <div className="eyebrow">A SMALL ROUTINE. A LASTING DIFFERENCE.</div>
            <h2>
              From “is this still right?”
              <br />
              to your next clear step.
            </h2>
          </div>
          <div className="steps">
            {[
              {
                n: '01',
                icon: BookOpen,
                title: 'Bring your lessons',
                text: 'Paste your text or import lesson notes and subtitles. Every excerpt keeps its place in the original.',
              },
              {
                n: '02',
                icon: ScanLine,
                title: 'Connect the source',
                text: 'Choose the official documentation and release notes that matter to your course. Run a check when you’re ready.',
              },
              {
                n: '03',
                icon: FileCheck2,
                title: 'Review with context',
                text: 'Compare the lesson with captured evidence. Refine the update, approve it, and export your worklist.',
              },
            ].map((s) => (
              <article key={s.n}>
                <div className="step-top">
                  <s.icon size={25} strokeWidth={1.4} />
                  <span>{s.n}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="evidence-feature section">
          <div>
            <div className="eyebrow">CONTEXT BEFORE CONFIDENCE</div>
            <h2>
              Less second-guessing.
              <br />
              <em>More evidence.</em>
            </h2>
            <p>
              A flagged lesson is the start of a review, not a verdict. See exactly what changed,
              where it appears, and why it might matter.
            </p>
            <ul className="check-list">
              <li>
                <Check size={17} /> Exact excerpts, side by side
              </li>
              <li>
                <Check size={17} /> Saved sources and capture dates
              </li>
              <li>
                <Check size={17} /> Update drafts you can make your own
              </li>
            </ul>
            <Link href="/app/review" className="inline-link">
              Take a closer look <ArrowRight size={16} />
            </Link>
          </div>
          <div className="feature-capture">
            <Image
              src="/images/review.png"
              alt="Actual sample finding with lesson excerpt, fictional reference evidence, and editable replacement."
              width={1440}
              height={1050}
              unoptimized
            />
            <span>FICTIONAL SAMPLE · REAL REVIEW WORKFLOW</span>
          </div>
        </section>
        <section id="pricing" className="section pricing-section">
          <div className="section-heading centered">
            <div className="eyebrow">ROOM TO KEEP GROWING</div>
            <h2>A little care, built into your business.</h2>
            <p>Experimental monthly pricing. Clear limits, no unlimited promises.</p>
          </div>
          <div className="pricing-grid">
            {[
              {
                name: 'Starter',
                price: 49,
                note: 'For a focused course collection.',
                features: [
                  '3 courses · 100 lessons',
                  '4 checks per calendar month',
                  'Evidence review and editable drafts',
                  'Markdown, CSV, and PDF exports',
                ],
              },
              {
                name: 'Studio',
                price: 129,
                note: 'For creators with more to care for.',
                features: [
                  '10 courses · 500 lessons',
                  '16 checks per calendar month',
                  'Weekly monitoring per course',
                  'Everything in Starter',
                ],
              },
            ].map((p) => (
              <article className="price-card" key={p.name}>
                <div className="eyebrow">{p.name}</div>
                <p>{p.note}</p>
                <div className="price">
                  ${p.price}
                  <span>/ month</span>
                </div>
                <Link
                  href="/login"
                  className={`button ${p.name === 'Studio' ? 'primary' : 'secondary'}`}
                >
                  Start with {p.name} <ArrowUpRight size={16} />
                </Link>
                <ul className="check-list">
                  {p.features.map((f) => (
                    <li key={f}>
                      <Check size={15} />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="pricing-footnote">
            Manual and scheduled checks share your monthly allowance. Each check covers up to 25
            lessons and 8 sources.
            <br />
            Up to 20 comparison calls per check. Longer or inconclusive content is clearly marked.
          </p>
        </section>
        <section className="section faq">
          <div>
            <div className="eyebrow">A FEW GOOD QUESTIONS</div>
            <h2>Before you begin.</h2>
          </div>
          <div>
            {[
              {
                q: 'Does a check guarantee my course is up to date?',
                a: 'No. Checks identify potential changes within the lessons and source excerpts covered. You remain the reviewer. Unreachable references, incomplete coverage, and uncertain results remain visible.',
              },
              {
                q: 'What can I import?',
                a: 'Pasted text, UTF-8 TXT and Markdown, SRT and VTT subtitles, and text-based PDFs up to 5 MB and 80 pages. Subtitle timestamps and PDF page numbers are preserved. Video transcription and OCR are not included.',
              },
              {
                q: 'Will LessonLedger change my course automatically?',
                a: 'No. You review every finding and edit the proposed replacement. Applying a confirmed draft creates a new lesson version and queues a recheck. You can also export approved changes for your publishing workflow.',
              },
              {
                q: 'Can I try the review workflow first?',
                a: 'The sample workspace contains an original fictional course and clearly labeled fictional sources. It is disposable and isolated to your browser session, and requires no payment.',
              },
            ].map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <span>+</span>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing">
          <div className="eyebrow">GOOD LESSONS DESERVE TO LAST.</div>
          <h2>Keep the care in your course.</h2>
          <Link href="/login" className="button primary">
            Start reviewing <ArrowRight size={16} />
          </Link>
        </section>
      </main>
      <footer className="marketing-footer">
        <Brand />
        <span>© {new Date().getFullYear()} Vardhan</span>
        <Link href="/privacy">Privacy</Link>
        <span>Keep every lesson current.</span>
      </footer>
    </div>
  );
}
