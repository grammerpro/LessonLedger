import Link from 'next/link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="LessonLedger home">
      <svg width="31" height="35" viewBox="0 0 32 36" fill="none" aria-hidden="true">
        <path d="M5 2h15l7 7v23H5V2Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M19 2v9h8M10 17h11M10 22h7M10 27h5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="m19 29 7-7 3 3-7 7-4 1 1-4Z"
          fill="var(--canvas)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      {!compact && (
        <span>
          LessonLedger<span className="brand-dot">.</span>
        </span>
      )}
    </Link>
  );
}
