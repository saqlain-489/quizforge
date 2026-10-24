import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'quizforge · a checked, source-cited quiz from any document',
  description:
    'Live demo of quizforge, a TypeScript multi-agent pipeline: a planner, writers, deterministic checks and a two-tier judge turn a document into a quiz where every answer cites its source.',
  authors: [{ name: 'Saqlain Ahmad', url: 'https://github.com/saqlain-489' }],
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
