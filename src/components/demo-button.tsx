'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
export function DemoButton({
  className = 'button primary',
  children = 'Explore the sample',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const response = await fetch('/api/demo', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            router.push('/app');
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <>
            {children}
            <ArrowUpRight size={17} />
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}
