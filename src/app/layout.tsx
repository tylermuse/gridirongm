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
        {/* Theme bootstrap — runs before paint so the dark theme doesn't
            flash light. Reads the persisted preference (or OS default) and
            stamps data-theme on <html>. The Settings → Appearance toggle
            keeps this in sync at runtime. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bsfootball-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased min-h-screen">
        <Providers>
          {children}
          <FeedbackWidget />
        </Providers>
      </body>
    </html>
  );
}
