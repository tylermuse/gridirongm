import type { Metadata } from 'next';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gridiron GM',
  description: 'Build your dynasty. Run the franchise.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
