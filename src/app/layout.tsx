import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#63b9ff',
};

export const metadata: Metadata = {
  title: 'AI Radar — 个人 AI 技术雷达',
  description: '自动追踪 GitHub 上最新的 AI 项目、技术动态',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/logo-mark.svg',
    shortcut: '/icons/logo-mark.svg',
    apple: '/icons/logo-mark.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AI Radar',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
