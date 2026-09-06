import type { Metadata } from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'LessonLedger: Keep every lesson current.', template: '%s | LessonLedger' },
  description: 'Monitor source changes, review evidence, and prepare precise lesson updates.',
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
