import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'ANCODA ATLAS INTELLIGENCE DASHBOARD',
  description: 'Nepal Focus · 19 Sources · Local',
  icons: {
    icon: [
      { url: '/images/atlas-black.png', media: '(prefers-color-scheme: light)' },
      { url: '/images/atlas-white.png', media: '(prefers-color-scheme: dark)' },
    ],
    apple: '/images/atlas-black.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Same rule as src/lib/connection-pref.ts — applied before first paint. */
const SEED_LOW_PERF = `(function(){try{var k='atlas_low_perf';var s=localStorage.getItem(k);var n=navigator.connection||navigator.mozConnection||navigator.webkitConnection;var slow=n&&(n.saveData||n.effectiveType==='2g'||n.effectiveType==='slow-2g');if(s==='true'||(s!=='false'&&slow)){document.documentElement.classList.add('low-perf');document.body.classList.add('low-perf');if(s===null&&slow)localStorage.setItem(k,'true');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/GeistPixel-Square.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-background text-foreground font-sans min-h-screen overflow-x-hidden selection:bg-primary selection:text-background" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: SEED_LOW_PERF }} />
        {children}
      </body>
    </html>
  );
}
