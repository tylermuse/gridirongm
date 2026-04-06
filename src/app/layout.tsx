import type { Metadata } from 'next';
import { Barlow_Condensed } from 'next/font/google';
import { Providers } from '@/components/providers/Providers';
import { FeedbackWidget } from '@/components/game/FeedbackWidget';
import './globals.css';

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'BS Football',
  description: 'Build your dynasty. Run the franchise.',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={barlowCondensed.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
        <Providers>
          {children}
          <FeedbackWidget />
        </Providers>
      </body>
    </html>
  );
}
