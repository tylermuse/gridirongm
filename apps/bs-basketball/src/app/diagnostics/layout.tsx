import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diagnostics',
  robots: { index: false, follow: false },
};

export default function DiagnosticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
