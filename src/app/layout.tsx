import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gridiron GM',
  description: 'Build your dynasty. Run the franchise.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
