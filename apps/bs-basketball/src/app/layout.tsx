import type { Metadata } from 'next';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'BS Hoops',
  description: 'Build your dynasty. Run the franchise.',
};

export const viewport = {
  themeColor: '#E66B00', // basketball orange (matches basketballUiMetadata.themeOverrides)
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Theme bootstrap — runs before paint so dark-mode users don't
            get a flash of light. Same convention as the football app. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('bshoops-theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
