import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Naga Smart Park | Naga City People\'s Mall',
  description: 'Smart QR-based parking management system for Naga City People\'s Mall',
  icons: {
    icon: '/logo.jpg',
    apple: '/logo.jpg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.jpg" type="image/jpeg" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
