import type { Metadata } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import { Providers } from '@/components/providers/Providers';
import { AppShell } from '@/components/shell/AppShell';
import './globals.css';

const barlow = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-display',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'BS Hoops',
  description: 'Build your dynasty. Run the franchise.',
};

export const viewport = {
  themeColor: '#E66B00',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${inter.variable}`}>
      <head>
        {/* Dark-mode bootstrap — runs before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('bshoops-theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased min-h-screen font-sans" style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
