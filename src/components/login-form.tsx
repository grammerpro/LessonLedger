'use client';
import { useState } from 'react';
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';
import { ArrowRight, Mail, Check } from 'lucide-react';
import { Brand } from '@/components/brand';
import { DemoButton } from '@/components/demo-button';
const authClient = createAuthClient({ plugins: [magicLinkClient()] });
export function LoginForm({ sample }: { sample: boolean }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="login-page">
      <Brand />
      <main id="main" className="login-box">
        <div className="eyebrow">WELCOME TO LESSONLEDGER</div>
        <h1>
          A little care
          <br />
          goes a long way.
        </h1>
        <p>Sign in or create your workspace with a secure email link.</p>
        {sent ? (
          <div className="notice success" role="status">
            <Check size={20} />
            <div>
              <strong>Check your inbox.</strong>
              <p>
                Your sign-in link expires in 10 minutes.
                {sample && ' In local development, find the message in data/mail.'}
              </p>
              <button className="inline-link" onClick={() => setSent(false)}>
                Use another email
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const form = new FormData(e.currentTarget);
              try {
                const { error } = await authClient.signIn.magicLink({
                  email: String(form.get('email')),
                  name: String(form.get('name')),
                  callbackURL: '/app',
                });
                if (error) throw new Error(error.message);
                setSent(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                placeholder="Alex Morgan"
                maxLength={80}
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@yourstudio.com"
              />
            </label>
            <button className="button primary" disabled={busy}>
              <Mail size={17} />
              {busy ? 'Sending link…' : 'Email me a sign-in link'}
              <ArrowRight size={17} />
            </button>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
        {sample && (
          <>
            <div className="login-divider">
              <span>or take a look around</span>
            </div>
            <DemoButton className="button secondary" />
            <p className="fine-print">
              A fictional course. An isolated, disposable workspace.
              <br />
              No account or payment needed.
            </p>
          </>
        )}
      </main>
      <footer>© {new Date().getFullYear()} Vardhan · Keep every lesson current.</footer>
    </div>
  );
}
