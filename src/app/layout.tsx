import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Luna by Gambix',
  description: 'Managed local SEO workflows with bounded AI usage controls.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
