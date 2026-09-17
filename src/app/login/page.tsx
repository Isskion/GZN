'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { login } from '@/app/actions/auth';
import { Eye, EyeOff, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[var(--color-accent)] hover:opacity-95 text-[#f2f2f3] font-heading font-semibold text-[13px] tracking-[0.14em] uppercase transition-all shadow-sm disabled:opacity-50 cursor-pointer"
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-[#f2f2f3]" />
          <span>Verificando credenciales...</span>
        </>
      ) : (
        <span>Iniciar sesión táctica</span>
      )}
    </button>
  );
}

function LoginCard() {
  const [showPassword, setShowPassword] = useState(false);
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  return (
    <div className="w-full max-w-[420px]">
      {/* Mobile Branding (oculto en desktop) */}
      <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
        <img
          src="/logo/gzn-mark.svg"
          alt="GZN Escudo"
          className="w-10 h-10 object-contain"
        />
        <div className="flex flex-col">
          <span className="font-heading font-bold text-[20px] tracking-[0.08em] leading-none text-[var(--color-text)]">
            GZN
          </span>
          <span className="font-body text-[9px] tracking-[0.18em] uppercase opacity-60 text-[var(--color-text)]">
            Green Zone Navigator
          </span>
        </div>
      </div>

      {/* Contenedor Blueprint Industry */}
      <div className="blueprint relative border border-[var(--color-divider)] bg-[var(--color-surface)] p-8 shadow-md">
        {/* Marcadores de esquina tácticos (+) */}
        <span className="absolute -top-1.5 -left-1.5 text-[11px] font-mono leading-none text-[var(--color-accent)] opacity-60 select-none">
          +
        </span>
        <span className="absolute -top-1.5 -right-1.5 text-[11px] font-mono leading-none text-[var(--color-accent)] opacity-60 select-none">
          +
        </span>
        <span className="absolute -bottom-1.5 -left-1.5 text-[11px] font-mono leading-none text-[var(--color-accent)] opacity-60 select-none">
          +
        </span>
        <span className="absolute -bottom-1.5 -right-1.5 text-[11px] font-mono leading-none text-[var(--color-accent)] opacity-60 select-none">
          +
        </span>

        {/* Encabezado del Formulario */}
        <div className="mb-6 border-b border-[var(--color-divider)] pb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <h2 className="font-heading font-bold text-[19px] tracking-[0.08em] uppercase text-[var(--color-text)]">
              Acceso a Consola RSO
            </h2>
          </div>
          <p className="font-body text-xs text-[var(--color-text)] opacity-60">
            Acreditación operativa de personal de seguridad y mando
          </p>
        </div>

        {/* Banner de error de Supabase si existe fallo */}
        {errorParam && (
          <div
            role="alert"
            className="mb-6 p-3.5 border border-[var(--risk-crit)] bg-[color-mix(in_srgb,var(--risk-crit)_10%,transparent)] flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 text-[var(--risk-crit)] flex-none mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-heading font-semibold text-[11px] tracking-[0.08em] uppercase text-[var(--risk-crit)] mb-0.5">
                Error de autenticación
              </div>
              <p className="font-body text-xs text-[var(--color-text)] opacity-90 leading-snug">
                {errorParam}
              </p>
            </div>
          </div>
        )}

        {/* Formulario que invoca Server Action login(formData) */}
        <form action={login} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block font-heading font-semibold text-[11px] tracking-[0.1em] uppercase text-[var(--color-text)] opacity-75 mb-1.5"
            >
              Email corporativo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="operador@gzn.org"
              className="w-full px-3.5 py-2.5 bg-[var(--color-bg)] border border-[var(--color-divider)] text-[var(--color-text)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all placeholder:opacity-35"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block font-heading font-semibold text-[11px] tracking-[0.1em] uppercase text-[var(--color-text)] opacity-75 mb-1.5"
            >
              Contraseña de acceso
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 pr-10 bg-[var(--color-bg)] border border-[var(--color-divider)] text-[var(--color-text)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all placeholder:opacity-35"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text)] opacity-45 hover:opacity-100 transition-opacity"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <SubmitButton />
          </div>
        </form>

        {/* Advertencia de Seguridad y OPSEC */}
        <div className="mt-7 pt-4 border-t border-[var(--color-divider)] flex items-start gap-2.5 opacity-60">
          <ShieldAlert className="w-4 h-4 flex-none mt-0.5 text-[var(--color-accent)]" />
          <p className="font-body text-[10.5px] leading-relaxed text-[var(--color-text)]">
            Acceso restringido. Las conexiones no autorizadas o intentos de fuerza bruta son registrados en la traza forense de auditoría.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex bg-[var(--color-bg)] font-body text-[var(--color-text)] select-none">
      {/* Panel Hero Táctico (Desktop: 48% ancho, oscuro en sala de operaciones) */}
      <div className="hidden lg:flex flex-[1.1] relative flex-col justify-between p-12 overflow-hidden bg-[#151718] text-[#f2f2f3] border-r border-[#2d3033]">
        {/* Fondo sutil con cuadrícula técnica de sala táctica */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #5980a6 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Encabezado de Marca en Hero */}
        <div className="relative z-10 flex items-center gap-3">
          <img
            src="/logo/gzn-mark.svg"
            alt="GZN Escudo"
            className="w-8 h-8 object-contain"
          />
          <div className="flex flex-col">
            <span className="font-heading font-bold text-[18px] tracking-[0.1em] leading-none text-[#f2f2f3]">
              GZN
            </span>
            <span className="font-body text-[9px] tracking-[0.18em] uppercase text-[#7ea0c2]">
              Green Zone Navigator · C2 Tactical
            </span>
          </div>
        </div>

        {/* Centro Ceremonial: Sello Completo y Kicker Táctico */}
        <div className="relative z-10 my-auto py-10 max-w-[480px]">
          <div className="mb-6">
            <img
              src="/logo/gzn-seal-full.svg"
              alt="Sello Oficial GZN"
              className="w-44 h-44 object-contain filter drop-shadow-[0_4px_24px_rgba(47,74,99,0.5)]"
            />
          </div>

          <div className="font-heading font-semibold text-[11px] tracking-[0.2em] uppercase text-[#5980a6] mb-2">
            Mando y Control Operativo (C2)
          </div>
          <h1 className="font-heading font-bold text-[36px] tracking-[0.02em] leading-[1.15] text-[#f2f2f3] mb-4">
            Protección y movilidad táctica para personal y convoyes.
          </h1>
          <p className="font-body text-sm text-[#cbd5e1] leading-relaxed opacity-85">
            Cartografía especializada con motor HERE, geocercas activas PostGIS, triaje de alertas críticas y soporte fuera de línea para terminales de campo.
          </p>
        </div>

        {/* Franja de Métricas Técnicas y OPSEC */}
        <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-[#94a3b8]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-heading text-[11px] tracking-[0.08em] uppercase text-[#e2e8f0]">
              C2 Engine Online
            </span>
          </div>
          <div className="font-mono text-[10.5px] opacity-75">
            POSTGIS · AES-256
          </div>
          <div className="font-heading text-[11px] tracking-[0.08em] uppercase text-[#7ea0c2]">
            DPIA AUDITED
          </div>
        </div>
      </div>

      {/* Panel de Formulario */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
            </div>
          }
        >
          <LoginCard />
        </Suspense>
      </div>
    </div>
  );
}
