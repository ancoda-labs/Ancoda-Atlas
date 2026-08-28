import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'ANCODA ATLAS INTELLIGENCE DASHBOARD',
  description: 'Nepal Focus · 19 Sources · Local',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground font-sans min-h-screen overflow-x-hidden selection:bg-primary selection:text-background" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
