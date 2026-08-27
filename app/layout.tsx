import type { Metadata } from 'next';
import './globals.css';

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
      <body className="bg-bg text-textColor font-sans min-h-screen overflow-x-hidden selection:bg-accent selection:text-bg" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
