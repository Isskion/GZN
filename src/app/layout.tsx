import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GZN · Consola RSO | Green Zone Navigator',
  description: 'Sistema de protección y movilidad táctica para personal y convoyes en zonas de riesgo.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" data-dir="sala">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
