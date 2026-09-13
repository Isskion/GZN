import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GZN — Consola de Mando RSO | Secure Route',
  description: 'Sistema de protección y movilidad táctica para personal y convoyes en zonas de riesgo.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
