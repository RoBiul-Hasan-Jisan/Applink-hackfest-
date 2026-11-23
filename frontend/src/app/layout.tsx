import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import '@/styles/globals.css';
export const metadata: Metadata = { title: 'DengueZero ActionNet', description: 'Evidence-first dengue prevention coordination' };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body><Providers>{children}</Providers></body></html>; }
