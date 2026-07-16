import type { Metadata } from 'next';
import './globals.css';
import './luna-app.css';

export const metadata: Metadata = {
  title: 'Luna by Gambix | Local Visibility Operating System',
  description: 'Managed local SEO, website optimization, content, approvals and reporting for service businesses.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
