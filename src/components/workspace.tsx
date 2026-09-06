'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  LayoutDashboard,
  ListChecks,
  Link2,
  History,
  Settings2,
  Search,
  Sun,
  Moon,
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  FileText,
  Check,
  X,
  Menu,
  Play,
  Download,
  ExternalLink,
  Clock3,
  CircleHelp,
  LogOut,
  LoaderCircle,
  CheckCircle2,
  AlertTriangle,
  PanelLeftClose,
  Sprout,
  ShieldCheck,
  CalendarDays,
} from 'lucide-react';
import { Brand } from './brand';
import type { WorkspaceData, Finding, Course, Segment } from '@/shared/types';

async function api(path: string, body?: unknown, method = 'POST') {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete this action.');
  return data;
}
const nav = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard },
  { href: '/app/courses', label: 'Courses', icon: BookOpen },
  { href: '/app/review', label: 'Review queue', icon: ListChecks },
  { href: '/app/sources', label: 'Sources', icon: Link2 },
  { href: '/app/history', label: 'Check history', icon: History },
  { href: '/app/settings', label: 'Settings', icon: Settings2 },
];
const date = (value: string, utc = false) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: utc ? 'UTC' : undefined,
  });
const time = (value: string) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={`badge ${tone}`}>
      <span />
      {children}
    </span>
  );
}
function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={27} strokeWidth={1.3} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-header">
        <div>
          <div className="eyebrow">LESSONLEDGER</div>
          <h2>{title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Workspace() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<
    'course' | 'import' | 'source' | 'export' | 'help' | 'delete' | null
  >(null);
  const [courseId, setCourseId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const refresh = useCallback(async () => {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (response.status === 401) {
      router.replace('/login');
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
  }, [router]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    const preference = localStorage.getItem('ll-theme');
    setDark(preference === 'dark');
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        const input = document.querySelector<HTMLInputElement>('.global-search input');
        if (input?.offsetParent) {
          event.preventDefault();
          input.focus();
        }
      }
      if (event.key === 'Escape') setMobile(false);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [dark]);
  useEffect(() => {
    if (!data?.checks.some((c) => ['running', 'queued', 'retrying'].includes(c.status))) return;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [data, refresh]);
  useEffect(() => {
    setMobile(false);
    setLessonId('');
  }, [pathname]);
  const mutate = async (path: string, body?: unknown, method = 'POST', message = 'Saved.') => {
    setBusy(true);
    setError('');
    try {
      const result = await api(path, body, method);
      await refresh();
      setNotice(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const perform = (task: () => Promise<unknown>) => {
    void task().catch(() => {});
  };
  if (!data)
    return (
      <div className="app-loading">
        <Brand />
        <main id="main">
          {error ? (
            <>
              <h1>Unable to open your workspace</h1>
              <p role="alert">{error}</p>
              <button
                className="button primary"
                onClick={() => {
                  setError('');
                  refresh().catch((e) => setError(e.message));
                }}
              >
                Try again
              </button>
              <Link href="/login">Sign in</Link>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" />
              <p>Opening your workspace…</p>
            </>
          )}
        </main>
      </div>
    );
  const section = pathname.split('/')[2] || 'overview';
  const selectedId = pathname.split('/')[3];
  const currentCourse = data.courses.find((c) => c.id === selectedId);
  const openFindings = data.findings.filter((f) => f.status === 'open');
  const selectedFinding = data.findings.find((f) => f.id === selectedId);
  const currentPage = nav.find((n) => n.href === `/app/${section}`)?.label || 'Overview';
  const addImport = (course?: string) => {
    setCourseId(course || data.courses[0]?.id || '');
    setModal('import');
  };
  const addSource = (course?: string) => {
    setCourseId(course || data.courses[0]?.id || '');
    setModal('source');
  };
  const run = (id: string) =>
    perform(() =>
      mutate(
        'checks',
        { courseId: id },
        'POST',
        'Check queued. You can leave this page; the worker will continue.',
      ),
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <PanelLeftClose size={20} />
          </button>
        </div>
        <div className="workspace-picker">
          <span className="workspace-avatar">{data.workspace.name[0].toUpperCase()}</span>
          <div>
            <label htmlFor="workspace-select">WORKSPACE</label>
            <select
              id="workspace-select"
              value={data.workspace.id}
              onChange={(e) =>
                perform(async () => {
                  await api('workspace/select', { id: e.target.value });
                  await refresh();
                })
              }
            >
              {data.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="sidebar-label">YOUR STUDIO</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${item.href === '/app' ? (section === 'overview' ? 'active' : '') : pathname.startsWith(item.href) ? 'active' : ''}`}
              aria-current={
                (item.href === '/app' ? section === 'overview' : pathname.startsWith(item.href))
                  ? 'page'
                  : undefined
              }
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.label === 'Review queue' && openFindings.length > 0 && (
                <span className="nav-count">{openFindings.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={22} strokeWidth={1.3} />
            <p>
              A little upkeep.
              <br />A lasting impression.
            </p>
            <button className="inline-link" onClick={() => setModal('help')}>
              Make yourself at home <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setModal('help')}>
            <CircleHelp size={18} />
            Help & guidance
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-credit">Made with care. Maintained by Vardhan.</div>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="app-body">
        <header className="app-header">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Your workspace</span>
            <ChevronRight size={13} />
            <strong>
              {currentCourse
                ? currentCourse.title
                : selectedFinding
                  ? 'Review finding'
                  : currentPage}
            </strong>
          </div>
          <div className="header-tools">
            <label className="global-search">
              <Search size={15} />
              <input
                placeholder="Find a lesson…"
                aria-label="Search courses and findings"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <button
              className="icon-button"
              onClick={() => {
                setDark(!dark);
                localStorage.setItem('ll-theme', !dark ? 'dark' : 'light');
              }}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <details className="account-menu">
              <summary aria-label="Account menu">
                <span className="avatar">{data.user.name[0]?.toUpperCase() || 'A'}</span>
              </summary>
              <div>
                <strong>{data.user.name}</strong>
                <small>{data.workspace.demo ? 'Sample workspace' : data.user.email}</small>
                <Link href="/app/settings">Workspace settings</Link>
                <button
                  onClick={() =>
                    perform(async () => {
                      await api('logout');
                      await fetch('/api/auth/sign-out', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{}',
                      });
                      router.push('/');
                    })
                  }
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </details>
          </div>
        </header>
        {data.workspace.demo && (
          <div className="sample-banner">
            <span>
              <span className="status-dot" />
              <strong>Sample workspace</strong>
              <span className="sample-description">A fictional course. Real room to explore.</span>
            </span>
            <button
              onClick={() =>
                perform(async () => {
                  await api('demo');
                  await refresh();
                  router.push('/app');
                })
              }
            >
              Reset sample <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        <main id="main" className={`workspace-main ${selectedFinding ? 'review-main' : ''}`}>
          {error && (
            <div className="notice error" role="alert">
              <AlertTriangle size={19} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {section === 'overview' && (
            <Overview
              data={data}
              search={search}
              onImport={() => addImport()}
              onCourse={() => setModal('course')}
              run={run}
            />
          )}
          {section === 'courses' && !selectedId && (
            <>
              <PageHeading
                eyebrow="YOUR KNOWLEDGE, WELL KEPT"
                title="A home for your courses."
                description="Keep the work you’re proud of current."
                action={
                  <button className="button primary" onClick={() => setModal('course')}>
                    <Plus size={17} />
                    New course
                  </button>
                }
              />
              <div className="course-grid">
                {data.courses
                  .filter((c) =>
                    `${c.title} ${c.product}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((c) => (
                    <CourseCard key={c.id} course={c} data={data} />
                  ))}
              </div>
              {!data.courses.length && (
                <Empty
                  title="Your next chapter starts here."
                  text="Add your first course, then bring in a lesson and its reference sources."
                >
                  <button className="button primary" onClick={() => setModal('course')}>
                    Create a course <Plus size={15} />
                  </button>
                </Empty>
              )}
            </>
          )}
          {section === 'courses' &&
            selectedId &&
            (currentCourse ? (
              <>
                <Link className="back-link" href="/app/courses">
                  <ArrowLeft size={15} />
                  All courses
                </Link>
                <PageHeading
                  eyebrow={`${currentCourse.product.toUpperCase()} · COURSE WORKSPACE`}
                  title={currentCourse.title}
                  description={currentCourse.description}
                  action={
                    <>
                      <button
                        className="button secondary"
                        onClick={() => addImport(currentCourse.id)}
                      >
                        <Upload size={16} />
                        Import lesson
                      </button>
                      <button
                        className="button primary"
                        disabled={
                          !data.configuration.checks ||
                          busy ||
                          data.checks.some((c) =>
                            ['queued', 'running', 'retrying'].includes(c.status),
                          )
                        }
                        onClick={() => run(currentCourse.id)}
                      >
                        <Play size={15} />
                        Run check
                      </button>
                    </>
                  }
                />
                {!data.configuration.checks && (
                  <div className="notice">
                    Checks are not configured. See the setup guidance in Settings.
                  </div>
                )}
                <div className="course-tabs">
                  <span className="selected">
                    Lessons{' '}
                    <b>{data.lessons.filter((l) => l.course_id === currentCourse.id).length}</b>
                  </span>
                  <Link href={`/app/sources?course=${currentCourse.id}`}>
                    Reference sources{' '}
                    <b>{data.sources.filter((s) => s.course_id === currentCourse.id).length}</b>
                  </Link>
                  <Link href="/app/history">Check history</Link>
                </div>
                <div className="table-panel">
                  <div className="panel-heading">
                    <h2>Every lesson, in its place.</h2>
                    <span className="muted">Immutable versions · stable locations</span>
                  </div>
                  <div className="lesson-list">
                    {data.lessons
                      .filter(
                        (l) =>
                          l.course_id === currentCourse.id &&
                          l.title.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((lesson, index) => {
                        const findings = data.findings.filter(
                          (f) => f.version_id === lesson.versionId && f.status === 'open',
                        );
                        return (
                          <button
                            className="lesson-row"
                            key={lesson.id}
                            onClick={() => setLessonId(lesson.id)}
                          >
                            <span className="lesson-number">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="file-icon">
                              <FileText size={19} />
                            </span>
                            <span className="lesson-info">
                              <strong>{lesson.title}</strong>
                              <small>
                                {lesson.format.toUpperCase()} · {lesson.segments.length}{' '}
                                {lesson.segments.length === 1 ? 'segment' : 'segments'}
                              </small>
                            </span>
                            <Badge tone={findings.length ? 'amber' : 'green'}>
                              {findings.length ? `${findings.length} to review` : 'Imported'}
                            </Badge>
                            <ChevronRight size={17} />
                          </button>
                        );
                      })}
                  </div>
                  {!data.lessons.some((l) => l.course_id === currentCourse.id) && (
                    <Empty
                      title="Bring your first lesson."
                      text="Paste your notes or import TXT, Markdown, subtitles, or a text-based PDF."
                    >
                      <button
                        className="button primary"
                        onClick={() => addImport(currentCourse.id)}
                      >
                        Import a lesson
                      </button>
                    </Empty>
                  )}
                </div>
                <div className="notice source-tip">
                  <Link2 size={18} />
                  <p>
                    Good checks start with good sources. Add the official documentation your course
                    relies on.
                  </p>
                  <button className="inline-link" onClick={() => addSource(currentCourse.id)}>
                    Add a source <Plus size={15} />
                  </button>
                </div>
              </>
            ) : (
              <Empty
                title="Course unavailable"
                text="This course does not exist in your current workspace."
              />
            ))}
          {section === 'review' && !selectedId && (
            <ReviewQueue data={data} search={search} onExport={() => setModal('export')} />
          )}
          {section === 'review' &&
            selectedId &&
            (selectedFinding ? (
              <FindingReview
                key={selectedFinding.id}
                finding={selectedFinding}
                data={data}
                busy={busy}
                update={(body) =>
                  mutate(
                    `findings/${selectedFinding.id}`,
                    body,
                    'PATCH',
                    body.apply
                      ? 'Draft applied as a new version. Recheck queued.'
                      : 'Review saved.',
                  )
                }
                onExport={() => setModal('export')}
              />
            ) : (
              <Empty
                title="Finding unavailable"
                text="This finding does not exist in your current workspace."
              />
            ))}
          {section === 'sources' && (
            <>
              <PageHeading
                eyebrow="THE REFERENCES BEHIND YOUR REVIEW"
                title="Go straight to the source."
                description="Creator-approved documentation, with a clear record of what was checked."
                action={
                  <button
                    className="button primary"
                    onClick={() => addSource()}
                    disabled={!data.courses.length}
                  >
                    <Plus size={17} />
                    Add source
                  </button>
                }
              />
              <div className="notice">
                <ShieldCheck size={20} />
                <p>
                  Approve public official references you trust. Manual imports keep their provenance
                  label. Sample references are fictional.
                </p>
              </div>
              <div className="table-panel source-list">
                {data.sources
                  .filter(
                    (s) =>
                      (!params.get('course') || s.course_id === params.get('course')) &&
                      s.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((source) => (
                    <article key={source.id}>
                      <div className="source-icon">
                        <Link2 size={22} />
                      </div>
                      <div className="source-description">
                        <h3>{source.title}</h3>
                        <p>{source.url}</p>
                        <small>
                          {data.courses.find((c) => c.id === source.course_id)?.title} · Added{' '}
                          {date(source.created_at)}
                        </small>
                      </div>
                      <Badge tone={source.provenance === 'fictional sample' ? 'amber' : 'green'}>
                        {source.provenance}
                      </Badge>
                      {source.provenance === 'fictional sample' ? (
                        <button
                          className="icon-button"
                          aria-label="About fictional source"
                          onClick={() => setModal('help')}
                        >
                          <CircleHelp size={18} />
                        </button>
                      ) : (
                        <a
                          className="icon-button"
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${source.title}`}
                        >
                          <ExternalLink size={18} />
                        </a>
                      )}
                    </article>
                  ))}
              </div>
              {!data.sources.length && (
                <Empty
                  title="Give your lessons a reference point."
                  text="Add an official documentation or release-note URL, or an authorized manual text capture."
                />
              )}
              <div className="registry">
                <div className="eyebrow">A STARTING POINT</div>
                <h3>Teaching Notion?</h3>
                <p>
                  Notion’s official help center and release notes can be added as creator-approved
                  sources. Choose pages relevant to your lesson; broad homepages may provide limited
                  coverage.
                </p>
                <a
                  href="https://www.notion.com/help/guides/new-formulas-whats-changed"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-link"
                >
                  Formulas 2.0 guide <ExternalLink size={14} />
                </a>
              </div>
            </>
          )}
          {section === 'history' && (
            <>
              <PageHeading
                eyebrow="A RECORD OF YOUR ROUTINE"
                title="Every check tells a story."
                description="See what was covered, what needs attention, and what couldn’t be checked."
              />
              <div className="table-panel">
                <div className="panel-heading">
                  <h2>Recent checks</h2>
                  <span className="muted">Latest 100 runs</span>
                </div>
                {data.checks.map((check) => (
                  <article className="history-row" key={check.id}>
                    <div className={`check-icon ${check.status === 'completed' ? 'green' : ''}`}>
                      {check.status === 'completed' ? (
                        <CheckCircle2 size={21} />
                      ) : ['running', 'queued', 'retrying'].includes(check.status) ? (
                        <LoaderCircle className="spin" size={21} />
                      ) : (
                        <AlertTriangle size={21} />
                      )}
                    </div>
                    <div className="history-description">
                      <h3>
                        {data.courses.find((c) => c.id === check.course_id)?.title || 'Course'}
                      </h3>
                      <p>
                        {date(check.created_at)} at {time(check.created_at)} · Attempt{' '}
                        {check.attempts || 1}
                      </p>
                      <p>
                        {check.progress}/{check.total} lessons processed · {check.covered} covered ·{' '}
                        {check.inconclusive} inconclusive · {check.findings} new findings
                      </p>
                      {check.error && <p className="amber-text">{check.error}</p>}
                      {check.warnings?.map((w) => (
                        <p className="amber-text" key={w}>
                          {w}
                        </p>
                      ))}
                      {['queued', 'running', 'retrying'].includes(check.status) && (
                        <progress
                          value={check.progress}
                          max={check.total || 1}
                          aria-label="Check progress"
                        />
                      )}
                    </div>
                    <Badge
                      tone={
                        check.status === 'completed'
                          ? 'green'
                          : ['failed', 'canceled'].includes(check.status)
                            ? 'amber'
                            : 'neutral'
                      }
                    >
                      {check.status}
                    </Badge>
                    {['queued', 'running', 'retrying'].includes(check.status) && (
                      <button
                        className="button secondary small"
                        onClick={() =>
                          perform(() =>
                            mutate(`checks/${check.id}/cancel`, {}, 'POST', 'Check canceled.'),
                          )
                        }
                      >
                        Cancel
                      </button>
                    )}
                    {check.status === 'failed' && (
                      <button
                        className="button secondary small"
                        onClick={() => run(check.course_id)}
                      >
                        Start a new check
                      </button>
                    )}
                  </article>
                ))}
                {!data.checks.length && (
                  <Empty
                    title="Ready when you are."
                    text="Import a lesson, add a source, and run your first check. Its progress will appear here."
                  />
                )}
              </div>
              <p className="fine-print">
                Coverage describes the selected source excerpts and saved lesson versions. A
                completed check does not certify factual correctness.
              </p>
            </>
          )}
          {section === 'settings' && (
            <SettingsView
              key={data.workspace.id}
              data={data}
              initialTab={params.get('tab') || 'workspace'}
              busy={busy}
              mutate={mutate}
              onDelete={() => setModal('delete')}
            />
          )}
          {!['overview', 'courses', 'review', 'sources', 'history', 'settings'].includes(
            section,
          ) && (
            <Empty title="Page not found" text="Use the navigation to return to your workspace." />
          )}
          <footer className="app-footer">
            <span>
              LESSONLEDGER<span className="brand-dot">.</span>
            </span>
            <span>Keep every lesson current.</span>
            <span>© {new Date().getFullYear()} Vardhan</span>
          </footer>
        </main>
      </div>
      {modal === 'course' && (
        <Modal title="Make room for a course." onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              perform(async () => {
                const result = await mutate(
                  'courses',
                  Object.fromEntries(form),
                  'POST',
                  'Course created. Bring in your first lesson.',
                );
                setModal(null);
                router.push(`/app/courses/${result.id}`);
              });
            }}
          >
            <label>
              Course name
              <input
                name="title"
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Build your second brain"
                autoFocus
              />
            </label>
            <label>
              Software or product
              <input
                name="product"
                required
                minLength={2}
                maxLength={80}
                placeholder="e.g. Notion"
              />
            </label>
            <label>
              A little context <span className="muted">(optional)</span>
              <textarea
                name="description"
                maxLength={500}
                placeholder="What will your learners be able to do?"
                rows={3}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                Create course <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'import' && (
        <Modal title="Bring a lesson into focus." onClose={() => setModal(null)} wide>
          <ImportForm
            data={data}
            courseId={courseId}
            busy={busy}
            save={async (body) => {
              await mutate(
                'upload',
                body,
                'POST',
                'Lesson imported with its original location markers.',
              );
              setModal(null);
            }}
            onError={setError}
          />
        </Modal>
      )}
      {modal === 'source' && (
        <Modal title="Choose a trusted reference." onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const body = {
                courseId: form.get('courseId'),
                title: form.get('title'),
                url: form.get('url'),
                text: form.get('text') || undefined,
                approved: form.get('approved') === 'on',
              };
              perform(async () => {
                await mutate('sources', body, 'POST', 'Source approved and added.');
                setModal(null);
              });
            }}
          >
            <label>
              Course
              <select name="courseId" defaultValue={courseId} required>
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reference name
              <input
                name="title"
                required
                minLength={2}
                maxLength={120}
                placeholder="Product release notes"
              />
            </label>
            <label>
              Official source URL
              <input
                name="url"
                type="url"
                required
                placeholder="https://product.com/help/…"
                maxLength={2000}
              />
            </label>
            <details className="manual-source">
              <summary>Use an authorized manual text capture</summary>
              <p>
                If a source blocks automated access, paste text you are authorized to use. It will
                be labeled “manual import.”
              </p>
              <label>
                Reference text
                <textarea
                  name="text"
                  rows={5}
                  maxLength={100000}
                  placeholder="Paste the exact reference text…"
                />
              </label>
            </details>
            <label className="checkbox-label">
              <input name="approved" type="checkbox" required />I approve this source and am
              authorized to use its content.
            </label>
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                {busy ? 'Validating source…' : 'Validate & add source'}
                <Plus size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'export' && (
        <Modal title="Take your next steps with you." onClose={() => setModal(null)}>
          <p className="modal-description">
            Export {data.findings.filter((f) => f.status === 'confirmed').length} confirmed findings
            with their approved drafts and source evidence.
          </p>
          <div className="export-options">
            {[
              {
                format: 'md',
                title: 'Markdown',
                text: 'An editable checklist for your writing workflow.',
              },
              {
                format: 'csv',
                title: 'CSV spreadsheet',
                text: 'Organize updates in your favorite spreadsheet.',
              },
              {
                format: 'pdf',
                title: 'PDF document',
                text: 'A clean, portable worklist to review or share.',
              },
            ].map((f) => (
              <button
                key={f.format}
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    const result = await mutate(
                      'exports',
                      { format: f.format },
                      'POST',
                      'Your approved worklist is ready.',
                    );
                    const link = document.createElement('a');
                    link.href = `/api/exports/${result.id}`;
                    link.download = 'lessonledger-worklist';
                    link.click();
                    setModal(null);
                  })
                }
              >
                <FileText size={25} />
                <span>
                  <strong>{f.title}</strong>
                  <small>{f.text}</small>
                </span>
                <Download size={19} />
              </button>
            ))}
          </div>
          <p className="fine-print">
            Only confirmed findings are included. Sample exports retain their fictional provenance.
          </p>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal title="A thoughtful place to begin." onClose={() => setModal(null)}>
          <ol className="help-steps">
            <li>
              <strong>Bring your lessons.</strong>
              <p>Create a course and import text, subtitles, or text-based PDFs.</p>
            </li>
            <li>
              <strong>Choose your references.</strong>
              <p>
                Approve official documentation relevant to your course. Fictional sample sources are
                clearly labeled.
              </p>
            </li>
            <li>
              <strong>Check, then consider.</strong>
              <p>
                Review exact excerpts and evidence. Confirm or dismiss each finding, edit a draft,
                and export approved work.
              </p>
            </li>
          </ol>
          <div className="notice">
            Checks identify potential changes; they do not certify correctness. Applying a draft
            creates a version and queues another check.
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete this workspace?" onClose={() => setModal(null)}>
          <p className="modal-description">
            This stops monitoring and queues permanent deletion of this workspace’s courses, lesson
            versions, source captures, findings, and stored files. Export your work first.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(async () => {
                await api(
                  'workspace',
                  { confirmation: new FormData(e.currentTarget).get('confirmation') },
                  'DELETE',
                );
                await api('logout');
                router.push('/');
              });
            }}
          >
            <label>
              Type DELETE to confirm
              <input name="confirmation" pattern="DELETE" required autoComplete="off" />
            </label>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setModal(null)}>
                Keep workspace
              </button>
              <button className="button danger">Delete workspace</button>
            </div>
          </form>
        </Modal>
      )}
      {lessonId && (
        <Modal
          title={data.lessons.find((l) => l.id === lessonId)?.title || 'Lesson'}
          onClose={() => setLessonId('')}
          wide
        >
          <LessonPreview lessonId={lessonId} />
        </Modal>
      )}
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
function CourseCard({ course, data }: { course: Course; data: WorkspaceData }) {
  const lessons = data.lessons.filter((l) => l.course_id === course.id);
  const findings = data.findings.filter((f) => f.courseId === course.id && f.status === 'open');
  return (
    <Link className="course-card" href={`/app/courses/${course.id}`}>
      <div className={`course-art ${course.color}`}>
        <div className="course-book">
          <span>
            {course.product.toUpperCase()}
            <br />
            FIELD NOTES
          </span>
          <div className="book-line" />
          <BookOpen size={47} strokeWidth={0.8} />
          <span>LEARN. BUILD. KEEP GROWING.</span>
        </div>
        <div className="course-art-label">
          THE CREATOR SERIES<span>VOL. 01</span>
        </div>
      </div>
      <div className="course-card-content">
        <div className="course-product">
          {course.product}
          <ArrowUpRight size={16} />
        </div>
        <h3>{course.title}</h3>
        <p>
          {lessons.length} lessons · {data.sources.filter((s) => s.course_id === course.id).length}{' '}
          reference sources
        </p>
        <div className="course-card-footer">
          <Badge tone={findings.length ? 'amber' : 'green'}>
            {findings.length ? `${findings.length} lessons to review` : 'Ready for your next step'}
          </Badge>
          <ChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
}
function Overview({
  data,
  search,
  onImport,
  onCourse,
  run,
}: {
  data: WorkspaceData;
  search: string;
  onImport: () => void;
  onCourse: () => void;
  run: (id: string) => void;
}) {
  const findings = data.findings.filter(
    (f) =>
      f.status === 'open' &&
      `${f.title} ${f.lessonTitle}`.toLowerCase().includes(search.toLowerCase()),
  );
  const last = data.checks.find((c) => c.status === 'completed');
  const coverage = last ? Math.round((last.covered / Math.max(last.total, 1)) * 100) : 0;
  return (
    <>
      <PageHeading
        eyebrow={new Date()
          .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
          .toUpperCase()}
        title={`Good to see you, ${data.user.name.split(' ')[0] || 'creator'}.`}
        description="You’ve done the teaching. Let’s take care of what comes next."
        action={
          <button className="button primary" onClick={data.courses.length ? onImport : onCourse}>
            <Plus size={17} />
            {data.courses.length ? 'Import a lesson' : 'Create a course'}
          </button>
        }
      />
      <div className="overview-summary">
        <div className="summary-intro">
          <span className="eyebrow">A MOMENT FOR YOUR COURSES</span>
          <h2>
            {findings.length ? (
              <>
                {findings.length} small updates.
                <br />
                <em>A better learning experience.</em>
              </>
            ) : (
              <>
                Make a little room
                <br />
                <em>for what’s next.</em>
              </>
            )}
          </h2>
          <p>
            {findings.length
              ? 'A few things have changed since these lessons were written. Here’s a clear place to start.'
              : 'Bring in a course, connect its sources, and build a routine that keeps your lessons current.'}
          </p>
          <Link href={findings.length ? '/app/review' : '/app/courses'} className="button primary">
            {findings.length ? 'Review the changes' : 'Go to your courses'}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="summary-illustration" aria-hidden="true">
          <svg viewBox="0 0 220 190" fill="none">
            <ellipse cx="113" cy="161" rx="77" ry="13" fill="var(--illustration-shadow)" />
            <g transform="rotate(-9 90 90)">
              <rect
                x="40"
                y="27"
                width="110"
                height="128"
                rx="3"
                fill="var(--paper)"
                stroke="var(--illustration-line)"
              />
              <path
                d="M53 43h35M53 59h72M53 68h58M53 77h67M53 105h72M53 114h58M53 123h42"
                stroke="var(--illustration-line)"
              />
              <rect x="51" y="85" width="74" height="10" fill="var(--illustration-highlight)" />
            </g>
            <g transform="rotate(11 135 105)">
              <rect
                x="108"
                y="77"
                width="66"
                height="67"
                rx="2"
                fill="var(--illustration-note)"
                stroke="var(--illustration-line)"
              />
              <path d="m124 108 9 9 22-25" stroke="var(--primary)" strokeWidth="2" />
              <path d="M120 132h42" stroke="var(--illustration-line)" />
            </g>
            <path
              d="M170 64c10-28 19-29 21-21s-12 29-18 19c-9-15 22-26 29-19"
              stroke="var(--illustration-line)"
            />
            <path d="m169 54 1 12 12-4" stroke="var(--illustration-line)" />
          </svg>
          <span>GOOD WORK IS WORTH KEEPING.</span>
        </div>
        <div className="summary-stats">
          <div>
            <span>NEEDS YOUR REVIEW</span>
            <strong>
              {data.findings.filter((f) => f.status === 'open').length}
              <small>findings</small>
            </strong>
            <span className="stat-note amber-text">Your next clear steps</span>
          </div>
          <div>
            <span>LESSONS IN YOUR CARE</span>
            <strong>
              {data.lessons.length}
              <small>lessons</small>
            </strong>
            <span className="stat-note">
              Across {data.courses.length} {data.courses.length === 1 ? 'course' : 'courses'}
            </span>
          </div>
        </div>
      </div>
      <div className="overview-grid">
        <section className="attention-section">
          <div className="section-title">
            <h2>A little attention goes a long way.</h2>
            <Link href="/app/review" className="inline-link">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="findings-list">
            {findings.slice(0, 3).map((f, i) => (
              <Link href={`/app/review/${f.id}`} className="finding-row" key={f.id}>
                <span className="finding-number">0{i + 1}</span>
                <div>
                  <div className="finding-meta">
                    <Badge tone={f.severity === 'high' ? 'amber' : 'neutral'}>
                      {f.severity === 'high' ? 'Needs attention' : 'Worth a look'}
                    </Badge>
                    <span>{data.courses.find((c) => c.id === f.courseId)?.product}</span>
                  </div>
                  <h3>{f.title}</h3>
                  <p>
                    {f.lessonTitle}
                    <span> · {f.location}</span>
                  </p>
                </div>
                <ArrowUpRight size={19} />
              </Link>
            ))}
            {!findings.length && (
              <Empty
                title="A clear place to start."
                text={
                  search
                    ? 'No findings match your search.'
                    : 'Run a check to see whether your lessons need attention.'
                }
              />
            )}
          </div>
          <div className="review-reminder">
            <ShieldCheck size={15} />
            <span>You make the call. Every finding comes with evidence.</span>
          </div>
        </section>
        <aside className="coverage-panel">
          <div className="section-title">
            <h2>Your reference check-in</h2>
            <Link2 size={17} />
          </div>
          <div className="coverage-value">
            <strong>{last ? `${coverage}%` : 'N/A'}</strong>
            <Badge tone={coverage === 100 ? 'green' : 'amber'}>
              {last ? 'Latest check' : 'Not checked yet'}
            </Badge>
          </div>
          <p>
            Lessons covered by the selected
            <br />
            source excerpts in your latest check.
          </p>
          <div className="coverage-track">
            <span style={{ width: `${coverage}%` }} />
          </div>
          <div className="coverage-detail">
            <span>Approved sources</span>
            <strong>{data.sources.length}</strong>
          </div>
          <div className="coverage-detail">
            <span>Inconclusive lessons</span>
            <strong>{last?.inconclusive || 0}</strong>
          </div>
          <div className="coverage-detail">
            <span>Last completed</span>
            <strong>{last ? date(last.created_at) : 'Not yet'}</strong>
          </div>
          <Link href="/app/sources" className="inline-link">
            Manage your sources <ArrowUpRight size={14} />
          </Link>
        </aside>
      </div>
      <section className="overview-courses">
        <div className="section-title">
          <div>
            <div className="eyebrow">THE WORK YOU’RE PROUD OF</div>
            <h2>Your courses, well kept.</h2>
          </div>
          <button className="inline-link" onClick={onCourse}>
            New course <Plus size={15} />
          </button>
        </div>
        <div className="overview-course-grid">
          {data.courses
            .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
            .slice(0, 2)
            .map((c) => (
              <CourseCard key={c.id} course={c} data={data} />
            ))}
          <div className="routine-card">
            <CalendarDays size={25} strokeWidth={1.2} />
            <h3>Make care a routine.</h3>
            <p>A quick check today means fewer surprises for your learners tomorrow.</p>
            {data.courses.length ? (
              <button
                className="button secondary small"
                disabled={
                  !data.configuration.checks ||
                  data.checks.some((c) => ['queued', 'running', 'retrying'].includes(c.status))
                }
                onClick={() => run(data.courses[0].id)}
              >
                Run a course check <ArrowRight size={15} />
              </button>
            ) : (
              <button className="button secondary small" onClick={onCourse}>
                Create your first course <Plus size={15} />
              </button>
            )}
            <Link href="/app/settings?tab=monitoring" className="inline-link">
              Set up a schedule <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function ReviewQueue({
  data,
  search,
  onExport,
}: {
  data: WorkspaceData;
  search: string;
  onExport: () => void;
}) {
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('all');
  const [course, setCourse] = useState('all');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(0);
  const filtered = data.findings.filter(
    (f) =>
      (status === 'all' || f.status === status) &&
      (severity === 'all' || f.severity === severity) &&
      (course === 'all' || f.courseId === course) &&
      (source === 'all' || f.sourceUrl === source) &&
      `${f.title} ${f.lessonTitle}`.toLowerCase().includes(search.toLowerCase()),
  );
  const change = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(0);
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR EXPERTISE MAKES THE DIFFERENCE"
        title="Good lessons deserve a second look."
        description="Review the evidence, make the call, and leave each lesson a little better."
        action={
          <button className="button secondary" onClick={onExport}>
            <Download size={16} />
            Export worklist
          </button>
        }
      />
      <div className="queue-tabs">
        {['open', 'confirmed', 'dismissed', 'resolved', 'all'].map((s) => (
          <button
            key={s}
            className={status === s ? 'selected' : ''}
            onClick={() => change(setStatus, s)}
          >
            {s === 'open'
              ? 'To review'
              : s === 'all'
                ? 'All findings'
                : s[0].toUpperCase() + s.slice(1)}
            <b>{data.findings.filter((f) => s === 'all' || f.status === s).length}</b>
          </button>
        ))}
      </div>
      <div className="filters">
        <label>
          Course
          <select value={course} onChange={(e) => change(setCourse, e.target.value)}>
            <option value="all">All courses</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select value={severity} onChange={(e) => change(setSeverity, e.target.value)}>
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Source
          <select value={source} onChange={(e) => change(setSource, e.target.value)}>
            <option value="all">All sources</option>
            {[...new Map(data.sources.map((s) => [s.url, s])).values()].map((s) => (
              <option key={s.url} value={s.url}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <span>
          {filtered.length} {filtered.length === 1 ? 'finding' : 'findings'}
        </span>
      </div>
      <div className="queue-list">
        {filtered.slice(page * 10, page * 10 + 10).map((f) => (
          <Link href={`/app/review/${f.id}`} key={f.id} className="queue-row">
            <div className={`severity-mark ${f.severity}`} />
            <div className="queue-row-content">
              <div className="finding-meta">
                <Badge tone={f.severity === 'high' ? 'amber' : 'neutral'}>
                  {f.severity} priority
                </Badge>
                <span>{f.category}</span>
              </div>
              <h2>{f.title}</h2>
              <p>
                {f.lessonTitle} <span>· {f.location}</span>
              </p>
              <div className="queue-excerpt">“{f.original}”</div>
            </div>
            <div className="queue-row-aside">
              <Badge tone={f.status === 'confirmed' ? 'green' : 'neutral'}>
                {f.status === 'open' ? 'To review' : f.status}
              </Badge>
              <span>
                View evidence <ArrowUpRight size={16} />
              </span>
            </div>
          </Link>
        ))}
        {!filtered.length && (
          <Empty
            title={
              status === 'confirmed'
                ? 'Your approved work will live here.'
                : 'A little breathing room.'
            }
            text={
              status === 'confirmed'
                ? 'Confirm findings in the review screen to add them to your worklist.'
                : 'No findings match these filters. Try another view or run a check.'
            }
          />
        )}
      </div>
      {filtered.length > 10 && (
        <div className="pagination">
          <button
            className="button secondary small"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.ceil(filtered.length / 10)}
          </span>
          <button
            className="button secondary small"
            disabled={(page + 1) * 10 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

function FindingReview({
  finding: f,
  data,
  busy,
  update,
  onExport,
}: {
  finding: Finding;
  data: WorkspaceData;
  busy: boolean;
  update: (body: any) => Promise<any>;
  onExport: () => void;
}) {
  const [draft, setDraft] = useState(f.replacement);
  const [events, setEvents] = useState<any[] | null>(null);
  const [localError, setLocalError] = useState('');
  const submit = (body: any) => {
    setLocalError('');
    void update(body).catch((e) => setLocalError(e.message));
  };
  const lesson = data.lessons.find((l) => l.versionId === f.version_id);
  const index = data.findings.findIndex((item) => item.id === f.id);
  const next = data.findings[index + 1];
  return (
    <>
      <div className="review-topline">
        <Link href="/app/review" className="back-link">
          <ArrowLeft size={15} />
          Back to review queue
        </Link>
        <span>
          Finding {index + 1} of {data.findings.length}
        </span>
      </div>
      <div className="review-heading">
        <div className="finding-meta">
          <Badge tone={f.severity === 'high' ? 'amber' : 'neutral'}>{f.severity} priority</Badge>
          <span>{f.category}</span>
          <Badge tone={f.status === 'confirmed' ? 'green' : 'neutral'}>
            {f.status === 'open' ? 'To review' : f.status}
          </Badge>
        </div>
        <h1>{f.title}</h1>
        <p>
          {data.courses.find((c) => c.id === f.courseId)?.title} <ChevronRight size={12} />
          {f.lessonTitle}
        </p>
      </div>
      <div className="review-panes">
        <section className="lesson-pane">
          <div className="pane-label">
            <FileText size={17} />
            <span>IN YOUR LESSON</span>
            <span className="location-chip">{f.location}</span>
          </div>
          <div className="lesson-paper">
            <div className="eyebrow">LESSON EXCERPT · SAVED VERSION</div>
            <h2>{f.lessonTitle}</h2>
            {lesson?.segments
              .find((s) => s.location === f.location)
              ?.text.split(f.original)
              .map((part, i) => (
                <span key={i}>
                  {i > 0 && <mark>{f.original}</mark>}
                  {part}
                </span>
              )) || <mark>{f.original}</mark>}
            <div className="paper-end">
              <span />
              <BookOpen size={15} />
              <span />
            </div>
            <p className="paper-note">
              This excerpt is preserved from the version used in the check. Later edits do not
              rewrite this evidence.
            </p>
          </div>
          <div className="reasoning">
            <div className="eyebrow">WHY IT’S WORTH A LOOK</div>
            <p>{f.explanation}</p>
          </div>
        </section>
        <section className="evidence-pane">
          <div className="pane-label">
            <Link2 size={17} />
            <span>AT THE SOURCE</span>
            <ShieldCheck size={16} />
          </div>
          <div className="source-evidence">
            <div className="evidence-source-title">
              <div className="source-icon">
                <Link2 size={20} />
              </div>
              <div>
                <h3>{f.sourceTitle}</h3>
                <span>
                  {f.provenance === 'fictional sample'
                    ? 'Fictional sample reference'
                    : f.provenance}
                </span>
              </div>
              {f.provenance !== 'fictional sample' && (
                <a href={f.sourceUrl} target="_blank" rel="noreferrer" aria-label="Open source">
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
            <div className="evidence-url">{f.sourceUrl}</div>
            <blockquote>{f.evidence}</blockquote>
            <div className="capture-date">
              <Clock3 size={13} />
              Captured {date(f.capturedAt)} at {time(f.capturedAt)}
            </div>
          </div>
          <div className="draft-section">
            <div className="draft-heading">
              <div>
                <div className="eyebrow">A CLEARER WAY TO SAY IT</div>
                <h2>Your update draft</h2>
              </div>
              <span>EDITABLE</span>
            </div>
            <label className="sr-only" htmlFor="replacement">
              Proposed lesson replacement
            </label>
            <textarea
              id="replacement"
              rows={5}
              maxLength={5000}
              minLength={12}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="draft-footer">
              <span>Make it sound like you.</span>
              <button
                className="inline-link"
                disabled={busy || draft === f.replacement || draft.length < 12}
                onClick={() => submit({ replacement: draft })}
              >
                Save draft <Check size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>
      {localError && (
        <div className="notice error" role="alert">
          {localError}
        </div>
      )}
      <div className="review-actionbar">
        <span>
          <ShieldCheck size={16} />
          Evidence informs. You decide.
        </span>
        <div>
          {f.status === 'open' && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => submit({ status: 'dismissed' })}
              >
                <X size={16} />
                Dismiss
              </button>
              <button
                className="button primary"
                disabled={busy || draft.length < 12}
                onClick={() => submit({ status: 'confirmed', replacement: draft })}
              >
                <Check size={17} />
                Confirm update
              </button>
            </>
          )}
          {f.status === 'confirmed' && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => submit({ status: 'resolved' })}
              >
                Mark resolved
              </button>
              <button className="button secondary" onClick={onExport}>
                <Download size={16} />
                Export
              </button>
              <button
                className="button primary"
                disabled={busy || draft.length < 12}
                onClick={() => submit({ apply: true, replacement: draft })}
              >
                Apply & recheck <ArrowRight size={16} />
              </button>
            </>
          )}
          {['dismissed', 'resolved'].includes(f.status) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => submit({ status: 'open' })}
            >
              Reopen finding
            </button>
          )}
        </div>
      </div>
      <div className="review-bottom">
        <button
          className="inline-link"
          onClick={() => {
            void api(`findings/${f.id}/events`, undefined, 'GET')
              .then(setEvents)
              .catch((e) => setLocalError(e.message));
          }}
        >
          <History size={15} />
          Review history
        </button>
        {next && (
          <Link href={`/app/review/${next.id}`} className="inline-link">
            Next finding <ArrowRight size={15} />
          </Link>
        )}
      </div>
      {events && (
        <div className="audit-list">
          {events.length ? (
            events.map((e) => (
              <p key={e.id}>
                <Clock3 size={14} />
                {date(e.created_at)} {time(e.created_at)} · {e.action} · {e.from} → {e.to}
              </p>
            ))
          ) : (
            <p>No review actions yet.</p>
          )}
        </div>
      )}
    </>
  );
}

function ImportForm({
  data,
  courseId,
  busy,
  save,
  onError,
}: {
  data: WorkspaceData;
  courseId: string;
  busy: boolean;
  save: (body: any) => Promise<void>;
  onError: (s: string) => void;
}) {
  const [tab, setTab] = useState('paste');
  const [text, setText] = useState('');
  const [format, setFormat] = useState('txt');
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(courseId);
  const [loading, setLoading] = useState(false);
  const [blobId, setBlobId] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const readFile = async (file: File) => {
    setLoading(true);
    setError('');
    setSegments(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api('preview', form);
      setSegments(result.segments);
      setBlobId(result.blobId);
      setFormat(result.format);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const preview = async () => {
    const file = new File([text], `lesson.${format}`, { type: 'text/plain' });
    await readFile(file);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!segments) return;
        void save({ courseId: course, title, format, segments, blobId }).catch((e) => {
          setError(e.message);
          onError(e.message);
        });
      }}
    >
      <div className="form-grid">
        <label>
          Course
          <select value={course} onChange={(e) => setCourse(e.target.value)} required>
            <option value="" disabled>
              Choose a course
            </option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lesson title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={2}
            maxLength={150}
            placeholder="A title your learners will recognize"
          />
        </label>
      </div>
      <div className="import-tabs">
        <button
          type="button"
          className={tab === 'paste' ? 'selected' : ''}
          onClick={() => {
            setTab('paste');
            setSegments(null);
            setFormat('txt');
          }}
        >
          <FileText size={16} />
          Paste text
        </button>
        <button
          type="button"
          className={tab === 'file' ? 'selected' : ''}
          onClick={() => {
            setTab('file');
            setSegments(null);
          }}
        >
          <Upload size={16} />
          Upload a file
        </button>
      </div>
      {tab === 'paste' ? (
        <>
          <label>
            Lesson text
            <textarea
              value={text}
              rows={7}
              maxLength={180000}
              onChange={(e) => {
                setText(e.target.value);
                setSegments(null);
              }}
              placeholder="Paste a lesson, a script, or a set of instructions…"
            />
          </label>
          <div className="preview-controls">
            <label>
              Format
              <select
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value);
                  setSegments(null);
                }}
              >
                <option value="txt">Plain text</option>
                <option value="md">Markdown</option>
                <option value="srt">SRT subtitles</option>
                <option value="vtt">VTT subtitles</option>
              </select>
            </label>
            <button
              className="button secondary small"
              type="button"
              disabled={!text.trim() || loading}
              onClick={() => void preview()}
            >
              {loading ? 'Reading…' : 'Preview lesson'}
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            className="sr-only"
            ref={fileRef}
            type="file"
            accept=".txt,.md,.srt,.vtt,.pdf"
            aria-label="Choose lesson file"
            onChange={(e) => {
              if (e.target.files?.[0]) void readFile(e.target.files[0]);
            }}
          />
          <button
            type="button"
            className="dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length !== 1) {
                setError('Import one file at a time.');
                return;
              }
              void readFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload size={30} strokeWidth={1.3} />
            <strong>
              {loading ? 'Reading your lesson…' : 'Drop your lesson here, or browse files'}
            </strong>
            <span>TXT, Markdown, SRT, VTT, or text-based PDF</span>
            <small>Up to 5 MB · 80 PDF pages · No OCR or video transcription</small>
          </button>
        </>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {segments && (
        <div className="import-preview">
          <div className="panel-heading">
            <h3>One last look.</h3>
            <Badge tone="green">{segments.length} segments ready</Badge>
          </div>
          {segments.slice(0, 8).map((s, i) => (
            <div key={i}>
              <span className="location-chip">{s.location}</span>
              <p>{s.text}</p>
            </div>
          ))}
          {segments.length > 8 && <p>And {segments.length - 8} more segments.</p>}
        </div>
      )}
      <div className="modal-actions">
        <span className="fine-print">Your original location markers stay with the text.</span>
        <button
          className="button primary"
          disabled={!segments || !course || title.length < 2 || busy}
        >
          {busy ? 'Importing…' : 'Import lesson'}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
function LessonPreview({ lessonId }: { lessonId: string }) {
  const [lesson, setLesson] = useState<any>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  useEffect(() => {
    void api(`lessons/${lessonId}`, undefined, 'GET')
      .then(setLesson)
      .catch((e) => setError(e.message));
  }, [lessonId]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {!lesson ? (
        <p>Loading saved versions…</p>
      ) : (
        <>
          <label>
            Saved version
            <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
              {lesson.versions.map((v: any, i: number) => (
                <option key={v.id} value={i}>
                  Version {v.number} · {date(v.created_at)} {time(v.created_at)}
                </option>
              ))}
            </select>
          </label>
          <div className="import-preview">
            {lesson.versions[index]?.segments.map((s: Segment, i: number) => (
              <div key={i}>
                <span className="location-chip">{s.location}</span>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Each version is immutable. Applying a confirmed update creates a new version.
          </p>
        </>
      )}
    </>
  );
}

function SettingsView({
  data,
  initialTab,
  busy,
  mutate,
  onDelete,
}: {
  data: WorkspaceData;
  initialTab: string;
  busy: boolean;
  mutate: (path: string, body?: unknown, method?: string, message?: string) => Promise<any>;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [localError, setLocalError] = useState('');
  const isOwner = data.user.role === 'owner';
  const perform = (task: () => Promise<unknown>) => {
    setLocalError('');
    void task().catch((e) => setLocalError(e.message));
  };
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="A workspace that works for you."
        description="Your preferences, your routine, and a clear view of your plan."
      />
      <div className="queue-tabs">
        {['workspace', 'monitoring', 'billing'].map((t) => (
          <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {!isOwner && (
        <div className="notice">
          Only workspace owners can edit these settings or manage billing.
        </div>
      )}
      {localError && (
        <div className="notice error" role="alert">
          {localError}
        </div>
      )}
      {tab === 'workspace' && (
        <div className="settings-columns">
          <section className="settings-panel">
            <h2>The details that make it yours.</h2>
            <p>Changes apply to this workspace.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                perform(() =>
                  mutate(
                    'settings',
                    {
                      name: form.get('name'),
                      timezone: form.get('timezone'),
                      retentionDays: Number(form.get('retentionDays')),
                      notifications: form.get('notifications') === 'on',
                    },
                    'PATCH',
                    'Workspace preferences saved.',
                  ),
                );
              }}
            >
              <fieldset disabled={!isOwner || busy}>
                <label>
                  Workspace name
                  <input
                    name="name"
                    defaultValue={data.workspace.name}
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </label>
                <label>
                  Timezone
                  <input
                    name="timezone"
                    defaultValue={data.workspace.timezone || 'UTC'}
                    required
                    placeholder="America/New_York"
                  />
                </label>
                <label>
                  File retention
                  <select name="retentionDays" defaultValue={data.workspace.retentionDays || 90}>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={365}>365 days</option>
                  </select>
                </label>
                <p className="fine-print">
                  Stored files and exports expire after this period. Normalized lesson versions and
                  evidence remain until workspace deletion, preserving your review history.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="notifications"
                    defaultChecked={data.workspace.notifications}
                  />
                  Email a digest when a check finds new changes.
                </label>
                <button className="button primary">
                  Save preferences <Check size={16} />
                </button>
              </fieldset>
            </form>
          </section>
          <aside>
            <div className="settings-panel">
              <h3>Your work belongs to you.</h3>
              <p>
                Download all lesson versions, source captures, and review records for this
                workspace.
              </p>
              <a
                href="/api/workspace/export"
                download
                className="button secondary small"
                aria-disabled={!isOwner}
              >
                Export workspace data <Download size={15} />
              </a>
            </div>
            <div className="settings-panel setup-panel">
              <h3>Service configuration</h3>
              <p>
                <span className={`status-dot ${data.configuration.checks ? '' : 'off'}`} />
                {data.configuration.checks
                  ? data.workspace.demo
                    ? 'Sample checks available'
                    : 'Checks configured'
                  : 'Checks are not configured'}
              </p>
              <p>
                <span className={`status-dot ${data.configuration.billing ? '' : 'off'}`} />
                {data.configuration.billing ? 'Billing configured' : 'Billing is not configured'}
              </p>
              <p className="fine-print">
                For live checks, configure OPENAI_API_KEY and OPENAI_MODEL. Billing requires Stripe
                keys, prices, and webhook setup. Full instructions: docs/setup.md in the project
                repository.
              </p>
            </div>
            <div className="settings-panel danger-panel">
              <h3>Delete workspace</h3>
              <p>Stops monitoring and permanently removes this workspace and its files.</p>
              <button className="inline-link danger-text" disabled={!isOwner} onClick={onDelete}>
                Delete this workspace <ArrowUpRight size={14} />
              </button>
            </div>
          </aside>
        </div>
      )}
      {tab === 'monitoring' && (
        <>
          <div className="settings-intro">
            <h2>A regular check-in, on your terms.</h2>
            <p>
              Choose an interval for each course. All checks share your monthly allowance. Intervals
              use elapsed days; your timezone is retained for display and email context.
            </p>
          </div>
          {data.courses.map((course) => {
            const schedule = data.schedules.find((s) => s.course_id === course.id);
            return (
              <form
                key={course.id}
                className="schedule-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  perform(() =>
                    mutate(
                      'schedules',
                      {
                        courseId: course.id,
                        enabled: form.get('enabled') === 'on',
                        days: Number(form.get('days')),
                        timezone: data.workspace.timezone || 'UTC',
                      },
                      'POST',
                      'Monitoring schedule saved.',
                    ),
                  );
                }}
              >
                <div>
                  <h3>{course.title}</h3>
                  <p>
                    {schedule?.enabled
                      ? `Next check: ${new Date(schedule.next_run).toLocaleString('en-US', { timeZone: schedule.timezone })} (${schedule.timezone})`
                      : 'Monitoring is off'}
                    {schedule?.error && <span className="amber-text"> · {schedule.error}</span>}
                  </p>
                </div>
                <label>
                  Check every
                  <select name="days" defaultValue={schedule?.days || 30} disabled={!isOwner}>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={schedule?.enabled}
                    disabled={!isOwner}
                  />
                  Enable
                </label>
                <button className="button secondary small" disabled={!isOwner || busy}>
                  Save schedule
                </button>
              </form>
            );
          })}
          {!data.courses.length && (
            <Empty
              title="First, a course to care for."
              text="Create a course before setting up its monitoring schedule."
            />
          )}
        </>
      )}
      {tab === 'billing' && (
        <>
          <div className="billing-overview">
            <div>
              <div className="eyebrow">YOUR CURRENT PLAN</div>
              <h2>
                {data.workspace.demo
                  ? 'Sample workspace'
                  : data.subscription.allowed
                    ? data.subscription.limits.name
                    : 'Choose your starting point.'}
              </h2>
              <p>
                {data.workspace.demo
                  ? 'Explore freely. No payment or subscription is attached.'
                  : `Subscription status: ${data.subscription.status}. Paid access is verified on the server.`}
              </p>
              {data.subscription.cancelAtPeriodEnd && (
                <p>Access ends {date(data.subscription.periodEnd)}.</p>
              )}
            </div>
            <div className="billing-usage">
              <span>CHECKS THIS MONTH</span>
              <strong>
                {data.usage.used}
                <small> / {data.usage.limit}</small>
              </strong>
              <progress
                value={data.usage.used}
                max={data.usage.limit}
                aria-label="Monthly check usage"
              />
              <p>
                {Math.max(0, data.usage.limit - data.usage.used)} remaining · Resets{' '}
                {date(data.usage.reset, true)} UTC
              </p>
            </div>
          </div>
          {!data.configuration.billing && (
            <div className="notice">
              <CircleHelp size={19} />
              {data.workspace.demo
                ? 'Billing is unavailable in the sample workspace. No card is needed.'
                : 'Billing is not configured. The owner must configure Stripe before Checkout is available.'}
            </div>
          )}
          <div className="billing-plans">
            {[
              { id: 'starter', name: 'Starter', price: 49, courses: 3, lessons: 100, checks: 4 },
              { id: 'studio', name: 'Studio', price: 129, courses: 10, lessons: 500, checks: 16 },
            ].map((plan) => (
              <section key={plan.id} className="price-card">
                <div className="eyebrow">{plan.name}</div>
                <div className="price">
                  ${plan.price}
                  <span>/ month</span>
                </div>
                <ul className="check-list">
                  <li>
                    <Check size={16} />
                    {plan.courses} courses · {plan.lessons} lessons
                  </li>
                  <li>
                    <Check size={16} />
                    {plan.checks} checks per calendar month
                  </li>
                  <li>
                    <Check size={16} />
                    Review, drafts, and exports
                  </li>
                </ul>
                <button
                  className="button secondary"
                  disabled={!isOwner || !data.configuration.billing || busy}
                  onClick={() =>
                    perform(async () => {
                      const result = await mutate('billing', { plan: plan.id });
                      if (result.url) window.location.assign(result.url);
                    })
                  }
                >
                  {data.subscription.allowed && !data.workspace.demo
                    ? 'Manage subscription'
                    : `Choose ${plan.name}`}
                  <ArrowUpRight size={15} />
                </button>
              </section>
            ))}
          </div>
          <p className="fine-print">
            Experimental pricing. One accepted check uses one unit; retries continue the same
            reservation. Manual and scheduled checks share the allowance. Each check supports 25
            lessons, 8 sources, and at most 20 comparison calls. No unlimited processing.
          </p>
          {data.configuration.billing && (
            <button
              className="inline-link"
              disabled={!isOwner}
              onClick={() =>
                perform(async () => {
                  const result = await mutate('billing', { portal: true });
                  window.location.assign(result.url);
                })
              }
            >
              Open billing portal <ExternalLink size={15} />
            </button>
          )}
        </>
      )}
    </>
  );
}
