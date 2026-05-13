import type { Metadata } from 'next';
import Script from 'next/script';
import { Barlow_Condensed } from 'next/font/google';
import { Providers } from '@/components/providers/Providers';
import { FeedbackWidget } from '@/components/game/FeedbackWidget';
import { ServiceWorkerRegister } from '@/components/providers/ServiceWorkerRegister';
import './globals.css';

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'BS Football',
  description: 'Build your dynasty. Run the franchise.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'BS Football',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.svg',
  },
};

export const viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={barlowCondensed.variable}>
      <head>
        {/* Theme bootstrap — runs before paint so dark-mode users don't
            get a flash of light. Default is light; dark only stamps when
            the user has explicitly opted in via Settings → Appearance.
            (OS prefers-color-scheme is intentionally ignored — testers
            were getting dark mode without ever asking for it.) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('bsfootball-theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased min-h-screen">
        <Providers>
          {children}
          <FeedbackWidget />
          <ServiceWorkerRegister />
        </Providers>
        {/* Google AdSense loader — only injected when an AdSense client ID is
            configured. Free-tier users see ads via <AdSlot />; paying tiers
            never render the slots so this script effectively no-ops for them. */}
        {ADSENSE_CLIENT_ID && (
          <Script
            id="adsense-loader"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
          />
        )}
      </body>
    </html>
  );
}
